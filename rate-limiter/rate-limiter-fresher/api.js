// Fresher backend: one fixed-window counter per key in process memory.
const { serve } = require('../../lib/api-kit');
const { LIMIT, WINDOW_MS, parseHit, answer, createLimiter } = require('../shared');

let limiter, stats;
function reset() {
  limiter = createLimiter('fixed window');
  stats = { allowed: 0, rejected: 0 };
}
reset();

serve(__dirname, {
  meta: {
    title: 'Fixed window counter',
    profile: 'write-heavy',
    architecture: `client ──> API ──> Map<key, { windowId, count }> (in memory)
windowId = floor(now / ${WINDOW_MS} ms), count < ${LIMIT} ? 200 : 429`,
    ideas: [`At most ${LIMIT} requests per key per ${WINDOW_MS / 1000}s window`, 'One counter per key, reset when the window id changes', 'Return 429 + Retry-After instead of doing the work'],
    tradeoffs: [`Boundary burst: ${LIMIT} at the end of a window + ${LIMIT} at the start of the next = ${2 * LIMIT} in a moment`, 'Memory lives in one process: restart = counters lost', 'Does not work with more than one server'],
  },
  reset,
  routes: {
    'GET /stats': () => ({ stats: { ...stats, keys: limiter.keys.size, algorithm: 'fixed window' } }),
    'POST /hit': ({ body, trace }) => {
      const { key } = parseHit(body);
      const r = limiter.hit(key, trace);
      stats[r.allowed ? 'allowed' : 'rejected']++;
      trace(r.allowed ? `allowed, ${r.remaining} left in this window` : 'rejected with 429');
      return answer(r);
    },
  },
});
