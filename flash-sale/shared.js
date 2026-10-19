// Shared helpers for every flash-sale level, so all 4 APIs speak the same contract.
// API contract (same for every level):
//   POST /buy  { userId, idempotencyKey? } -> { result: 'ordered'|'queued'|'sold_out'|'limit', orderId? }
//   POST /rush { buyers? }                 -> { buyers, won, rejected }   (N concurrent buyers through the same buy path)
//   GET  /orders                           -> { orders: [...latest 40], total, stock, oversold }
//   GET  /stats                            -> { stats: { ... } }
const { fail, sleep } = require('../lib/api-kit');

const STOCK = 100;
const USERS = 1000;

function readBuy(body) {
  const userId = String(body.userId ?? '');
  const n = Number(userId.slice(1));
  if (!/^u\d+$/.test(userId) || n < 1 || n > USERS) fail(400, `userId must be u1..u${USERS}`);
  const idempotencyKey = body.idempotencyKey ? String(body.idempotencyKey).slice(0, 100) : undefined;
  return { userId, idempotencyKey };
}
function readRush(body) {
  const buyers = body.buyers === undefined ? 500 : Number(body.buyers);
  if (!Number.isInteger(buyers) || buyers < 1 || buyers > 2000) fail(400, 'buyers must be 1..2000');
  return buyers;
}

// The "database": every query costs ~dbMs, with jitter so concurrent requests interleave like a real DB
const query = (dbMs) => sleep(dbMs * (0.5 + Math.random()));

// N buyers click at the same moment. Every 3rd click is the previous person clicking again.
async function rush(buy, buyers) {
  const results = await Promise.all(Array.from({ length: buyers }, (_, i) =>
    buy({ userId: `u${Math.floor((i * 2) / 3) + 1}` }).then((r) => r.result, () => 'error')));
  const won = results.filter((r) => r === 'ordered' || r === 'queued').length;
  return { buyers, won, rejected: buyers - won };
}

let seq = 0;
const newOrder = (userId, status = 'confirmed') => ({ id: `o${++seq}`, userId, status, createdAt: Date.now() });
const listOrders = (orders, stock) => ({
  orders: orders.slice(-40).reverse(),
  total: orders.length,
  stock,
  oversold: Math.max(0, orders.length - STOCK),
});

module.exports = { STOCK, USERS, readBuy, readRush, query, rush, newOrder, listOrders };
