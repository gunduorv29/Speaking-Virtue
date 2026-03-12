const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const crypto = require('crypto');
const Paystack = require('paystack-node');
const Flutterwave = require('flutterwave-node');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ─── CORS ────────────────────────────────────────────────────────────────────
// In production set ALLOWED_ORIGIN=https://yourdomain.com in .env
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:8080';
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. server-to-server, curl)
        if (!origin || origin === allowedOrigin) return callback(null, true);
        callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

// ─── PAYMENT PROVIDERS ───────────────────────────────────────────────────────
const paystack = new Paystack(process.env.PAYSTACK_SECRET_KEY);
const flutterwave = new Flutterwave(
    process.env.FLUTTERWAVE_PUBLIC_KEY,
    process.env.FLUTTERWAVE_SECRET_KEY
);

// ─── IN-MEMORY CART (replace with a DB in production) ───────────────────────
let carts = {};

function generateOrderId() {
    return 'SV-' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Helper: build the base URL for redirect callbacks
function baseUrl(req) {
    const proto = process.env.BASE_URL
        ? ''          // BASE_URL already contains protocol + host
        : `${req.protocol}://${req.get('host')}`;
    return process.env.BASE_URL || proto;
}

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Backend server is running' });
});

// ─── CART ────────────────────────────────────────────────────────────────────
app.post('/api/cart/create', (req, res) => {
    const { items, total } = req.body;
    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ success: false, message: 'Invalid cart data' });
    }
    const sessionId = generateOrderId();
    carts[sessionId] = { items, total, createdAt: new Date(), status: 'pending' };
    res.json({ success: true, sessionId });
});

app.get('/api/cart/:sessionId', (req, res) => {
    const cart = carts[req.params.sessionId];
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });
    res.json({ success: true, cart });
});

// ─── PAYSTACK ────────────────────────────────────────────────────────────────
// POST /api/payment/paystack/initiate
app.post('/api/payment/paystack/initiate', async (req, res) => {
    try {
        const { sessionId, email, amount, items } = req.body;
        if (!sessionId || !email || !amount) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        // Persist cart if it doesn't exist yet
        if (!carts[sessionId]) {
            carts[sessionId] = { items: items || [], total: amount, email, createdAt: new Date(), status: 'pending' };
        }

        // Paystack expects kobo. Amount arrives as USD; convert at a configurable rate.
        // Set EXCHANGE_RATE_USD_NGN in .env (e.g. 1500). Kobo = NGN * 100.
        const exchangeRate = Number(process.env.EXCHANGE_RATE_USD_NGN) || 1500;
        const amountInKobo = Math.round(amount * exchangeRate * 100);

        const callbackUrl = `${baseUrl(req)}/payment/success?reference=${sessionId}&provider=paystack`;

        const response = await paystack.initializeTransaction({
            amount: amountInKobo,
            email,
            reference: sessionId,
            callback_url: callbackUrl,
            // Store metadata as an object – Paystack returns it parsed
            metadata: {
                sessionId,
                paymentProvider: 'paystack',
            },
        });

        res.json({
            success: true,
            paymentUrl: response.data.authorization_url,
            reference: response.data.reference,
        });
    } catch (error) {
        console.error('[Paystack] initiate error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to initialize Paystack payment', error: error.message });
    }
});

// GET /api/payment/paystack/verify/:reference
app.get('/api/payment/paystack/verify/:reference', async (req, res) => {
    try {
        const { reference } = req.params;
        const response = await paystack.verifyTransaction(reference);
        const txData = response.data;

        if (txData.status === 'success') {
            // metadata is returned as an object by Paystack (not a string)
            const meta = txData.metadata || {};
            const sessionId = meta.sessionId || reference;

            if (carts[sessionId]) {
                carts[sessionId].status = 'paid';
                carts[sessionId].paymentDetails = {
                    provider: 'paystack',
                    reference,
                    amount: txData.amount / 100,
                    paidAt: new Date(),
                };
            }

            res.json({ success: true, orderId: generateOrderId(), paymentDetails: txData });
        } else {
            res.status(400).json({ success: false, message: 'Payment verification failed', details: txData });
        }
    } catch (error) {
        console.error('[Paystack] verify error:', error.message);
        res.status(500).json({ success: false, message: 'Verification failed', error: error.message });
    }
});

