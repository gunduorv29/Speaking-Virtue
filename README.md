# Speaking Virtue – Setup & Deployment Guide

## Project Structure

```
speaking-virtue/
├── index.html                    ← Frontend (single-page app)
├── script.js                     ← Payment module (imported by index.html)
├── index-script-replacement.js   ← Paste this into index.html (see below)
├── .gitignore
├── backend/
│   ├── server.js
│   ├── .env                      ← Real secrets (never commit)
│   ├── .env.example              ← Template to commit
│   └── package.json
```

---

## 1. Apply the index.html Patch

Open `index.html` and make **two changes**:

### A – Import script.js
Just before the closing `</body>` tag, add:
```html
<script src="script.js"></script>
```

### B – Replace the inline script block
Find the last `<script>` block (it starts with `// --- NAVIGATION LOGIC ---`).  
Delete everything between `<script>` and `</script>` and paste in the
contents of `index-script-replacement.js`.

---

## 2. Backend Environment

```bash
cd backend
cp .env.example .env
# Edit .env with your real API keys
```

Key variables to set:

| Variable | Purpose |
|---|---|
| `PAYSTACK_SECRET_KEY` | From Paystack dashboard |
| `FLUTTERWAVE_SECRET_KEY` | From Flutterwave dashboard |
| `FLUTTERWAVE_PUBLIC_KEY` | From Flutterwave dashboard |
| `FLUTTERWAVE_WEBHOOK_HASH` | Webhook secret from Flutterwave dashboard → Settings → Webhooks → Secret Hash |
| `ALLOWED_ORIGIN` | Your frontend URL (e.g. `https://speakingvirtue.com`) |
| `BASE_URL` | Your backend URL (e.g. `https://api.speakingvirtue.com`) |
| `FRONTEND_URL` | Your frontend URL again (used in success/failure pages) |
| `EXCHANGE_RATE_USD_NGN` | Current USD→NGN rate (Paystack bills in kobo) |

---

## 3. Install & Run

```bash
cd backend
npm install
npm start          # production
npm run dev        # development (requires nodemon)
```

Serve the frontend with any static file server, e.g.:
```bash
npx serve . -p 8080
# or
python3 -m http.server 8080
```

---

## 4. Webhook Setup (Required for Reliability)

Webhooks let Paystack/Flutterwave confirm payments even if the customer closes
the browser before being redirected.

### Paystack
- Dashboard → Settings → API Keys & Webhooks
- Webhook URL: `https://your-backend.com/api/webhooks/paystack`
- No extra config needed – the server verifies using your secret key

### Flutterwave
- Dashboard → Settings → Webhooks
- Webhook URL: `https://your-backend.com/api/webhooks/flutterwave`
- Set a **Secret Hash** in the dashboard, then add it to your `.env`:
  ```
  FLUTTERWAVE_WEBHOOK_HASH=the_hash_you_set_in_dashboard
  ```

---

## 5. Production Checklist

- [ ] `.env` is in `.gitignore` ✓ (already done)
- [ ] `ALLOWED_ORIGIN` is set to your real frontend domain
- [ ] `BASE_URL` and `FRONTEND_URL` are set to production URLs
- [ ] Both webhook endpoints are registered in payment dashboards
- [ ] `FLUTTERWAVE_WEBHOOK_HASH` matches what's in Flutterwave dashboard
- [ ] Replace in-memory `carts` object with a real database (MongoDB/PostgreSQL/Redis)
- [ ] Add HTTPS (use a reverse proxy like nginx + Let's Encrypt)
- [ ] Set `EXCHANGE_RATE_USD_NGN` to a current, accurate rate

---

## What Was Fixed

| Issue | Fix |
|---|---|
| Endpoint mismatch (`/api/payment/paystack/initialize` vs `/paystack/initiate`) | Standardized on `/api/payment/paystack/initiate` in both files |
| Duplicate conflicting checkout logic in `index.html` + `script.js` | Single `processPayment()` in `index.html` delegates to `SV.payment` module in `script.js` |
| `script.js` not imported in `index.html` | Added `<script src="script.js">` import |
| Paystack metadata parsed as object (was already stored correctly, but verification assumed wrong shape) | Fixed verification to read `txData.metadata.sessionId` directly |
| CORS `app.use(cors())` allowing all origins | Restricted to `ALLOWED_ORIGIN` env variable |
| Flutterwave webhook using HMAC (wrong – they use a static hash) | Changed to direct string comparison against `FLUTTERWAVE_WEBHOOK_HASH` |
| Paystack webhook: `req.body` was already raw Buffer but `JSON.stringify` would double-encode | Fixed to use `req.body` directly for HMAC, `JSON.parse(req.body.toString())` for event |
| All `localhost:3001` hardcoded across files | Single `BACKEND_URL` constant in `script.js`, env vars in `server.js` |
| Real `.env` file could be committed to git | Added `.gitignore` + `.env.example` |
| Success/failure page HTML as inline template strings | Extracted to `buildSuccessPage()` / `buildFailedPage()` functions |
