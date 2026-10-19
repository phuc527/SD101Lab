// Senior backend: 3 API nodes behind a round-robin LB sharing a (fake) Redis.
// Shows why local counters leak, why GET+SET races, why INCR is atomic, leases, and fail-open vs fail-closed.
const { serve, sleep, fail } = require('../../lib/api-kit');
const { LIMIT, WINDOW_MS, parseHit, answer } = require('../shared');

const MODES = ['local counters per node', 'shared GET+SET (racy)', 'shared atomic INCR', 'lease tokens'];
const FAIL_OPEN = { feed: true, login: false }; // feed: better to serve than to block; login: never skip brute-force protection
const LEASE = 3; // tokens a node grabs from Redis at once

// Fake Redis: every command is a network round trip; single-threaded so one command is atomic, two are not.
const redis = {
  data: new Map(), down: false,
  async rtt(cmd, trace) { stats.redisCalls++; trace(`  redis ${cmd}`); if (this.down) throw new Error('ECONNREFUSED'); await sleep(10 + Math.random() * 20); },
  async get(k, trace) { await this.rtt(`GET ${k}`, trace); return this.data.get(k) ?? 0; },
  async set(k, v, trace) { await this.rtt(`SET ${k} ${v}`, trace); this.data.set(k, v); },
  async incrby(k, n, trace) { await this.rtt(`INCRBY ${k} ${n}`, trace); const v = (this.data.get(k) ?? 0) + n; this.data.set(k, v); return v; },
};

let mode = MODES[0];
let nodes, rr, truth, stats;
function reset() {
  nodes = [1, 2, 3].map((id) => ({ id, local: new Map(), leases: new Map() }));
  rr = 0;
  truth = new Map(); // ground truth: how many were really allowed per key+window
  redis.data.clear(); // ponytail: no TTL on keys, reset clears them; real Redis uses EXPIRE = window
  stats = { redisCalls: 0, allowed: 0, rejected: 0, overLimit: 0, failOpen: 0, failClosed: 0 };
}
reset();

// One fixed window per key; every mode decides allowed/count for the same window
async function decide(node, rkey, trace) {
  if (mode === MODES[0]) {
    const n = (node.local.get(rkey) ?? 0) + 1;
    if (n > LIMIT) return false;
    node.local.set(rkey, n);
    trace(`  node-${node.id} local counter ${n}/${LIMIT} (other nodes don't see it)`);
    return true;
  }
  if (mode === MODES[1]) {
    const v = await redis.get(rkey, trace); // read ... (other requests run during this RTT)
    if (v >= LIMIT) return false;
    await redis.set(rkey, v + 1, trace); // ... modify-write: concurrent requests overwrite each other
    return true;
  }
  if (mode === MODES[2]) return (await redis.incrby(rkey, 1, trace)) <= LIMIT;
  // lease: spend a locally held token, refill the lease with one atomic INCRBY
  const lease = node.leases.get(rkey) ?? 0;
  if (lease > 0) { node.leases.set(rkey, lease - 1); trace(`  node-${node.id} lease: used 1, ${lease - 1} left (no Redis call)`); return true; }
  const after = await redis.incrby(rkey, LEASE, trace);
  const granted = Math.max(0, Math.min(LEASE, LIMIT - (after - LEASE)));
  trace(`  node-${node.id} leased ${granted}/${LEASE} tokens`);
  if (!granted) return false;
  node.leases.set(rkey, granted - 1);
  return true;
}

serve(__dirname, {
  meta: {
    title: 'Distributed limiter: 3 nodes + shared Redis',
    profile: 'write-heavy',
    architecture: `client ──> LB (round-robin) ──> node-1 ─┐
                             ──> node-2 ─┼──> Redis (shared counters, ~10-30 ms RTT)
                             ──> node-3 ─┘
key = rl:{user}:{endpoint}:{windowId}, limit ${LIMIT} / ${WINDOW_MS / 1000}s
Redis down? feed = fail-open (allow), login = fail-closed (503)`,
    ideas: ['Local counters let N x limit through behind a load balancer', 'GET then SET is a race; INCR (or a Lua script) is atomic', `Leases: grab ${LEASE} tokens per Redis call to cut round trips`, 'Fail-open vs fail-closed is a per-endpoint business decision'],
    tradeoffs: ['Every request pays a Redis RTT (leases trade accuracy for fewer calls)', 'Redis becomes a dependency on the hot path: needs a failure policy', 'Leased-but-unused tokens are wasted until the window ends'],
  },
  controls: {
    mode: { label: 'Counter mode', type: 'select', value: mode, options: MODES },
    redisDown: { label: 'Redis down', type: 'toggle', value: false },
  },
  onControl: (id, v) => {
    if (id === 'mode' && MODES.includes(v)) mode = v;
    if (id === 'redisDown') redis.down = !!v;
  },
  reset,
  routes: {
    'GET /stats': () => ({ stats: { mode, redis: redis.down ? 'DOWN' : 'up', ...stats } }),
    'POST /hit': async ({ body, trace }) => {
      const { key, endpoint } = parseHit(body);
      const node = nodes[rr++ % nodes.length];
      const win = Math.floor(Date.now() / WINDOW_MS);
      const rkey = `rl:${key}:${endpoint}:${win}`;
      trace(`LB -> node-${node.id} (${mode})`);
      let allowed;
      try {
        allowed = await decide(node, rkey, trace);
      } catch (e) {
        if (FAIL_OPEN[endpoint]) {
          stats.failOpen++;
          trace(`Redis error (${e.message}) -> ${endpoint} is fail-open: allow without limiting`);
          allowed = true;
        } else {
          stats.failClosed++;
          trace(`Redis error (${e.message}) -> ${endpoint} is fail-closed: reject`);
          fail(503, `limiter unavailable (Redis down), ${endpoint} fails closed`);
        }
      }
      const resetIn = (win + 1) * WINDOW_MS - Date.now();
      if (!allowed) { stats.rejected++; return answer({ allowed: false, retryAfterMs: resetIn, extra: { node: node.id, mode } }); }
      const real = (truth.get(rkey) ?? 0) + 1;
      truth.set(rkey, real);
      stats.allowed++;
      if (real > LIMIT) { stats.overLimit++; trace(`allowed #${real}: over the true limit of ${LIMIT}!`); }
      return answer({ allowed: true, remaining: Math.max(0, LIMIT - real), extra: { node: node.id, mode } });
    },
  },
});
