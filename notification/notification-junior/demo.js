// Junior: retry on failure. When the ack is lost (timeout after delivery), the retry delivers twice.
const assert = require('assert');
const { provider } = require('../shared');

(async () => {
  let duplicates = 0, lost = 0;
  for (let i = 0; i < 200; i++) {
    let delivered = 0;
    for (let a = 0; a < 3; a++) {
      const r = await provider('push', 40);
      if (r.delivered) delivered++;
      if (r.ok) break;
    }
    if (delivered > 1) duplicates++;
    if (!delivered) lost++;
  }
  console.log(`200 pushes, 40% errors, 3 immediate retries: ${duplicates} users got duplicates, ${lost} lost`);
  assert.ok(duplicates > 0);
  console.log('Retries fix loss but create duplicates. See notification-middle (idempotency + backoff).');
})();
