// Middle: backoff schedule with jitter, and idempotency keys that turn duplicate requests into no-ops
const assert = require('assert');

const backoff = (attempt) => 200 * 2 ** (attempt - 1) * (0.5 + Math.random());
console.log('backoff per attempt (ms):', [1, 2, 3, 4, 5].map((a) => Math.round(backoff(a))));
console.log('jitter spreads 1000 clients retrying "at 400ms" over', (() => {
  const xs = Array.from({ length: 1000 }, () => backoff(2));
  return `${Math.round(Math.min(...xs))}-${Math.round(Math.max(...xs))}ms`;
})());

const keys = new Map();
let created = 0;
function notify(key) {
  if (keys.has(key)) return { result: 'deduped', id: keys.get(key) };
  const id = `n${++created}`;
  keys.set(key, id);
  return { result: 'queued', id };
}
const a = notify('otp-u1-482913');
const b = notify('otp-u1-482913'); // user double-clicked / client retried after a timeout
console.log(a, b);
assert.equal(a.id, b.id);
assert.equal(created, 1);
console.log('ok. Still FIFO per channel: an OTP waits behind a broadcast. See notification-senior.');
