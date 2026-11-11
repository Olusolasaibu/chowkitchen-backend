import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ordersPath = join(here, "..", "data", "orders.json");
const menuPath = join(here, "..", "data", "menu.json");

// The menu and business settings are static seed data.
export const menu = JSON.parse(readFileSync(menuPath, "utf8"));

// Orders persist to a JSON file so the demo runs anywhere with zero setup.
// Swap this module for a real database (Postgres, SQLite) in production;
// the rest of the app only uses these four functions.
function loadOrders() {
  if (!existsSync(ordersPath)) return [];
  try {
    return JSON.parse(readFileSync(ordersPath, "utf8"));
  } catch {
    return [];
  }
}

function saveOrders(orders) {
  writeFileSync(ordersPath, JSON.stringify(orders, null, 2));
}

export function createOrder(order) {
  const orders = loadOrders();
  orders.push(order);
  saveOrders(orders);
  return order;
}

export function getOrder(id) {
  return loadOrders().find((o) => o.id === id) || null;
}

export function getOrderByReference(reference) {
  return loadOrders().find((o) => o.paystackRef === reference) || null;
}

export function updateOrder(id, patch) {
  const orders = loadOrders();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return null;
  orders[idx] = { ...orders[idx], ...patch, updatedAt: new Date().toISOString() };
  saveOrders(orders);
  return orders[idx];
}

export function dishById(dishId) {
  return menu.dishes.find((d) => d.id === dishId) || null;
}
