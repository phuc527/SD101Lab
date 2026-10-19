// Junior: REST API, counter + base62, URL validation, idempotent shorten
// Run: node server.js  (starts, self-tests, then shuts down)
const http = require('http');
const assert = require('assert');

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const toBase62 = (n) => { let s = ''; do { s = BASE62[n % 62] + s; n = Math.floor(n / 62); } while (n > 0); return s; };

let counter = 1_000_000; // DB auto-increment id; start high so codes aren't 1 char
const byCode = new Map(); // code -> url      (PRIMARY KEY code)
const byUrl = new Map();  // url  -> code     (UNIQUE INDEX long_url)

// Trust boundary: only http(s). Blocks javascript:, data:, file: (XSS / phishing via redirect)
function normalize(input) {
  try {
    const u = new URL(input);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : null;
  } catch { return null; }
}

const server = http.createServer(async (req, res) => {
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(body && JSON.stringify(body));
  };

  if (req.method === 'POST' && req.url === '/shorten') {
    let body = '';
    for await (const c of req) body += c;
    let url = null;
    try { url = normalize(JSON.parse(body).url); } catch {}
    if (!url) return send(400, { error: 'valid http(s) url required' });
    if (byUrl.has(url)) return send(200, { code: byUrl.get(url), existed: true }); // idempotent
    const code = toBase62(++counter); // unique by construction, no collision check needed
    byCode.set(code, url);
    byUrl.set(url, code);
    return send(201, { code, existed: false });
  }

  const code = req.url.slice(1);
  if (req.method === 'GET' && byCode.has(code)) return send(302, null, { location: byCode.get(code) });
  send(404, { error: 'not found' });
});

server.listen(3020, async () => {
  const B = 'http://localhost:3020';
  const shorten = (url) => fetch(`${B}/shorten`, { method: 'POST', body: JSON.stringify({ url }) })
    .then(async (r) => ({ status: r.status, ...(await r.json()) }));

  const a = await shorten('https://example.com/very/long/path?utm=1');
  const again = await shorten('https://example.com/very/long/path?utm=1');
  const b = await shorten('https://example.com/other');
  const bad = await shorten('javascript:alert(1)');
  const r = await fetch(`${B}/${a.code}`, { redirect: 'manual' });
  const missing = await fetch(`${B}/zzzz`, { redirect: 'manual' });

  console.log('shorten           ->', a);
  console.log('shorten same URL  ->', again, '(idempotent)');
  console.log('shorten other URL ->', b, '(next counter value)');
  console.log('javascript: URL   ->', bad);
  console.log(`GET /${a.code}       -> ${r.status} Location: ${r.headers.get('location')}`);
  console.log('GET /zzzz         ->', missing.status);

  assert.equal(a.status, 201); assert.equal(again.code, a.code); assert.equal(again.existed, true);
  assert.notEqual(b.code, a.code); assert.equal(bad.status, 400);
  assert.equal(r.status, 302); assert.equal(missing.status, 404);
  console.log('\nok. Limitation: sequential codes are guessable (4c93, 4c94...), there is no cache, and a single DB counter is a bottleneck. See url-shortener-middle.');
  server.close();
  server.closeAllConnections();
});
