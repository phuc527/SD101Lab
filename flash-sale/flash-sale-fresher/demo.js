// Fresher: read stock, check, write back. 300 concurrent buyers for 100 items.
const assert = require('assert');
const { query } = require('../shared');

(async () => {
  let stock = 100, orders = 0;
  async function buy() {
    await query(5);
    const seen = stock; // SELECT
    if (seen <= 0) return;
    await query(5); // every other buyer reads "seen" during this gap
    stock = seen - 1; // UPDATE stock = seen - 1
    orders++;
  }
  await Promise.all(Array.from({ length: 300 }, buy));
  console.log(`300 buyers, 100 items -> ${orders} orders, stock left ${stock}`);
  assert.ok(orders > 100);
  console.log('Oversold. Check-then-act across two queries is a race. See flash-sale-junior (row lock).');
})();
