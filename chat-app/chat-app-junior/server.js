// Junior: real-time push with Server-Sent Events (stdlib only), offline sync
// Run: node server.js  (starts, self-tests, then shuts down)
// Production chat usually uses WebSocket (bidirectional); SSE shows the same push idea with zero deps.
const http = require('http');
const assert = require('assert');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const streams = new Map(); // userId -> Set(res): one user can have several tabs/devices
const inboxes = new Map(); // userId -> stored messages (the DB)
let seq = 0;

const push = (user, msg) => { for (const res of streams.get(user) ?? []) res.write(`id: ${msg.id}\ndata: ${JSON.stringify(msg)}\n\n`); };
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const user = url.searchParams.get('user');

  if (req.method === 'GET' && url.pathname === '/stream' && user) { // long-lived connection
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(': connected\n\n');
    const set = streams.get(user) ?? streams.set(user, new Set()).get(user);
    set.add(res);
    req.on('close', () => set.delete(res));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/send') {
    let body = '';
    for await (const c of req) body += c;
    const { from, to, text } = JSON.parse(body || '{}');
    if (!from || !to || !text) return json(res, 400, { error: 'from, to, text required' });
    const msg = { id: ++seq, from, to, text, sentAt: Date.now() };
    (inboxes.get(to) ?? inboxes.set(to, []).get(to)).push(msg); // persist FIRST
    push(to, msg); // then push; if the user is offline nothing happens and the message waits in the DB
    return json(res, 201, msg);
  }
  if (req.method === 'GET' && url.pathname === '/messages' && user) { // sync after reconnect
    const after = Number(url.searchParams.get('after')) || 0;
    return json(res, 200, (inboxes.get(user) ?? []).filter((m) => m.id > after));
  }
  json(res, 404, { error: 'not found' });
});

server.listen(3040, async () => {
  const B = 'http://localhost:3040';
  const send = (from, to, text) => fetch(`${B}/send`, { method: 'POST', body: JSON.stringify({ from, to, text }) });

  // Bob is online: he keeps an SSE stream open
  const ac = new AbortController();
  const received = [];
  const stream = await fetch(`${B}/stream?user=bob`, { signal: ac.signal });
  const reader = stream.body.pipeThrough(new TextDecoderStream()).getReader();
  (async () => {
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const data = buf.slice(0, i).split('\n').find((l) => l.startsWith('data: '));
          buf = buf.slice(i + 2);
          if (data) { const m = JSON.parse(data.slice(6)); received.push({ ...m, latency: Date.now() - m.sentAt }); }
        }
      }
    } catch {} // aborted at the end
  })();

  await send('alice', 'bob', 'hi bob');
  await send('alice', 'bob', 'are you there?');
  await sleep(50);
  received.forEach((m) => console.log(`bob (online) got pushed: "${m.text}" after ${m.latency}ms`));
  assert.equal(received.length, 2);

  // Carol is offline: the message is stored, she pulls it when she comes back
  await send('alice', 'carol', 'see you tomorrow');
  const missed = await fetch(`${B}/messages?user=carol&after=0`).then((r) => r.json());
  console.log('carol (offline) reconnects and syncs:', missed.map((m) => m.text));
  assert.equal(missed.length, 1);

  const users = 1_000_000, pollEvery = 2;
  console.log(`\npolling cost: ${users.toLocaleString()} users polling every ${pollEvery}s = ${(users / pollEvery).toLocaleString()} req/s, mostly empty responses`);
  console.log('push (SSE/WebSocket): the server only sends when there is a message, but holds 1M open connections');
  console.log('\nok. Limitation: if the network drops a message or the client retries, you get lost or duplicated messages. See chat-app-middle.');
  ac.abort();
  server.close();
  server.closeAllConnections();
});
