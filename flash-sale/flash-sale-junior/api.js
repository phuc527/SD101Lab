// Junior backend: SELECT ... FOR UPDATE. The row lock makes read+check+write atomic -> no oversell,
// but every buyer waits in line for the same hot row, and nothing stops one user buying twice.
const { serve } = require('../../lib/api-kit');
const { STOCK, readBuy, readRush, query, rush, newOrder, listOrders } = require('../shared');

let stock, orders, stats, lock;
function reset() {
  stock = STOCK;
  orders = [];
  stats = { requests: 0, dbQueries: 0, maxLockWaitMs: 0, sameUserTwice: 0 };
  lock = Promise.resolve();
}
reset();

const controls = { dbMs: { label: 'DB query latency (ms)', type: 'number', value: 10, min: 1, max: 100, step: 5 } };

// BEGIN; SELECT stock FROM items WHERE id = 1 FOR UPDATE; ...; COMMIT
function withRowLock(fn) {
  const run = lock.then(fn);
  lock = run.catch(() => {});
  return run;
}

function buy({ userId }, trace) {
  stats.requests++;
  const t0 = performance.now();
  return withRowLock(async () => {
    const waited = Math.round(performance.now() - t0);
    stats.maxLockWaitMs = Math.max(stats.maxLockWaitMs, waited);
    trace?.(`waited ${waited}ms for the row lock on items#1`);
    stats.dbQueries++;
    await query(controls.dbMs.value);
    trace?.(`SELECT stock FOR UPDATE -> ${stock}`);
    if (stock <= 0) return { result: 'sold_out' };
    stats.dbQueries++;
    await query(controls.dbMs.value);
    stock--;
    if (orders.some((o) => o.userId === userId)) stats.sameUserTwice++;
    const o = newOrder(userId);
    orders.push(o);
    trace?.(`UPDATE stock = ${stock}, INSERT order ${o.id}, COMMIT`);
    return { result: 'ordered', orderId: o.id };
  });
}

serve(__dirname, {
  meta: {
    title: 'Row lock (SELECT ... FOR UPDATE)',
    profile: 'write-heavy',
    architecture: `POST /buy ──> BEGIN ──> SELECT stock FOR UPDATE ──(lock held)──> UPDATE stock, INSERT order ──> COMMIT
   every buyer queues on ONE row lock: request #500 waits for the 499 before it`,
    ideas: ['Pessimistic lock: read + check + write is atomic, never oversells', 'Easy to reason about'],
    tradeoffs: ['Hot row: throughput = 1 / (2 x query time), all buyers serialized', 'Even sold-out requests wait in line for the lock', 'No per-user limit: one user can buy many, double click = 2 orders'],
  },
  controls,
  reset,
  routes: {
    'GET /stats': () => ({ stats: { stock, orders: orders.length, oversold: Math.max(0, orders.length - STOCK), ...stats } }),
    'GET /orders': () => listOrders(orders, stock),
    'POST /buy': ({ body, trace }) => buy(readBuy(body), trace),
    'POST /rush': async ({ body, trace }) => {
      const r = await rush((i) => buy(i), readRush(body));
      trace(`${r.buyers} buyers serialized on one row lock (max wait ${stats.maxLockWaitMs}ms), ${stats.sameUserTwice} orders by users who already had one`);
      return r;
    },
  },
});
