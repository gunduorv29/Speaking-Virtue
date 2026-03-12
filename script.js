/**
 * Speaking Virtue – Payment Integration
 *
 * This file is intentionally self-contained. It does NOT depend on any globals
 * defined in index.html. Cart state is passed in as arguments.
 *
 * The actual checkout call is wired up inside index.html's processPayment()
 * which calls initializePayment() exported here.
 */

// ─── CONFIG ───────────────────────────────────────────────────────────────────
// Change this one value for every environment. Do NOT hard-code localhost in
// production; inject via a build step or a <meta> tag.
const BACKEND_URL = 'http://localhost:3001';

// ─── ENDPOINTS ────────────────────────────────────────────────────────────────
const ENDPOINTS = {
    cartCreate:           `${BACKEND_URL}/api/cart/create`,
    paystackInitiate:     `${BACKEND_URL}/api/payment/paystack/initiate`,
    flutterwaveInitiate:  `${BACKEND_URL}/api/payment/flutterwave/initiate`,
    paystackVerify:       (ref) => `${BACKEND_URL}/api/payment/paystack/verify/${ref}`,
    flutterwaveVerify:    (id)  => `${BACKEND_URL}/api/payment/flutterwave/verify/${id}`,
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
async function postJSON(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
        throw new Error(data.message || `Request to ${url} failed (${res.status})`);
    }
    return data;
}

async function getJSON(url) {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || !data.success) {
        throw new Error(data.message || `Request to ${url} failed (${res.status})`);
    }
    return data;
}

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────
/**
 * initializePayment
 * @param {Array}  cartItems  – array of { id, title, price, qty }
 * @param {string} email
 * @param {string} name
 * @param {'paystack'|'flutterwave'} provider
 * @returns {Promise<{paymentUrl: string, reference: string, provider: string}>}
 */
async function initializePayment(cartItems, email, name, provider = 'paystack') {
    // 1. Create cart session on the backend
    const { sessionId } = await postJSON(ENDPOINTS.cartCreate, {
        items: cartItems,
        total: cartItems.reduce((s, i) => s + i.price * i.qty, 0),
    });

    const amount = cartItems.reduce((s, i) => s + i.price * i.qty, 0);

    // 2. Try selected provider, fall back to the other if it fails
    const providers = provider === 'paystack'
        ? ['paystack', 'flutterwave']
        : ['flutterwave', 'paystack'];

    let lastError;
    for (const p of providers) {
        try {
            const endpoint = p === 'paystack'
                ? ENDPOINTS.paystackInitiate
                : ENDPOINTS.flutterwaveInitiate;

            const result = await postJSON(endpoint, { sessionId, email, name, amount, items: cartItems });
            return { paymentUrl: result.paymentUrl, reference: result.reference, provider: p };
        } catch (err) {
            console.warn(`[Payment] ${p} initiation failed:`, err.message);
            lastError = err;
        }
    }

    throw lastError || new Error('All payment providers failed');
}

/**
 * verifyPayment
 * @param {string} reference
 * @param {'paystack'|'flutterwave'} provider
 */
async function verifyPayment(reference, provider) {
    const url = provider === 'paystack'
        ? ENDPOINTS.paystackVerify(reference)
        : ENDPOINTS.flutterwaveVerify(reference);
    return getJSON(url);
}

/**
 * checkPaymentCallback – call on page load to handle redirect-back from gateway
 */
function checkPaymentCallback(onSuccess, onFailure) {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference');
    const provider  = params.get('provider');

    if (!reference || !provider) return;

    verifyPayment(reference, provider)
        .then(data => onSuccess && onSuccess(reference, provider, data))
        .catch(err => onFailure && onFailure(reference, provider, err.message));
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────
window.SV = window.SV || {};
window.SV.payment = { initializePayment, verifyPayment, checkPaymentCallback, BACKEND_URL };
