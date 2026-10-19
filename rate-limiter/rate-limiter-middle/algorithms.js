// Middle: 5 algorithms, same limit (10 req / 1000ms), same traffic
const assert = require('assert');
const LIMIT = 10, WINDOW = 1000;

const algorithms = {
  'fixed window': () => {
    let win = -1, count = 0;
    return (t) => {
      const w = Math.floor(t / WINDOW);
      if (w !== win) { win = w; count = 0; }
      if (count >= LIMIT) return false;
      count++; return true;
    };
  },
  'sliding log': () => {
    const log = []; // one timestamp per accepted request
    return (t) => {
      while (log.length && log[0] <= t - WINDOW) log.shift();
      if (log.length >= LIMIT) return false;
      log.push(t); return true;
    };
  },
  'sliding window counter': () => {
    let win = -1, curr = 0, prev = 0;
    return (t) => {
      const w = Math.floor(t / WINDOW);
      if (w !== win) { prev = w === win + 1 ? curr : 0; curr = 0; win = w; }
      const estimate = prev * (1 - (t % WINDOW) / WINDOW) + curr; // weight the previous window by overlap
      if (estimate >= LIMIT) return false;
      curr++; return true;
    };
  },
  'token bucket': () => {
    let tokens = LIMIT, last = 0;
    return (t) => {
      tokens = Math.min(LIMIT, tokens + ((t - last) / WINDOW) * LIMIT); last = t;
      if (tokens < 1) return false;
      tokens--; return true;
    };
  },
  'leaky bucket': () => {
    let level = 0, last = 0; // queue drains to the backend at a constant 10/s
    return (t) => {
      level = Math.max(0, level - ((t - last) / WINDOW) * LIMIT); last = t;
      if (level + 1 > LIMIT) return false;
      level++; return true;
    };
  },
};
const memory = {
  'fixed window': '1 counter',
  'sliding log': `${LIMIT} timestamps (grows with limit)`,
  'sliding window counter': '2 counters',
  'token bucket': 'tokens + timestamp',
  'leaky bucket': 'level/queue + timestamp',
};

// Max accepted requests inside any 1000ms sliding window = what the backend actually feels
const maxInAnyWindow = (ts) => Math.max(0, ...ts.map((t0) => ts.filter((t) => t >= t0 && t < t0 + WINDOW).length));

const boundary = [...Array(10)].map((_, i) => 900 + i * 10).concat([...Array(10)].map((_, i) => 1000 + i * 10));
const sustained = [...Array(40)].map((_, i) => i * 50); // 20 req/s for 2s, double the limit

const rows = Object.entries(algorithms).map(([name, make]) => {
  const a = make(), b = make();
  const okA = boundary.filter((t) => a(t));
  const okB = sustained.filter((t) => b(t));
  return { algorithm: name, 'boundary burst: allowed/20': okA.length, 'max in any 1s': maxInAnyWindow(okA), 'sustained 20/s: allowed/40': okB.length, memory: memory[name] };
});
console.log(`Limit = ${LIMIT} req / ${WINDOW}ms`);
console.log('Traffic A: 10 requests at 900-990ms + 10 at 1000-1090ms (boundary burst)');
console.log('Traffic B: one request every 50ms for 2s (20 req/s)');
console.table(rows);

// Leaky bucket also SHAPES traffic: queued requests leave at a fixed pace
const departures = [];
let lastOut = -Infinity;
for (const t of boundary.slice(0, 10)) departures.push((lastOut = Math.max(t, lastOut + WINDOW / LIMIT)));
console.log('leaky bucket output to backend (ms):', departures.join(' '), '-> smooth 1 req / 100ms');

const byName = Object.fromEntries(rows.map((r) => [r.algorithm, r]));
assert.equal(byName['fixed window']['max in any 1s'], 20);
assert.ok(byName['sliding log']['max in any 1s'] <= LIMIT);
console.log('\nok. Limitation: all of these run in one process. See rate-limiter-senior for the distributed version.');
