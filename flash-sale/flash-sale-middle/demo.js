// Middle: one conditional UPDATE (no read gap), UNIQUE(user) and an idempotency key.
const assert = require('assert');

let stock = 3;
const buyers = new Set();
const keys = new Map();
// UPDATE items SET stock = stock - 1 WHERE id = 1 AND stock > 0, + INSERT with UNIQUE(item_id, user_id)
function buy(userId, key) {
  if (key && keys.has(key)) return keys.get(key);
  let r;
  if (stock <= 0) r = 'sold_out';
  else if (buyers.has(userId)) r = 'limit';
  else { stock--; buyers.add(userId); r = 'ordered'; }
  if (key) keys.set(key, r);
  return r;
}

const log = [buy('u1', 'k1'), buy('u1', 'k1'), buy('u1', 'k2'), buy('u2'), buy('u3'), buy('u4')];
console.log('u1 double-click (same key), u1 again (new key), u2, u3, u4 ->', log);
assert.deepEqual(log, ['ordered', 'ordered', 'limit', 'ordered', 'ordered', 'sold_out']);
console.log('ok. Still one hot row in the DB. See flash-sale-senior (Redis + queue).');
