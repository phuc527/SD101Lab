// Middle backend: pick the algorithm at runtime and compare accuracy vs memory.
const { serve } = require('../../lib/api-kit');
const { LIMIT, WINDOW_MS, parseHit, answer, algorithms, createLimiter } = require('../shared');

const NAMES = Object.keys(algorithms);
let algo = 'fixed window';
let limiters, stats;
function reset() {
  limiters = Object.fromEntries(NAMES.map((n) => [n, createLimiter(n)])); // separate state per algorithm
  stats = Object.fromEntries(NAMES.map((n) => [n, { allowed: 0, rejected: 0 }]));
}
reset();

serve(__dirname, {
  meta: {
    title: 'Five algorithms side by side',
    profile: 'write-heavy',
    architecture: `client ──> API ──> limiter[algorithm].hit(key)
  fixed window         : counter per window          (cheap, boundary burst)
  sliding log          : every timestamp             (exact, O(limit) memory)
  sliding window count : prev*overlap + cur          (cheap, ~accurate)
  token bucket         : tokens + lastRefill         (allows bursts)
  leaky bucket         : queue level, drains evenly  (smooth output)
limit ${LIMIT} / ${WINDOW_MS / 1000}s for each`,
    ideas: ['Same limit, different behaviour at window edges and bursts', 'Sliding window counter is what most production limiters use', 'Memory per key decides what fits in Redis at 10M users'],
    tradeoffs: ['Exact (sliding log) costs memory per request', 'Approximate counters can be off by a few percent', 'Token bucket allows bursts; leaky bucket smooths but adds latency in a real queue'],
  },
  controls: { algorithm: { label: 'Algorithm', type: 'select', value: algo, options: NAMES } },
  onControl: (id, v) => { if (id === 'algorithm' && NAMES.includes(v)) algo = v; },
  reset,
  routes: {
    'GET /stats': () => {
      const out = { algorithm: algo };
      for (const n of NAMES) {
        const l = limiters[n];
        out[`${n}: allowed/rejected`] = `${stats[n].allowed}/${stats[n].rejected}`;
        out[`${n}: bytes/key`] = l.keys.size ? Math.round(l.memBytes() / l.keys.size) : 0;
      }
      return { stats: out };
    },
    'POST /hit': ({ body, trace }) => {
      const { key } = parseHit(body);
      const r = limiters[algo].hit(key, trace);
      stats[algo][r.allowed ? 'allowed' : 'rejected']++;
      trace(`${algo}: ${r.allowed ? 'allowed' : '429'}, ~${limiters[algo].memBytes()} bytes for all keys`);
      return answer({ ...r, extra: { algorithm: algo } });
    },
  },
});