// ─── FLUTTERWAVE ─────────────────────────────────────────────────────────────
// POST /api/payment/flutterwave/initiate
app.post('/api/payment/flutterwave/initiate', async (req, res) => {
    try {
        const { sessionId, email, amount, items, name } = req.body;
        if (!sessionId || !email || !amount) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        if (!carts[sessionId]) {
            carts[sessionId] = { items: items || [], total: amount, email, createdAt: new Date(), status: 'pending' };
        }

        const redirectUrl = `${baseUrl(req)}/payment/success?reference=${sessionId}&provider=flutterwave`;

        const payload = {
            tx_ref: sessionId,
            amount,
            currency: process.env.CURRENCY || 'USD',
            redirect_url: redirectUrl,
            customer: { email, name: name || 'Customer' },
            customizations: {
                title: 'Speaking Virtue Purchase',
                description: 'Payment for formational resources',
            },
            meta: { sessionId, paymentProvider: 'flutterwave' },
        };

        const response = await flutterwave.Charge.card(payload);

        res.json({
            success: true,
            paymentUrl: response.data.link,
            reference: response.data.tx_ref,
        });
    } catch (error) {
        console.error('[Flutterwave] initiate error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to initialize Flutterwave payment', error: error.message });
    }
});

// GET /api/payment/flutterwave/verify/:id
app.get('/api/payment/flutterwave/verify/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const response = await flutterwave.Transaction.verify({ id });
        const txData = response.data;

        if (txData.status === 'successful') {
            const sessionId = (txData.meta && txData.meta.sessionId) || id;
            if (carts[sessionId]) {
                carts[sessionId].status = 'paid';
                carts[sessionId].paymentDetails = {
                    provider: 'flutterwave',
                    reference: id,
                    amount: txData.amount,
                    paidAt: new Date(),
                };
            }
            res.json({ success: true, orderId: generateOrderId(), paymentDetails: txData });
        } else {
            res.status(400).json({ success: false, message: 'Payment verification failed', details: txData });
        }
    } catch (error) {
        console.error('[Flutterwave] verify error:', error.message);
        res.status(500).json({ success: false, message: 'Verification failed', error: error.message });
    }
});

// ─── PAYMENT RESULT PAGES ────────────────────────────────────────────────────
app.get('/payment/success', async (req, res) => {
    const { reference, provider } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';

    try {
        let isSuccessful = false;

        if (provider === 'paystack') {
            const response = await paystack.verifyTransaction(reference);
            isSuccessful = response.data.status === 'success';

            if (isSuccessful) {
                const meta = response.data.metadata || {};
                const sessionId = meta.sessionId || reference;
                if (carts[sessionId]) {
                    carts[sessionId].status = 'paid';
                    carts[sessionId].paymentDetails = {
                        provider,
                        reference,
                        amount: response.data.amount / 100,
                        paidAt: new Date(),
                    };
                }
            }
        } else if (provider === 'flutterwave') {
            const response = await flutterwave.Transaction.verify({ id: reference });
            isSuccessful = response.data.status === 'successful';

            if (isSuccessful) {
                const sessionId = (response.data.meta && response.data.meta.sessionId) || reference;
                if (carts[sessionId]) {
                    carts[sessionId].status = 'paid';
                    carts[sessionId].paymentDetails = {
                        provider,
                        reference,
                        amount: response.data.amount,
                        paidAt: new Date(),
                    };
                }
            }
        }

        if (!isSuccessful) {
            return res.redirect(`/payment/failed?reference=${reference}&provider=${provider}&reason=Verification+failed`);
        }

        res.send(buildSuccessPage(reference, provider, frontendUrl));
    } catch (error) {
        console.error('[Payment] success callback error:', error.message);
        res.redirect(`/payment/failed?reference=${reference}&provider=${provider}&reason=Server+error`);
    }
});

app.get('/payment/failed', (req, res) => {
    const { reference, provider, reason } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    res.send(buildFailedPage(reference, provider, reason, frontendUrl));
});

