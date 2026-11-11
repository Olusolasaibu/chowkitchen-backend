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
- **Vendors & order alerts (v2)** - vendors register with a business name,
  phone and WhatsApp number; kitchens can belong to a vendor (`vendorId`,
  `null` = owner-managed); every order creates an instant alert for each
  vendor whose food is in it. See the Vendors & alerts section below.

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
| POST | `/api/vendors` | Create a vendor (`businessName`, `phone`, `whatsapp`) |
| GET | `/api/vendors` | List vendors (includes the seeded demo vendor) |
| GET | `/api/vendors/:id` | Fetch one vendor |
| GET | `/api/vendors/:id/alerts` | A vendor's order alerts, newest first, with `unreadCount` |
| POST | `/api/alerts/:id/read` | Mark one alert as read |

## Vendors & alerts (v2)

**Vendor model.** A vendor is `{ id, businessName, phone, whatsapp,
createdAt }`. Vendors are stored in the JSON store (`data/vendors.json`,
seeded on first run from the `vendors` array in `data/menu.json`). A kitchen
in `data/menu.json` carries an optional `vendorId` — `null` means the kitchen
is owner-managed and generates no alerts. Out of the box, **Mama's Pot** is
attributed to a seeded demo vendor ("Demo Vendor — Mama's Pot") so the alerts
flow is visible immediately; the other seed kitchens are owner-managed. A menu
item's vendor is determined by its kitchen.

**How alerts are created.** When an order is placed (`POST /api/orders`), the
server groups the priced lines by kitchen → vendor and creates **one alert
per vendor** whose items appear in the order:

```json
{
  "id": "…",
  "vendorId": "demo-vendor-mamas-pot",
  "orderId": "…",
  "reference": "CK-1234-ABCD2345 or null for cash",
  "itemsSummary": "2× Jollof Rice & Chicken",
  "total": 7000,
  "customerName": "Ada Example",
  "customerAddress": "12 Example Street, Old GRA, Port Harcourt",
  "status": "unread",
  "paymentStatus": "pending",
  "createdAt": "2026-11-11T12:00:00.000Z"
}
```

**Vendor totals exclude the delivery fee.** An alert's `total` is the sum of
that vendor's own line totals only. The delivery fee belongs to the platform
and is never attributed to a vendor — so if a customer orders from two
vendors in one order, each vendor sees only their own food money, and neither
sees the fee.

**Payment status.** An alert's `paymentStatus` mirrors its order: `pending`
for an online order (or `not_required` for cash on delivery). When the
order's payment is confirmed — either through
`POST /api/orders/:id/confirm-payment` after Paystack API verification, or
through the signature-checked `charge.success` webhook — every alert for
that order flips to `paid`. That flip is the kitchen's signal to start
cooking. Alerts start `unread`; `POST /api/alerts/:id/read` marks one read,
and `GET /api/vendors/:id/alerts` returns the alerts newest-first plus an
`unreadCount`.

**Honest limits.** Alerts are in-app / REST only: a vendor (or their app)
polls the alerts endpoint — nothing is pushed anywhere yet. In particular,
**WhatsApp delivery is not implemented**: sending the alert to the vendor's
phone requires a WhatsApp Business API provider (e.g. Meta's Cloud API or
Twilio). Each vendor's `whatsapp` number is stored on their profile ready
for that step.

## Layout

- `server.js` - Express app and routes
- `lib/pricing.js` - server-side order pricing and payment references
- `lib/paystack.js` - Paystack transaction verification and webhook signatures
- `lib/store.js` - persistence (JSON files for the demo; swap for a real database in production)
- `data/menu.json` - seed kitchens (with optional `vendorId`), dishes, vendors and business settings

## Notes

Orders are stored in `data/orders.json`, vendors in `data/vendors.json`
(seeded from `data/menu.json` on first run), and alerts in `data/alerts.json`,
so the project runs anywhere with zero setup. Amounts are handled in naira inside the app and converted to
kobo only at the Paystack boundary, which is the unit Paystack's API uses.
