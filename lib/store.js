import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ordersPath = join(here, "..", "data", "orders.json");
const vendorsPath = join(here, "..", "data", "vendors.json");
const alertsPath = join(here, "..", "data", "alerts.json");
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

export function kitchenById(kitchenId) {
  return menu.kitchens.find((k) => k.id === kitchenId) || null;
}

// --- Vendors ---------------------------------------------------------------
// Vendors persist to a JSON file alongside orders. The first run seeds the
// file from menu.json's `vendors` array so the demo vendor is present out
// of the box; vendors created via the API are appended to the same file.
function loadVendors() {
  if (!existsSync(vendorsPath)) return [...(menu.vendors || [])];
  try {
    return JSON.parse(readFileSync(vendorsPath, "utf8"));
  } catch {
    return [...(menu.vendors || [])];
  }
}

function saveVendors(vendors) {
  writeFileSync(vendorsPath, JSON.stringify(vendors, null, 2));
}

export function listVendors() {
  return loadVendors();
}

export function getVendor(id) {
  return loadVendors().find((v) => v.id === id) || null;
}

export function createVendor(vendor) {
  const vendors = loadVendors();
  vendors.push(vendor);
  saveVendors(vendors);
  return vendor;
}

// --- Order alerts ----------------------------------------------------------
// One alert is created per vendor per order (see server.js). Alerts persist
// to a JSON file so a vendor can poll GET /api/vendors/:id/alerts.
function loadAlerts() {
  if (!existsSync(alertsPath)) return [];
  try {
    return JSON.parse(readFileSync(alertsPath, "utf8"));
  } catch {
    return [];
  }
}

function saveAlerts(alerts) {
  writeFileSync(alertsPath, JSON.stringify(alerts, null, 2));
}

export function createAlert(alert) {
  const alerts = loadAlerts();
  alerts.push(alert);
  saveAlerts(alerts);
  return alert;
}

export function getAlert(id) {
  return loadAlerts().find((a) => a.id === id) || null;
}

export function listAlertsByVendor(vendorId) {
  // Newest first.
  return loadAlerts()
    .filter((a) => a.vendorId === vendorId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function updateAlert(id, patch) {
  const alerts = loadAlerts();
  const idx = alerts.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  alerts[idx] = { ...alerts[idx], ...patch };
  saveAlerts(alerts);
  return alerts[idx];
}

// Flip every alert belonging to an order to paymentStatus "paid".
// Called from both payment-confirmation paths (API verify + webhook).
export function markOrderAlertsPaid(orderId) {
  const alerts = loadAlerts();
  let changed = false;
  const next = alerts.map((a) => {
    if (a.orderId === orderId && a.paymentStatus !== "paid") {
      changed = true;
      return { ...a, paymentStatus: "paid" };
    }
    return a;
  });
  if (changed) saveAlerts(next);
  return next.filter((a) => a.orderId === orderId);
}
