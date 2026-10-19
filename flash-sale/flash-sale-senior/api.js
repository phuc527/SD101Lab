// Senior backend: stock lives in Redis. A Lua script does "not bought yet && stock > 0 -> DECR + SADD" atomically
// in memory; winners get 202 and their order goes to a queue; a writer inserts orders into the DB in batches.
const { serve } = require('../../lib/api-kit');
const { STOCK, readBuy, readRush, query, rush, newOrder, listOrders } = require('../shared');

const BATCH = 50;
let redis, orders, pending, keys, stats;
function reset() {
  redis = { stock: STOCK, buyers: new Set() };
  orders = [];
  pending = [];
  keys = new Map();
  stats = { requests: 0, dbQueries: 0, redisOps: 0, rejectedLimit: 0, deduped: 0, pendingWrites: 0 };
}
reset();

const controls = {
  dbMs: { label: 'DB query latency (ms)', type: 'number', value: 10, min: 1, max: 100, step: 5 },
  writerPaused: { label: 'Pause order writer (DB down)', type: 'toggle', value: false },
};

// Redis is single-threaded, so the whole script runs atomically, no DB lock involved
function luaReserve(userId) {
  stats.redisOps++;
  if (redis.buyers.has(userId)) return 'limit';
  if (redis.stock <= 0) return 'sold_out';
  redis.stock--;
  redis.buyers.add(userId);
  return 'ok';
}

// Order writer: drains the queue with one multi-row INSERT per batch. Paused = DB outage; nothing is lost.
let writing = false;
setInterval(async () => {
  if (writing || !pending.length || controls.writerPaused.value) return;
  writing = true;
  const batch = pending.splice(0, BATCH);
  stats.dbQueries++;
  await query(controls.dbMs.value);
  for (const o of batch) o.status = 'confirmed';
  stats.pendingWrites = pending.length;
  writing = false;
}, 20).unref();

async function buy({ userId, idempotencyKey }, trace) {
  stats.requests++;
  if (idempotencyKey && keys.has(idempotencyKey)) {
    stats.deduped++;
    trace?.(`idempotencyKey '${idempotencyKey}' seen -> same response`);
    return keys.get(idempotencyKey);
  }
  const r = luaReserve(userId);
  let res;
  if (r === 'sold_out') res = { result: 'sold_out' };
  else if (r === 'limit') { stats.rejectedLimit++; res = { result: 'limit' }; }
  else {
    const o = newOrder(userId, 'pending');
    orders.push(o);
    pending.push(o);
    stats.pendingWrites = pending.length;
    res = { status: 202, result: 'queued', orderId: o.id };
  }
  trace?.(`Redis Lua reserve -> ${r}, redis stock ${redis.stock}${res.orderId ? `, ${res.orderId} queued for the DB writer` : ''}`);
  if (idempotencyKey) keys.set(idempotencyKey, res);
  return res;
}

serve(__dirname, {
  meta: {
    title: 'Redis pre-deduct + async order queue',
    profile: 'write-heavy',
    architecture: `POST /buy ──> Redis Lua (atomic, in memory, ~0.1ms):
            bought already? -> limit | stock <= 0 -> sold_out | DECR stock, SADD buyer
        ──> 202 queued ──> [order queue] ──> writer ──> INSERT ${BATCH} orders per query ──> DB
   the DB sees ~${STOCK / BATCH} writes for ${STOCK} items, however many buyers show up`,
    ideas: ['Hot counter in Redis: single-threaded = atomic without DB locks, 100k+ ops/s', 'Only winners reach the DB; losers are rejected in memory', 'Async batch writer turns 100 inserts into a few queries', 'Pause the writer (DB down): the sale continues, orders wait in the queue'],
    tradeoffs: ['Redis and DB can disagree: need persistence (AOF) + reconciliation', 'Order stays "pending" until written: the UI must show that', 'Real systems add a waiting room in front, and payment timeouts that give stock back'],
  },
  controls,
  reset,
  routes: {
    'GET /stats': () => ({ stats: { stock: redis.stock, orders: orders.length, oversold: Math.max(0, orders.length - STOCK), ...stats } }),
    'GET /orders': () => listOrders(orders, redis.stock),
    'POST /buy': ({ body, trace }) => buy(readBuy(body), trace),
    'POST /rush': async ({ body, trace }) => {
      const before = stats.redisOps;
      const r = await rush((i) => buy(i), readRush(body));
      trace(`${r.buyers} buyers -> ${stats.redisOps - before} Redis ops, 0 DB locks, ${pending.length} orders waiting for the DB writer`);
      return r;
    },
  },
});
