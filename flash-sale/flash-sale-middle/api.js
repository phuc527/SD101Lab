// Middle backend: one atomic conditional UPDATE (no read gap), UNIQUE(user) = 1 per user,
// idempotency keys, and a cached sold-out flag so late buyers never touch the DB.
const { serve } = require('../../lib/api-kit');
const { STOCK, readBuy, readRush, query, rush, newOrder, listOrders } = require('../shared');

let stock, orders, buyers, keys, soldOut, stats, lock;
function reset() {
  stock = STOCK;
  orders = [];
  buyers = new Set(); // UNIQUE (item_id, user_id)
  keys = new Map(); // idempotencyKey -> response promise
  soldOut = false;
  stats = { requests: 0, dbQueries: 0, rejectedSoldOutFast: 0, rejectedLimit: 0, deduped: 0 };
  lock = Promise.resolve();
}
reset();

const controls = {
  dbMs: { label: 'DB query latency (ms)', type: 'number', value: 10, min: 1, max: 100, step: 5 },
  soldOutCache: { label: 'Cache sold-out flag', type: 'toggle', value: true },
};

// UPDATE items SET stock = stock - 1 WHERE id = 1 AND stock > 0  (+ INSERT order in the same transaction)
// The DB still locks the row, but for one statement, not for a read -> app -> write round trip.
function atomicDecrement(userId) {
  const run = lock.then(async () => {
    stats.dbQueries++;
    await query(controls.dbMs.value / 2);
    if (stock <= 0) return 'sold_out';
    if (buyers.has(userId)) return 'limit'; // unique index violation -> rollback
    stock--;
    buyers.add(userId);
    return 'ok';
  });
  lock = run.catch(() => {});
  return run;
}

async function buy({ userId, idempotencyKey }, trace) {
  stats.requests++;
  if (idempotencyKey && keys.has(idempotencyKey)) {
    stats.deduped++;
    trace?.(`idempotencyKey '${idempotencyKey}' seen -> same response, no DB call`);
    return keys.get(idempotencyKey);
  }
  if (soldOut && controls.soldOutCache.value) {
    stats.rejectedSoldOutFast++;
    trace?.('sold-out flag cached -> sold_out without touching the DB');
    return { result: 'sold_out' };
  }
  const p = atomicDecrement(userId).then((r) => {
    if (r === 'sold_out') { soldOut = true; return { result: 'sold_out' }; }
    if (r === 'limit') { stats.rejectedLimit++; return { result: 'limit' }; }
    const o = newOrder(userId);
    orders.push(o);
    return { result: 'ordered', orderId: o.id };
  });
  if (idempotencyKey) keys.set(idempotencyKey, p); // a concurrent double-submit shares the in-flight result
  const res = await p;
  trace?.(`UPDATE ... WHERE stock > 0 -> ${res.result}${res.orderId ? ` ${res.orderId}, stock ${stock}` : ''}`);
  return res;
}

serve(__dirname, {
  meta: {
    title: 'Atomic conditional update + 1 per user',
    profile: 'write-heavy',
    architecture: `POST /buy ──> idempotencyKey seen? ──yes──> same response
          ──> sold-out flag cached? ──yes──> sold_out (no DB)
          ──> UPDATE items SET stock = stock - 1 WHERE id = 1 AND stock > 0
              + INSERT order (UNIQUE item_id, user_id), one transaction`,
    ideas: ['No read-then-write gap: the condition lives inside the UPDATE', 'UNIQUE(user) enforces 1 per user in the DB, not in app code', 'Idempotency key: a double click returns the first response', 'Sold-out flag: after stock hits 0, requests are rejected in memory'],
    tradeoffs: ['Still ONE hot row: every winner writes the same row, the DB is the ceiling (~1-5k/s)', 'Before sold out, the whole herd still reaches the DB', 'Sold-out flag must be cleared on restock / cancelled orders'],
  },
  controls,
  reset,
  routes: {
    'GET /stats': () => ({ stats: { stock, orders: orders.length, oversold: Math.max(0, orders.length - STOCK), ...stats } }),
    'GET /orders': () => listOrders(orders, stock),
    'POST /buy': ({ body, trace }) => buy(readBuy(body), trace),
    'POST /rush': async ({ body, trace }) => {
      const before = stats.dbQueries, fast = stats.rejectedSoldOutFast;
      const r = await rush((i) => buy(i), readRush(body));
      trace(`${r.buyers} buyers -> ${r.won} orders, ${stats.dbQueries - before} DB queries, ${stats.rejectedSoldOutFast - fast} rejected in memory by the sold-out flag`);
      return r;
    },
  },
});