// ─── WEBHOOKS ────────────────────────────────────────────────────────────────
// Paystack webhook – uses HMAC-SHA512 with your secret key
app.post('/api/webhooks/paystack', express.raw({ type: 'application/json' }), (req, res) => {
    try {
        const signature = req.headers['x-paystack-signature'];
        const hash = crypto
            .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
            .update(req.body)           // req.body is a Buffer here (express.raw)
            .digest('hex');

        if (hash !== signature) {
            console.warn('[Paystack webhook] Invalid signature');
            return res.status(400).send('Invalid signature');
        }

        const event = JSON.parse(req.body.toString());

        if (event.event === 'charge.success') {
            const meta = event.data.metadata || {};
            const sessionId = meta.sessionId;
            if (sessionId && carts[sessionId]) {
                carts[sessionId].status = 'paid';
                carts[sessionId].paymentDetails = {
                    provider: 'paystack',
                    reference: event.data.reference,
                    amount: event.data.amount / 100,
                    paidAt: new Date(),
                };
            }
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('[Paystack webhook] error:', error.message);
        res.status(500).send('Webhook processing failed');
    }
});

// Flutterwave webhook – they send a static secret in the 'verif-hash' header.
// Set FLUTTERWAVE_WEBHOOK_HASH in .env to match what you configured in your
// Flutterwave dashboard under Webhooks → Secret Hash.
app.post('/api/webhooks/flutterwave', express.raw({ type: 'application/json' }), (req, res) => {
    try {
        const secretHash = process.env.FLUTTERWAVE_WEBHOOK_HASH;
        const incomingHash = req.headers['verif-hash'];

        if (!secretHash || incomingHash !== secretHash) {
            console.warn('[Flutterwave webhook] Invalid hash');
            return res.status(400).send('Invalid signature');
        }

        const event = JSON.parse(req.body.toString());

        if (event.event === 'charge.completed' && event.data.status === 'successful') {
            const sessionId = event.data.meta && event.data.meta.sessionId;
            if (sessionId && carts[sessionId]) {
                carts[sessionId].status = 'paid';
                carts[sessionId].paymentDetails = {
                    provider: 'flutterwave',
                    reference: event.data.tx_ref,
                    amount: event.data.amount,
                    paidAt: new Date(),
                };
            }
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('[Flutterwave webhook] error:', error.message);
        res.status(500).send('Webhook processing failed');
    }
});

// ─── ERROR HANDLER ───────────────────────────────────────────────────────────
app.use((error, req, res, next) => {
    console.error('[Server] Unhandled error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

// ─── PAGE TEMPLATES ──────────────────────────────────────────────────────────
function buildSuccessPage(reference, provider, frontendUrl) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Successful – Speaking Virtue</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center p-4 font-sans">
  <div class="max-w-md w-full bg-white rounded-xl shadow-lg p-10 text-center">
    <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
      <i class="fas fa-check-circle text-3xl text-green-600"></i>
    </div>
    <h1 class="text-3xl font-bold text-gray-900 mb-3" style="font-family:'Playfair Display',serif">Payment Successful!</h1>
    <p class="text-gray-500 mb-8">Thank you for your purchase. Your order has been confirmed.</p>
    <div class="bg-gray-50 p-4 rounded-lg mb-8 text-left text-sm text-gray-500 space-y-1">
      <p>Reference: <span class="font-mono font-semibold text-gray-700">${reference}</span></p>
      <p>Provider: <span class="font-semibold text-gray-700 capitalize">${provider}</span></p>
    </div>
    <a href="${frontendUrl}" class="block w-full bg-purple-700 hover:bg-purple-800 text-white py-3 px-6 rounded-lg font-semibold transition-colors">
      Continue Shopping
    </a>
  </div>
</body>
</html>`;
}

function buildFailedPage(reference, provider, reason, frontendUrl) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Failed – Speaking Virtue</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center p-4 font-sans">
  <div class="max-w-md w-full bg-white rounded-xl shadow-lg p-10 text-center">
    <div class="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
      <i class="fas fa-times-circle text-3xl text-red-600"></i>
    </div>
    <h1 class="text-3xl font-bold text-gray-900 mb-3" style="font-family:'Playfair Display',serif">Payment Failed</h1>
    <p class="text-gray-500 mb-8">Your payment could not be processed. Please try again.</p>
    <div class="bg-gray-50 p-4 rounded-lg mb-8 text-left text-sm space-y-1">
      <p class="text-gray-500">Reference: <span class="font-mono font-semibold text-gray-700">${reference || 'N/A'}</span></p>
      <p class="text-gray-500">Provider: <span class="font-semibold text-gray-700 capitalize">${provider || 'N/A'}</span></p>
      ${reason ? `<p class="text-red-500">Reason: ${reason}</p>` : ''}
    </div>
    <div class="space-y-3">
      <a href="${frontendUrl}" class="block w-full bg-purple-700 hover:bg-purple-800 text-white py-3 px-6 rounded-lg font-semibold transition-colors">
        Try Again
      </a>
      <a href="${frontendUrl}#cart" class="block w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-6 rounded-lg font-semibold transition-colors">
        Back to Cart
      </a>
    </div>
  </div>
</body>
</html>`;
}

// ─── START ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Speaking Virtue backend running on port ${PORT}`);
    console.log(`Allowed origin: ${allowedOrigin}`);
});

module.exports = app;
