// Fresher: the request waits for the provider, so latency and failures leak straight to the caller
const assert = require('assert');
const { provider } = require('../shared');

(async () => {
  let t = Date.now();
  const r = await provider('sms', 0);
  console.log(`1 SMS inside the request: ${Date.now() - t}ms, ok=${r.ok}`);

  t = Date.now();
  let lost = 0;
  for (let i = 0; i < 50; i++) if (!(await provider('email', 20)).ok) lost++;
  console.log(`50 emails one by one with 20% provider errors: ${Date.now() - t}ms, ${lost} lost (no retry)`);
  assert.ok(Date.now() - t >= 50 * 40);
  console.log('Broadcast to 1M users this way = 1M × 40ms ≈ 11 hours in one request. See notification-junior.');
})();
