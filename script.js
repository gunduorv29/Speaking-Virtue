// Payment Integration Script for Speaking Virtue
// Integrates Paystack and Flutterwave with failover logic

class PaymentManager {
    constructor() {
        this.paystackPublicKey = 'pk_test_your_paystack_public_key_here'; // Replace with actual key
        this.flutterwavePublicKey = 'FLWPUBK_TEST-your_flutterwave_public_key_here'; // Replace with actual key
        this.backendUrl = 'http://localhost:3001'; // Update for production
        this.currentProvider = null;
        this.sessionId = null;
    }

    // Initialize payment with primary provider (Paystack), fallback to Flutterwave
    async initializePayment(cartItems, customerEmail) {
        this.sessionId = this.generateSessionId();

        // Calculate total amount in dollars
        const total = cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0);

        try {
            // Try Paystack first
            console.log('Attempting payment with Paystack...');
            const paystackResult = await this.initializePaystackPayment(total, customerEmail, cartItems);
            this.currentProvider = 'paystack';
            return paystackResult;
        } catch (error) {
            console.warn('Paystack initialization failed:', error);
            try {
                // Fallback to Flutterwave
                console.log('Falling back to Flutterwave...');
                const flutterwaveResult = await this.initializeFlutterwavePayment(total, customerEmail, cartItems);
                this.currentProvider = 'flutterwave';
                return flutterwaveResult;
            } catch (fallbackError) {
                console.error('Both payment providers failed:', fallbackError);
                throw new Error('Unable to initialize payment with any provider. Please try again later.');
            }
        }
    }

    // Initialize Paystack payment
    async initializePaystackPayment(amountInKobo, email, cartItems) {
        const response = await fetch(`${this.backendUrl}/paystack/initiate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount: amountInKobo,
                email: email,
                sessionId: this.sessionId,
                items: cartItems
            })
        });

        if (!response.ok) {
            throw new Error(`Paystack initialization failed: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || 'Paystack initialization failed');
        }

        return {
            provider: 'paystack',
            paymentUrl: data.paymentUrl,
            reference: data.reference
        };
    }

    // Initialize Flutterwave payment
    async initializeFlutterwavePayment(amount, email, cartItems) {
        const response = await fetch(`${this.backendUrl}/flutterwave/initiate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount: amount,
                email: email,
                sessionId: this.sessionId,
                items: cartItems
            })
        });

        if (!response.ok) {
            throw new Error(`Flutterwave initialization failed: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || 'Flutterwave initialization failed');
        }

        return {
            provider: 'flutterwave',
            paymentUrl: data.paymentUrl,
            reference: data.reference
        };
    }

    // Verify payment status
    async verifyPayment(reference, provider) {
        const endpoint = provider === 'paystack'
            ? `/paystack/verify/${reference}`
            : `/flutterwave/verify/${reference}`;

        try {
            const response = await fetch(`${this.backendUrl}${endpoint}`);
            if (!response.ok) {
                throw new Error(`Verification failed: ${response.statusText}`);
            }

            const data = await response.json();
            return {
                success: data.success,
                status: data.status,
                data: data.data
            };
        } catch (error) {
            console.error('Payment verification error:', error);
            return { success: false, error: error.message };
        }
    }

    // Generate unique session ID
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Handle payment success callback
    handlePaymentSuccess(reference, provider) {
        // Redirect to success page or show success message
        console.log(`Payment successful with ${provider}:`, reference);
        // You can redirect to a success page or update UI here
        alert(`Payment successful! Reference: ${reference}`);
        // Clear cart after successful payment
        cart.length = 0;
        updateCartUI();
        closeCheckout();
    }

    // Handle payment failure
    handlePaymentFailure(reference, provider, reason) {
        console.error(`Payment failed with ${provider}:`, reason);
        alert(`Payment failed: ${reason}. Please try again.`);
    }
}

// Global payment manager instance
const paymentManager = new PaymentManager();

// Enhanced checkout function
async function processCheckout() {
    const emailInput = document.querySelector('#checkout-modal input[type="email"]');
    const email = emailInput ? emailInput.value : '';

    if (!email) {
        alert('Please enter your email address');
        return;
    }

    if (cart.length === 0) {
        alert('Your cart is empty');
        return;
    }

    try {
        // Show loading state
        const submitBtn = document.querySelector('#checkout-modal button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';
        }

        // Initialize payment
        const paymentResult = await paymentManager.initializePayment(cart, email);

        // Redirect to payment gateway
        if (paymentResult.paymentUrl) {
            window.location.href = paymentResult.paymentUrl;
        } else {
            throw new Error('No payment URL received');
        }

    } catch (error) {
        console.error('Checkout error:', error);
        alert(`Checkout failed: ${error.message}`);

        // Reset button
        const submitBtn = document.querySelector('#checkout-modal button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Pay Now';
        }
    }
}

// Check for payment callback on page load
function checkPaymentCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const reference = urlParams.get('reference');
    const provider = urlParams.get('provider');

    if (reference && provider) {
        // Verify payment status
        paymentManager.verifyPayment(reference, provider).then(result => {
            if (result.success && result.status === 'paid') {
                paymentManager.handlePaymentSuccess(reference, provider);
            } else {
                paymentManager.handlePaymentFailure(reference, provider, 'Payment verification failed');
            }
        }).catch(error => {
            paymentManager.handlePaymentFailure(reference, provider, error.message);
        });
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Check for payment callback
    checkPaymentCallback();

    // Update checkout form to use our payment processing
    const checkoutForm = document.querySelector('#checkout-modal form');
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', function(e) {
            e.preventDefault();
            processCheckout();
        });
    }
});

// Export for use in other scripts
window.PaymentManager = PaymentManager;
window.paymentManager = paymentManager;
