const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const Paystack = require('paystack-node');
const Flutterwave = require('flutterwave-node');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize payment providers
const paystack = new Paystack(process.env.PAYSTACK_SECRET_KEY);
const flutterwave = new Flutterwave(process.env.FLUTTERWAVE_PUBLIC_KEY, process.env.FLUTTERWAVE_SECRET_KEY);

// Cart storage (in production, use a database)
let carts = {};

// Helper function to generate order ID
function generateOrderId() {
    return 'SV-' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Backend server is running' });
});

// Payment success page
app.get('/payment/success', async (req, res) => {
    const { reference, provider } = req.query;

    try {
        let verificationResult = null;

        // Verify payment with the provider
        if (provider === 'paystack') {
            const response = await paystack.verifyTransaction(reference);
            verificationResult = response.data;
        } else if (provider === 'flutterwave') {
            const response = await flutterwave.Transaction.verify({ id: reference });
            verificationResult = response.data;
        }

        // Check if payment was successful
        const isSuccessful = (provider === 'paystack' && verificationResult.status === 'success') ||
                           (provider === 'flutterwave' && verificationResult.status === 'successful');

        if (!isSuccessful) {
            // Redirect to failure page
            return res.redirect(`/payment/failed?reference=${reference}&provider=${provider}&reason=Payment verification failed`);
        }

        // Update cart status if verification successful
        const sessionId = provider === 'paystack' ? verificationResult.metadata.sessionId : verificationResult.meta.sessionId;
        if (carts[sessionId]) {
            carts[sessionId].status = 'paid';
            carts[sessionId].paymentDetails = {
                provider,
                reference,
                amount: provider === 'paystack' ? verificationResult.amount / 100 : verificationResult.amount,
                paidAt: new Date()
            };
        }

        // Show success page
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Payment Successful - Speaking Virtue</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            </head>
            <body class="bg-gray-50 min-h-screen flex items-center justify-center p-4">
                <div class="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                    <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-check-circle text-2xl text-green-600"></i>
                    </div>
                    <h1 class="text-2xl font-bold text-gray-900 mb-2 font-serif">Payment Successful!</h1>
                    <p class="text-gray-600 mb-6">Thank you for your purchase. Your order has been confirmed.</p>
                    <div class="bg-gray-50 p-4 rounded-lg mb-6">
                        <p class="text-sm text-gray-500">Reference: <span class="font-mono">${reference}</span></p>
                        <p class="text-sm text-gray-500">Provider: ${provider}</p>
                    </div>
                    <button onclick="window.location.href='http://localhost:8080'" class="w-full bg-purple-600 text-white py-3 px-6 rounded-lg hover:bg-purple-700 transition-colors font-medium">
                        Continue Shopping
                    </button>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('Payment verification error:', error);
        // Redirect to failure page on verification error
        res.redirect(`/payment/failed?reference=${reference}&provider=${provider}&reason=Verification error`);
    }
});

// Payment failure page
app.get('/payment/failed', (req, res) => {
    const { reference, provider, reason } = req.query;
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment Failed - Speaking Virtue</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        </head>
        <body class="bg-gray-50 min-h-screen flex items-center justify-center p-4">
            <div class="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-times-circle text-2xl text-red-600"></i>
                </div>
                <h1 class="text-2xl font-bold text-gray-900 mb-2 font-serif">Payment Failed</h1>
                <p class="text-gray-600 mb-6">Unfortunately, your payment could not be processed. Please try again.</p>
                <div class="bg-gray-50 p-4 rounded-lg mb-6">
                    <p class="text-sm text-gray-500">Reference: <span class="font-mono">${reference || 'N/A'}</span></p>
                    <p class="text-sm text-gray-500">Provider: ${provider || 'N/A'}</p>
                    ${reason ? `<p class="text-sm text-red-500">Reason: ${reason}</p>` : ''}
                </div>
                <div class="space-y-3">
                    <button onclick="window.location.href='http://localhost:8080'" class="w-full bg-purple-600 text-white py-3 px-6 rounded-lg hover:bg-purple-700 transition-colors font-medium">
                        Try Again
                    </button>
                    <button onclick="window.location.href='http://localhost:8080#cart'" class="w-full bg-gray-200 text-gray-700 py-3 px-6 rounded-lg hover:bg-gray-300 transition-colors font-medium">
                        Back to Cart
                    </button>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Create cart session
app.post('/api/cart/create', (req, res) => {
    const { items, total } = req.body;
    const sessionId = generateOrderId();

    carts[sessionId] = {
        items,
        total,
        createdAt: new Date(),
        status: 'pending'
    };

    res.json({
        success: true,
        sessionId,
        message: 'Cart session created successfully'
    });
});

// Get cart session
app.get('/api/cart/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const cart = carts[sessionId];

    if (!cart) {
        return res.status(404).json({
            success: false,
            message: 'Cart session not found'
        });
    }

    res.json({
        success: true,
        cart
    });
});

// Paystack payment initialization
app.post('/paystack/initiate', async (req, res) => {
    try {
        const { sessionId, email, amount, items } = req.body;

        console.log(`[Paystack] Initializing payment for ${email}. Session ID: ${sessionId}`);

        // Ensure cart exists in memory for verification later
        if (!carts[sessionId]) {
            carts[sessionId] = {
                items: items || [],
                total: amount,
                email,
                createdAt: new Date(),
                status: 'pending'
            };
        }

        // Convert amount to kobo (Paystack uses kobo, 1 USD ≈ 1500 NGN, so 1 USD = 150000 kobo)
        // For simplicity, assuming amount is in USD and converting to NGN kobo
        const amountInKobo = Math.round(amount * 150000); // Adjust exchange rate as needed

        const response = await paystack.initializeTransaction({
            amount: amountInKobo,
            email,
            reference: sessionId,
            callback_url: `${req.protocol}://${req.get('host')}/payment/success?reference=${sessionId}&provider=paystack`,
            metadata: JSON.stringify({
                sessionId,
                paymentProvider: 'paystack'
            })
        });

        res.json({
            success: true,
            paymentUrl: response.data.authorization_url,
            reference: response.data.reference,
            message: 'Paystack payment initialized successfully'
        });

    } catch (error) {
        console.error('Paystack initialization error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initialize Paystack payment',
            error: error.message
        });
    }
});

