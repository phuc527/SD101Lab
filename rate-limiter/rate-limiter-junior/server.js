// Junior: token bucket middleware per API key, standard rate-limit headers
// Run: node server.js  (starts, self-tests, then shuts down)
const http = require('http');
const assert = require('assert');

const CAPACITY = 10, REFILL_PER_SEC = 5; // allows bursts of 10, sustained 5 req/s
const buckets = new Map(); // key -> { tokens, last }

function take(key, now = Date.now()) {
  const b = buckets.get(key) ?? { tokens: CAPACITY, last: now };
  b.tokens = Math.min(CAPACITY, b.tokens + ((now - b.last) / 1000) * REFILL_PER_SEC); // lazy refill, no timer per user
  b.last = now;
  const ok = b.tokens >= 1;
  if (ok) b.tokens -= 1;
  buckets.set(key, b);
  return { ok, remaining: Math.floor(b.tokens), retryAfter: Math.ceil((1 - b.tokens) / REFILL_PER_SEC) };
}
// Evict idle buckets so memory doesn't grow forever
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.last > 60_000) buckets.delete(k); }, 60_000).unref();

function rateLimit(handler) {
  return (req, res) => {
    const key = req.headers['x-api-key'] ?? req.socket.remoteAddress; // per API key, fall back to IP
    const r = take(key);
    res.setHeader('X-RateLimit-Limit', CAPACITY);
    res.setHeader('X-RateLimit-Remaining', r.remaining);
    if (!r.ok) {
      res.writeHead(429, { 'Retry-After': r.retryAfter, 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'too many requests' }));
    }
    handler(req, res);
  };
}

const server = http.createServer(rateLimit((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{"data":"ok"}');
}));

server.listen(3030, async () => {
  const hit = (key) => fetch('http://localhost:3030/api', { headers: { 'x-api-key': key } });

  const burst = await Promise.all(Array.from({ length: 12 }, () => hit('alice')));
  console.log('alice bursts 12 requests (bucket = 10):', burst.map((r) => r.status).join(' '));
  const blocked = burst.find((r) => r.status === 429);
  console.log('429 response headers:', { 'Retry-After': blocked.headers.get('retry-after'), 'X-RateLimit-Remaining': blocked.headers.get('x-ratelimit-remaining') });
  assert.equal(burst.filter((r) => r.status === 200).length, 10);

  const bob = await hit('bob');
  console.log('bob (different key) ->', bob.status);
  assert.equal(bob.status, 200);

  await new Promise((r) => setTimeout(r, 400)); // refills 400ms * 5/s = 2 tokens
  const after = await Promise.all(Array.from({ length: 3 }, () => hit('alice')));
  console.log('alice after waiting 400ms (+2 tokens):', after.map((r) => r.status).join(' '));
  assert.equal(after.filter((r) => r.status === 200).length, 2);

  console.log('\nok. Limitation: buckets live in this process memory; with 3 API servers each one has its own bucket. See rate-limiter-senior.');
  server.close();
  server.closeAllConnections();
});
