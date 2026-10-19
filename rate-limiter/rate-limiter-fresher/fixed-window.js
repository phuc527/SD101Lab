// Fresher: fixed window counter per key (IP / user id)
const assert = require('assert');

class FixedWindowLimiter {
  constructor(limit, windowMs) { this.limit = limit; this.windowMs = windowMs; this.counters = new Map(); } // key -> { window, count }
  allow(key, now) {
    const window = Math.floor(now / this.windowMs);
    const c = this.counters.get(key);
    if (!c || c.window !== window) { this.counters.set(key, { window, count: 1 }); return true; } // new window, reset
    if (c.count >= this.limit) return false;
    c.count++;
    return true;
  }
}

// Time is passed in explicitly so the demo is deterministic
const rl = new FixedWindowLimiter(5, 1000); // 5 requests / second
const res = [0, 100, 200, 300, 400, 500, 600].map((t) => rl.allow('ip-1', t));
console.log('ip-1 sends 7 requests in 600ms (limit 5/s):', res.map((ok) => (ok ? 200 : 429)).join(' '));
assert.equal(res.filter(Boolean).length, 5);
assert.equal(rl.allow('ip-2', 600), true);  // each key has its own counter
assert.equal(rl.allow('ip-1', 1000), true); // new window -> allowed again
console.log('ip-2 at 600ms -> 200 (separate counter) | ip-1 at 1000ms -> 200 (new window)');

// The flaw: a burst at the window boundary
const rl2 = new FixedWindowLimiter(5, 1000);
const times = [900, 920, 940, 960, 980, 1000, 1020, 1040, 1060, 1080];
const allowed = times.filter((t) => rl2.allow('u', t)).length;
console.log(`\nboundary burst: ${allowed} requests allowed between 900ms and 1080ms, i.e. 2x the limit inside 180ms`);
assert.equal(allowed, 10);
console.log('ok. Limitation: boundary bursts, no HTTP headers telling the client when to retry. See rate-limiter-junior.');