// Paystack payment verification
app.get('/paystack/verify/:reference', async (req, res) => {
    try {
        const { reference } = req.params;
        console.log("Verifying Paystack reference:", reference);

        const response = await paystack.verifyTransaction(reference);

        if (response.data.status === 'success') {
            // Update cart status
            const sessionId = response.data.metadata.sessionId;
            if (carts[sessionId]) {
                carts[sessionId].status = 'paid';
                carts[sessionId].paymentDetails = {
                    provider: 'paystack',
                    reference,
                    amount: response.data.amount / 100,
                    paidAt: new Date()
                };
            }

            res.json({
                success: true,
                message: 'Payment verified successfully',
                orderId: generateOrderId(),
                paymentDetails: response.data
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Payment verification failed',
                details: response.data
            });
        }

    } catch (error) {
        console.error('Paystack verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Payment verification failed',
            error: error.message
        });
    }
});

// Flutterwave payment initialization
app.post('/flutterwave/initiate', async (req, res) => {
    try {
        const { sessionId, email, amount, items, name } = req.body;

        console.log(`[Flutterwave] Initializing payment for ${email}. Session ID: ${sessionId}`);

        // Ensure cart exists in memory for verification later
        if (!carts[sessionId]) {
            carts[sessionId] = {
                items: items || [],
                total: amount,
                email,
                createdAt: new Date(),
                status: 'pending'
            };
        }

        const payload = {
            tx_ref: sessionId,
            amount,
            currency: 'USD',
            redirect_url: `${req.protocol}://${req.get('host')}/payment/success?reference=${sessionId}&provider=flutterwave`,
            customer: {
                email,
                name: name || 'Customer'
            },
            customizations: {
                title: 'Speaking Virtue Purchase',
                description: 'Payment for formational resources'
            },
            meta: {
                sessionId,
                paymentProvider: 'flutterwave'
            }
        };

        const response = await flutterwave.Charge.card(payload);

        res.json({
            success: true,
            paymentUrl: response.data.link,
            reference: response.data.tx_ref,
            message: 'Flutterwave payment initialized successfully'
        });

    } catch (error) {
        console.error('Flutterwave initialization error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initialize Flutterwave payment',
            error: error.message
        });
    }
});

// Flutterwave payment verification
app.get('/flutterwave/verify/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const response = await flutterwave.Transaction.verify({ id });

        if (response.data.status === 'successful') {
            // Update cart status
            const sessionId = response.data.meta.sessionId;
            if (carts[sessionId]) {
                carts[sessionId].status = 'paid';
                carts[sessionId].paymentDetails = {
                    provider: 'flutterwave',
                    reference: id,
                    amount: response.data.amount,
                    paidAt: new Date()
                };
            }

            res.json({
                success: true,
                message: 'Payment verified successfully',
                orderId: generateOrderId(),
                paymentDetails: response.data
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Payment verification failed',
                details: response.data
            });
        }

    } catch (error) {
        console.error('Flutterwave verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Payment verification failed',
            error: error.message
        });
    }
});

// Webhook endpoints for payment confirmations
app.post('/api/webhooks/paystack', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        const hash = require('crypto').createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex');

        if (hash !== req.headers['x-paystack-signature']) {
            return res.status(400).send('Invalid signature');
        }

        const event = req.body;

        if (event.event === 'charge.success') {
            const metadata = JSON.parse(event.data.metadata);
            const sessionId = metadata.sessionId;
            if (carts[sessionId]) {
                carts[sessionId].status = 'paid';
                carts[sessionId].paymentDetails = {
                    provider: 'paystack',
                    reference: event.data.reference,
                    amount: event.data.amount / 100,
                    paidAt: new Date()
                };
            }
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('Paystack webhook error:', error);
        res.status(500).send('Webhook processing failed');
    }
});

app.post('/api/webhooks/flutterwave', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const secret = process.env.FLUTTERWAVE_SECRET_KEY;
        const hash = require('crypto').createHmac('sha256', secret).update(req.body).digest('hex');

        if (hash !== req.headers['verif-hash']) {
            return res.status(400).send('Invalid signature');
        }

        const event = JSON.parse(req.body);

        if (event.event === 'charge.completed' && event.data.status === 'successful') {
            const sessionId = event.data.meta.sessionId;
            if (carts[sessionId]) {
                carts[sessionId].status = 'paid';
                carts[sessionId].paymentDetails = {
                    provider: 'flutterwave',
                    reference: event.data.tx_ref,
                    amount: event.data.amount,
                    paidAt: new Date()
                };
            }
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('Flutterwave webhook error:', error);
        res.status(500).send('Webhook processing failed');
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Speaking Virtue backend server running on port ${PORT}`);
    console.log('Payment providers initialized: Paystack and Flutterwave');
});

module.exports = app;
