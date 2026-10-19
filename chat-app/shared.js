// Shared data + helpers for every chat-app level, so all 4 APIs speak the same contract.
// API contract (same for every level):
//   POST /send { from, to, text, clientMsgId }  -> { message }        (to = a user or 'group:team')
//   GET  /messages?user=&after=                  -> { messages }       (history/sync: every message with id > after)
//   GET  /stream?user=                           -> Server-Sent Events: 'hello' { gateway } then one 'message' per push
//   POST /heartbeat { user }                     -> { ok }             (presence; only the senior level uses it)
//   GET  /presence                               -> { presence: [{ user, online, gateway? }] }
//   GET  /stats                                  -> { stats }
// meta.realtime = 'poll' | 'sse' tells the (identical) UI how to receive messages.
// A message: { id (global), convId, seq (per conversation), from, to, text, clientMsgId, createdAt }
const { fail } = require('../lib/api-kit');

const USERS = ['alice', 'bob', 'carol'];
const GROUP = 'group:team'; // everybody is a member
const convOf = (from, to) => (to === GROUP ? GROUP : `dm:${[from, to].sort().join(':')}`);
const membersOf = (convId) => (convId === GROUP ? USERS : convId.slice(3).split(':'));

function assertUser(u) {
  if (!USERS.includes(u)) fail(400, `unknown user ${u}`);
  return u;
}

function createStore({ dedup = false } = {}) {
  const messages = []; // the message log (Cassandra: partition convId, clustering seq)
  const seqByConv = new Map();
  const byClientId = new Map(); // clientMsgId -> stored message (idempotency key)
  return {
    messages,
    // returns { message, duplicate }: with dedup a retry gets the ORIGINAL message back, not a new seq
    send(body) {
      const from = assertUser(body.from);
      const to = body.to === GROUP ? GROUP : assertUser(body.to);
      if (from === to) fail(400, 'cannot message yourself');
      const text = String(body.text ?? '').trim();
      if (!text) fail(400, 'text required');
      if (text.length > 500) fail(400, 'text max 500 chars');
      const clientMsgId = typeof body.clientMsgId === 'string' ? body.clientMsgId.slice(0, 64) : '';
      if (dedup && clientMsgId && byClientId.has(clientMsgId)) return { message: byClientId.get(clientMsgId), duplicate: true };
      const convId = convOf(from, to);
      const seq = (seqByConv.get(convId) ?? 0) + 1;
      seqByConv.set(convId, seq);
      const message = { id: messages.length + 1, convId, seq, from, to, text, clientMsgId, createdAt: Date.now() };
      messages.push(message);
      if (clientMsgId) byClientId.set(clientMsgId, message);
      return { message, duplicate: false };
    },
    // everything this user can see with id > after (offline sync)
    sync(user, after) {
      assertUser(user);
      const a = Math.max(Number(after) || 0, 0);
      return messages.filter((m) => m.id > a && membersOf(m.convId).includes(user));
    },
  };
}

// Opens an SSE response for ctx (ctx.raw() so api-kit does not write JSON). Returns send(event, data).
function openStream(ctx, onClose) {
  ctx.raw();
  ctx.res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'access-control-allow-origin': '*',
  });
  ctx.res.write('retry: 1000\n\n'); // EventSource reconnects 1s after the stream drops
  const ping = setInterval(() => ctx.res.write(': ping\n\n'), 15000); // keep proxies from timing out
  ctx.req.on('close', () => { clearInterval(ping); onClose(); });
  return (event, data) => ctx.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

module.exports = { USERS, GROUP, convOf, membersOf, assertUser, createStore, openStream };
