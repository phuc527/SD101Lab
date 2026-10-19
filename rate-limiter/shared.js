// Shared limits + algorithms for every rate-limiter level, so all 4 APIs behave the same from the outside.
// API contract (same for every level):
//   POST /hit { key, endpoint? }  -> 200 { allowed: true,  limit, remaining, retryAfterMs: 0, windowMs, ... }
//                                    429 { allowed: false, limit, remaining: 0, retryAfterMs, error, ... }
//   GET  /stats                   -> { stats: { ... } }
// Fixed windows are aligned to the epoch (floor(now / WINDOW_MS)) so the UI can aim a burst at a boundary.
const { fail } = require('../lib/api-kit');

const LIMIT = 10;
const WINDOW_MS = 5000;
const ENDPOINTS = ['feed', 'login'];

function parseHit(body) {
  const key = String(body?.key ?? '').trim();
  if (!key) fail(400, 'key required');
  if (key.length > 64) fail(400, 'key max 64 chars');
  const endpoint = body.endpoint ?? 'feed';
  if (!ENDPOINTS.includes(endpoint)) fail(400, `endpoint must be one of ${ENDPOINTS.join(', ')}`);
  return { key, endpoint };
}

// Shape the HTTP answer; a 429 carries `error` so the UI's ApiError message explains it.
const answer = (r) => (r.allowed
  ? { allowed: true, limit: LIMIT, remaining: r.remaining, retryAfterMs: 0, windowMs: WINDOW_MS, ...r.extra }
  : { status: 429, allowed: false, limit: LIMIT, remaining: 0, retryAfterMs: Math.ceil(r.retryAfterMs), windowMs: WINDOW_MS, error: `429 Too Many Requests, retry after ${Math.ceil(r.retryAfterMs)} ms`, ...r.extra });

// Each algorithm: hit(state, now, trace) mutates its per-key state and returns { allowed, remaining, retryAfterMs }.
// mem(state) = rough bytes kept per key (what you'd pay in Redis).
const RATE = LIMIT / WINDOW_MS; // tokens per ms for the bucket algorithms
const algorithms = {
  'fixed window': {
    init: () => ({ win: -1, count: 0 }),
    hit(s, now, trace) {
      const win = Math.floor(now / WINDOW_MS);
      if (win !== s.win) { s.win = win; s.count = 0; }
      const resetIn = (win + 1) * WINDOW_MS - now;
      trace(`fixed window #${win}: count ${s.count}/${LIMIT}, resets in ${resetIn} ms`);
      if (s.count >= LIMIT) return { allowed: false, remaining: 0, retryAfterMs: resetIn };
      s.count++;
      return { allowed: true, remaining: LIMIT - s.count };
    },
    mem: () => 16, // window id + counter
  },
  'sliding log': {
    init: () => ({ log: [] }),
    hit(s, now, trace) {
      while (s.log.length && s.log[0] <= now - WINDOW_MS) s.log.shift();
      trace(`sliding log: ${s.log.length} timestamps in the last ${WINDOW_MS} ms`);
      if (s.log.length >= LIMIT) return { allowed: false, remaining: 0, retryAfterMs: s.log[0] + WINDOW_MS - now };
      s.log.push(now);
      return { allowed: true, remaining: LIMIT - s.log.length };
    },
    mem: (s) => 8 * Math.max(s.log.length, 1), // one timestamp per request: exact but O(limit) memory
  },
  'sliding window counter': {
    init: () => ({ win: -1, cur: 0, prev: 0 }),
    hit(s, now, trace) {
      const win = Math.floor(now / WINDOW_MS);
      if (win !== s.win) { s.prev = win === s.win + 1 ? s.cur : 0; s.cur = 0; s.win = win; }
      const weight = 1 - (now % WINDOW_MS) / WINDOW_MS; // how much of the previous window still overlaps
      const est = s.prev * weight + s.cur;
      trace(`sliding counter: prev ${s.prev} x ${weight.toFixed(2)} + cur ${s.cur} = ${est.toFixed(2)} (approximation)`);
      if (est + 1 > LIMIT) return { allowed: false, remaining: 0, retryAfterMs: Math.min(WINDOW_MS - (now % WINDOW_MS), 1000) };
      s.cur++;
      return { allowed: true, remaining: Math.max(0, Math.floor(LIMIT - est - 1)) };
    },
    mem: () => 24, // two counters + window id
  },
  'token bucket': {
    init: (now) => ({ tokens: LIMIT, at: now }),
    hit(s, now, trace) {
      s.tokens = Math.min(LIMIT, s.tokens + (now - s.at) * RATE); // lazy refill, no timer per key
      s.at = now;
      trace(`token bucket: ${s.tokens.toFixed(2)}/${LIMIT} tokens, refill ${RATE * 1000}/s`);
      if (s.tokens < 1) return { allowed: false, remaining: 0, retryAfterMs: (1 - s.tokens) / RATE };
      s.tokens -= 1;
      return { allowed: true, remaining: Math.floor(s.tokens) };
    },
    mem: () => 16, // tokens + last refill time
  },
  'leaky bucket': {
    init: (now) => ({ water: 0, at: now }),
    hit(s, now, trace) {
      s.water = Math.max(0, s.water - (now - s.at) * RATE); // queue drains at a constant rate
      s.at = now;
      trace(`leaky bucket: queue ${s.water.toFixed(2)}/${LIMIT}, drains ${RATE * 1000}/s (smooth output)`);
      if (s.water + 1 > LIMIT) return { allowed: false, remaining: 0, retryAfterMs: (s.water + 1 - LIMIT) / RATE };
      s.water += 1;
      return { allowed: true, remaining: Math.floor(LIMIT - s.water) };
    },
    mem: () => 16,
  },
};

// Per-key limiter for one algorithm (in-process memory, the single-node case)
function createLimiter(name) {
  const algo = algorithms[name];
  const keys = new Map();
  return {
    keys,
    hit(key, trace, now = Date.now()) {
      if (!keys.has(key)) keys.set(key, algo.init(now));
      return algo.hit(keys.get(key), now, trace);
    },
    memBytes: () => [...keys.values()].reduce((sum, s) => sum + algo.mem(s), 0),
  };
}

module.exports = { LIMIT, WINDOW_MS, ENDPOINTS, parseHit, answer, algorithms, createLimiter };
