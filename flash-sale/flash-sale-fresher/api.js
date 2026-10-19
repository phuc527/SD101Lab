// Fresher backend: read stock, check, then write. Two separate DB calls with a gap between them
// -> concurrent buyers all read the same stock and the sale oversells.
const { serve } = require('../../lib/api-kit');
const { STOCK, readBuy, readRush, query, rush, newOrder, listOrders } = require('../shared');

let stock, orders, stats;
function reset() {
  stock = STOCK;
  orders = [];
  stats = { requests: 0, dbQueries: 0 };
}
reset();

const controls = { dbMs: { label: 'DB query latency (ms)', type: 'number', value: 10, min: 1, max: 100, step: 5 } };

async function buy({ userId }, trace) {
  stats.requests++;
  stats.dbQueries++;
  await query(controls.dbMs.value);
  const seen = stock; // SELECT stock FROM items WHERE id = 1
  trace?.(`SELECT stock -> ${seen}`);
  if (seen <= 0) return { result: 'sold_out' };
  stats.dbQueries++;
  await query(controls.dbMs.value);
  stock = seen - 1; // UPDATE items SET stock = <seen - 1>  (overwrites what others wrote meanwhile)
  const o = newOrder(userId);
  orders.push(o);
  trace?.(`UPDATE stock = ${seen - 1}, INSERT order ${o.id}`);
  if (orders.length > STOCK) trace?.(`OVERSOLD: ${orders.length} orders for ${STOCK} items`);
  return { result: 'ordered', orderId: o.id };
}

serve(__dirname, {
  meta: {
    title: 'Read, check, write (no locking)',
    profile: 'write-heavy',
    architecture: `POST /buy ──> SELECT stock ──(gap: other requests run here)──> if > 0: UPDATE stock = seen - 1, INSERT order
   500 buyers read "stock = 100" at the same time -> all of them buy`,
    ideas: ['Simplest code: read the stock, check it, write it back', 'Works perfectly with one user at a time'],
    tradeoffs: ['Race condition: check-then-act across 2 queries -> oversell', 'Lost update: stock = seen - 1 overwrites concurrent writes', 'No per-user limit, no idempotency: double click = 2 orders'],
  },
  controls,
  reset,
  routes: {
    'GET /stats': () => ({ stats: { stock, orders: orders.length, oversold: Math.max(0, orders.length - STOCK), ...stats } }),
    'GET /orders': () => listOrders(orders, stock),
    'POST /buy': ({ body, trace }) => buy(readBuy(body), trace),
    'POST /rush': async ({ body, trace }) => {
      const r = await rush((i) => buy(i), readRush(body));
      trace(`${r.buyers} concurrent buyers -> ${r.won} orders for ${STOCK} items${orders.length > STOCK ? ` (OVERSOLD by ${orders.length - STOCK})` : ''}`);
      return r;
    },
  },
});
