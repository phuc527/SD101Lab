// Senior: count DB work for 10,000 buyers. Row lock vs Redis pre-deduct + batched order writes.
const assert = require('assert');

const BUYERS = 10000, STOCK = 100, BATCH = 50;

// Row lock: every buyer takes the lock and runs at least one query
const rowLockQueries = BUYERS;

// Redis: the Lua script rejects losers in memory; only winners are queued, written BATCH per INSERT
let stock = STOCK;
const queue = [];
for (let i = 0; i < BUYERS; i++) if (stock > 0) { stock--; queue.push(i); }
const batchQueries = Math.ceil(queue.length / BATCH);

console.log(`${BUYERS} buyers, ${STOCK} items`);
console.log(`  row lock in DB:            ${rowLockQueries} queries, all serialized on one row`);
console.log(`  Redis + async batch write: ${BUYERS} Redis ops (~0.1ms each), ${batchQueries} DB queries`);
assert.equal(queue.length, STOCK);
assert.equal(batchQueries, 2);
console.log('ok.');
