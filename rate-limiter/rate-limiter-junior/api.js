// Junior backend: token bucket per key, lazy refill, Retry-After computed from the refill rate.
const { serve } = require('../../lib/api-kit');
const { LIMIT, WINDOW_MS, parseHit, answer, createLimiter } = require('../shared');

let limiter, stats;
function reset() {
  limiter = createLimiter('token bucket');
  stats = { allowed: 0, rejected: 0 };
}
reset();

serve(__dirname, {
  meta: {
    title: 'Token bucket per key',
    profile: 'write-heavy',
    architecture: `client ──> middleware (rate limit) ──> handler
                │
                └─ Map<key, { tokens, lastRefill }>
                   capacity ${LIMIT}, refill ${(LIMIT / WINDOW_MS) * 1000} tokens/s (computed lazily on each hit)`,
    ideas: ['Capacity allows short bursts, refill rate caps the average', 'Refill lazily from elapsed time: no timer per key', 'Respond with remaining + Retry-After so clients can back off'],
    tradeoffs: ['Two knobs (capacity, rate) to tune per endpoint', 'Still in-process: each server has its own buckets', 'Map grows with keys: needs TTL/eviction for idle keys'],
  },
  reset,
  routes: {
    'GET /stats': () => ({ stats: { ...stats, keys: limiter.keys.size, capacity: LIMIT, refillPerSec: (LIMIT / WINDOW_MS) * 1000 } }),
    'POST /hit': ({ body, trace }) => {
      const { key } = parseHit(body);
      const r = limiter.hit(key, trace);
      stats[r.allowed ? 'allowed' : 'rejected']++;
      trace(r.allowed ? `took 1 token, ${r.remaining} whole tokens left` : `bucket empty, next token in ${Math.ceil(r.retryAfterMs)} ms`);
      return answer(r);
    },
  },
});
