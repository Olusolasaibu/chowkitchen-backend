# Chowkitchen Backend

Backend for **Chowkitchen**, a food-delivery service in Port Harcourt, Nigeria.
Customers browse kitchens and dishes, place orders, pay online with Paystack
(card, bank transfer, USSD) or cash on delivery, and track their order from
the kitchen to their door.

## What it does

- **Storefront API** - business settings, kitchens and dishes for the app.
- **Server-computed pricing** - order totals are calculated on the server
  from menu prices plus the delivery fee. Prices sent by the client are
  ignored, so a tampered client cannot change what an order costs.
- **Paystack payments** - every online order gets a unique payment
  reference. The frontend opens Paystack Inline with that reference, the
  total in kobo, and only the channel the customer picked.
- **Two independent payment confirmations** - an order counts as paid only
  after (1) the server verifies the reference directly against Paystack's
  API and checks the paid amount matches the order total, or (2) a
  signature-checked Paystack webhook (`charge.success`) arrives. The
  browser's success callback alone is never trusted.
- **Kitchen gate** - an online order that is still awaiting payment cannot
  be advanced by the kitchen.
- **Order tracking** - received -> preparing -> out for delivery -> delivered.

## Run it

```bash
cp .env.example .env   # fill in your own Paystack keys
npm install
npm start              # http://localhost:4000
```

Get your keys from the Paystack Dashboard under **Developers -> API Keys &
Webhooks**. The public key is safe to expose in a frontend. The secret key
stays on the server - never commit it, never put it in client code.

To receive webhooks locally, expose the server with a tunnel (for example
`ngrok http 4000`) and set the webhook URL in the Paystack Dashboard to
`https://<your-tunnel>/api/webhooks/paystack`.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/storefront` | Settings (incl. public key), kitchens, dishes |
| POST | `/api/orders` | Place an order; returns the Paystack payment details for online payment |
| GET | `/api/orders/:id` | Fetch one order and its tracking status |
| POST | `/api/orders/:id/confirm-payment` | Verify a payment server-side after checkout |
| POST | `/api/orders/:id/status` | Advance the kitchen/tracking status |
| POST | `/api/webhooks/paystack` | Paystack webhook receiver (signature verified) |

## Layout

- `server.js` - Express app and routes
- `lib/pricing.js` - server-side order pricing and payment references
- `lib/paystack.js` - Paystack transaction verification and webhook signatures
- `lib/store.js` - persistence (JSON file for the demo; swap for a real database in production)
- `data/menu.json` - seed kitchens, dishes and business settings

## Notes

Orders are stored in `data/orders.json` so the project runs anywhere with
zero setup. Amounts are handled in naira inside the app and converted to
kobo only at the Paystack boundary, which is the unit Paystack's API uses.
