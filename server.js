import express from "express";
import { randomUUID } from "node:crypto";
import { menu, createOrder, getOrder, getOrderByReference, updateOrder } from "./lib/store.js";
import { priceOrder, makeReference } from "./lib/pricing.js";
import { verifyTransaction, isValidWebhookSignature, ONLINE_METHODS, CHANNELS } from "./lib/paystack.js";

const app = express();
const PORT = process.env.PORT || 4000;

// The webhook route needs the RAW body to check Paystack's signature,
// so it is registered before the JSON parser.
app.post("/api/webhooks/paystack", express.raw({ type: "application/json" }), (req, res) => {
  if (!isValidWebhookSignature(req.body, req.headers["x-paystack-signature"])) {
    return res.status(401).json({ error: "Invalid signature" });
  }
  const event = JSON.parse(req.body.toString("utf8"));
  if (event.event === "charge.success") {
    const ref = event.data.reference;
    const order = getOrderByReference(ref);
    // Idempotent: a webhook retry for an already-paid order is a no-op.
    if (order && order.paymentStatus !== "paid" && event.data.amount === order.total * 100) {
      updateOrder(order.id, { paymentStatus: "paid", paidAt: event.data.paid_at || new Date().toISOString() });
    }
  }
  // Always 200 once the signature checks out, so Paystack stops retrying.
  return res.sendStatus(200);
});

app.use(express.json());

// --- Storefront ------------------------------------------------------------
app.get("/api/storefront", (_req, res) => {
  res.json({
    settings: {
      ...menu.settings,
      // The public key is safe to expose: Paystack designs it for frontends.
      paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || null,
    },
    kitchens: menu.kitchens,
    dishes: menu.dishes,
  });
});

// --- Orders ----------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post("/api/orders", (req, res) => {
  try {
    const { customer, items, paymentMethod } = req.body || {};
    if (!customer?.name || !customer?.phone || !customer?.address) {
      return res.status(400).json({ error: "Customer name, phone and address are required" });
    }
    if (![...ONLINE_METHODS, "cash"].includes(paymentMethod)) {
      return res.status(400).json({ error: "Unknown payment method" });
    }
    const online = ONLINE_METHODS.includes(paymentMethod);
    // Paystack requires an email for the payment receipt.
    if (online && !EMAIL_RE.test(customer.email || "")) {
      return res.status(400).json({ error: "A valid email address is required for Paystack payment" });
    }

    const priced = priceOrder(items); // server-computed totals; throws on bad input
    const orderNumber = 1000 + Math.floor(1000 + Math.random() * 9000);
    const order = {
      id: randomUUID(),
      number: `CK-${orderNumber}`,
      customer: { name: customer.name, phone: customer.phone, email: customer.email || null, address: customer.address },
      items: priced.lines,
      subtotal: priced.subtotal,
      deliveryFee: priced.deliveryFee,
      total: priced.total,
      currency: menu.settings.currency,
      paymentMethod,
      paymentStatus: online ? "pending" : "not_required",
      paystackRef: online ? makeReference(orderNumber) : null,
      status: "received", // received -> preparing -> out_for_delivery -> delivered
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    createOrder(order);

    // The frontend opens Paystack Inline with this reference, the total in
    // kobo, and only the channel the customer picked.
    return res.status(201).json({
      order,
      paystack: online
        ? { reference: order.paystackRef, amountKobo: order.total * 100, email: customer.email, channels: CHANNELS[paymentMethod] }
        : null,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.get("/api/orders/:id", (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  return res.json({ order });
});

// Called by the frontend after the Paystack popup reports success.
// The reference alone proves nothing - we verify with Paystack's API
// and check the amount before the order counts as paid.
app.post("/api/orders/:id/confirm-payment", async (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const { reference } = req.body || {};
  if (!order.paystackRef || reference !== order.paystackRef) {
    return res.status(400).json({ error: "Payment reference does not match this order" });
  }
  if (order.paymentStatus === "paid") return res.json({ ok: true, order });
  try {
    const data = await verifyTransaction(reference);
    if (data.status !== "success") {
      return res.status(402).json({ error: `Payment not completed (status: ${data.status})` });
    }
    if (data.amount !== order.total * 100 || data.currency !== order.currency) {
      return res.status(402).json({ error: "Paid amount does not match the order total" });
    }
    const paid = updateOrder(order.id, { paymentStatus: "paid", paidAt: data.paid_at });
    return res.json({ ok: true, order: paid });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

// Kitchen-side status advance (received -> preparing -> out_for_delivery -> delivered).
app.post("/api/orders/:id/status", (req, res) => {
  const flow = ["received", "preparing", "out_for_delivery", "delivered"];
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const next = flow[flow.indexOf(order.status) + 1];
  if (!next) return res.status(400).json({ error: "Order already delivered" });
  // Online orders must be paid before the kitchen starts them.
  if (order.paymentStatus === "pending") {
    return res.status(402).json({ error: "Order is still awaiting payment" });
  }
  return res.json({ ok: true, order: updateOrder(order.id, { status: next }) });
});

app.listen(PORT, () => {
  console.log(`Chowkitchen backend listening on http://localhost:${PORT}`);
});
