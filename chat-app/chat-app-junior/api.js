// Junior backend: one server keeps a long-lived connection per user (SSE here, WebSocket in practice).
// Persist first, then push to whoever is connected; offline users catch up with GET /messages?after=.
const { serve } = require('../../lib/api-kit');
const { USERS, createStore, membersOf, assertUser, openStream } = require('../shared');

let db, stats;
const conns = new Map(); // user -> Set of open streams (one per tab/device)
function reset() {
  db = createStore();
  stats = { messages: 0, pushed: 0, storedForOffline: 0, syncs: 0 };
}
reset();

serve(__dirname, {
  meta: {
    title: 'Single server with push (SSE / WebSocket)',
    profile: 'write-heavy',
    realtime: 'sse',
    architecture: `client ══ open stream (SSE/WebSocket) ══> chat server  (conns: user -> socket, in memory)
POST /send ──> 1. INSERT message (persist FIRST)
           └─> 2. recipient connected? push over its socket : keep it stored
reconnect  ──> GET /messages?after=lastId  (sync what was missed)`,
    ideas: ['Server pushes instantly over an open connection: no wasted polls', 'Persist before push so nothing is lost if the push fails', 'Offline users sync from the log with after=lastId'],
    tradeoffs: ['Connections live in ONE server\'s memory: cannot scale out as-is', 'A restart drops every connection at once', 'No dedup: a retried send stores the message twice'],
  },
  reset,
  routes: {
    'POST /send': ({ body, trace }) => {
      const { message } = db.send(body);
      stats.messages++;
      trace(`1. persist: INSERT message #${message.id} (${message.convId} seq ${message.seq})`);
      for (const u of membersOf(message.convId)) {
        if (u === message.from) continue;
        const streams = conns.get(u);
        if (streams?.size) {
          streams.forEach((push) => push('message', message));
          stats.pushed++;
          trace(`2. push to ${u} over its open stream`);
        } else {
          stats.storedForOffline++;
          trace(`2. ${u} is offline: stored only, synced on reconnect`);
        }
      }
      return { message };
    },
    'GET /messages': ({ query, trace }) => {
      const messages = db.sync(query.user, query.after);
      stats.syncs++;
      trace(`sync ${query.user}: messages with id > ${Number(query.after) || 0} -> ${messages.length}`);
      return { messages };
    },
    'GET /stream': (ctx) => {
      const user = assertUser(ctx.query.user);
      const set = conns.get(user) ?? conns.set(user, new Set()).get(user);
      const push = openStream(ctx, () => set.delete(push));
      set.add(push);
      push('hello', { gateway: 'chat-1' });
    },
    'POST /heartbeat': ({ body }) => { assertUser(body.user); return { ok: true }; },
    'GET /presence': () => ({ presence: USERS.map((user) => ({ user, online: !!conns.get(user)?.size })) }),
    'GET /stats': () => ({ stats: { ...stats, openConnections: [...conns.values()].reduce((n, s) => n + s.size, 0) } }),
  },
});
