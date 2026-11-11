// Order totals are always computed on the server from menu prices.
// Prices sent by the client are ignored - a tampered client cannot
// change what an order costs.
import { dishById, menu } from "./store.js";

export function priceOrder(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Order must contain at least one item");
  }
  const lines = items.map((item) => {
    const dish = dishById(item.dishId);
    if (!dish) throw new Error(`Unknown dish: ${item.dishId}`);
    const qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
      throw new Error(`Invalid quantity for ${dish.name}`);
    }
    return {
      dishId: dish.id,
      name: dish.name,
      kitchenId: dish.kitchenId,
      unitPrice: dish.price,
      qty,
      lineTotal: dish.price * qty,
    };
  });
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const deliveryFee = menu.settings.deliveryFee;
  return { lines, subtotal, deliveryFee, total: subtotal + deliveryFee };
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function makeReference(orderNumber) {
  let suffix = "";
  for (let i = 0; i < 8; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `CK-${orderNumber}-${suffix}`;
}
