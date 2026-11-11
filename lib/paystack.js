import { createHmac, timingSafeEqual } from "node:crypto";

const API_BASE = "https://api.paystack.co";

// The secret key lives only on the server, read from the environment.
// It is never sent to the frontend and never committed to git.
function secretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

// Verify a transaction directly with Paystack's API.
// This is the source of truth for "did the money actually arrive" -
// never trust the browser callback alone.
export async function verifyTransaction(reference) {
  const res = await fetch(`${API_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.status !== true) {
    throw new Error(`Paystack verify failed (${res.status}): ${body?.message || "no response"}`);
  }
  return body.data; // { status, amount (kobo), currency, channel, paid_at, reference, ... }
}

// Paystack signs every webhook with HMAC-SHA512 of the raw request body,
// using your secret key. Reject anything that does not match.
export function isValidWebhookSignature(rawBodyBuffer, signatureHeader) {
  if (!signatureHeader) return false;
  const expected = createHmac("sha512", secretKey()).update(rawBodyBuffer).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signatureHeader));
  return a.length === b.length && timingSafeEqual(a, b);
}

export const ONLINE_METHODS = ["card", "bank_transfer", "ussd"];

// Paystack channel names per checkout method chosen in the app.
export const CHANNELS = {
  card: ["card"],
  bank_transfer: ["bank_transfer"],
  ussd: ["ussd"],
};
