// Junior: a row lock (SELECT ... FOR UPDATE) fixes the oversell but serializes every buyer.
const assert = require('assert');
const { query } = require('../shared');

(async () => {
  let stock = 100, orders = 0, lock = Promise.resolve();
  const buy = () => {
    const run = lock.then(async () => {
      await query(5);
      if (stock <= 0) return;
      await query(5);
      stock--;
      orders++;
    });
    lock = run;
    return run;
  };
  const t0 = performance.now();
  await Promise.all(Array.from({ length: 300 }, buy));
  const ms = Math.round(performance.now() - t0);
  console.log(`300 buyers, 100 items -> ${orders} orders in ${ms}ms (one at a time, ~${Math.round(300000 / ms)} buyers/s)`);
  assert.equal(orders, 100);
  console.log('Correct but slow, and sold-out buyers still wait for the lock. See flash-sale-middle.');
})();
