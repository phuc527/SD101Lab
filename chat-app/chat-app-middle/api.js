// Middle backend: reliable delivery over an unreliable network.
// Server: per-conversation seq + dedup by clientMsgId. Client: retry with the same id, dedup + reorder buffer by seq.
const { serve } = require('../../lib/api-kit');
const { USERS, createStore, membersOf, assertUser, openStream } = require('../shared');

let db, stats;
const conns = new Map(); // user -> Set of open streams
function reset() {
  db = createStore({ dedup: true });
  stats = { messages: 0, retriesDeduped: 0, acksLost: 0, duplicatesPushed: 0, delayedPushes: 0 };
}
reset();
const chance = (pct) => Math.random() * 100 < (Number(pct) || 0);

serve(__dirname, {
  meta: {
    title: 'Reliable delivery: seq, idempotent send, dedup, reorder',
    profile: 'write-heavy',
    realtime: 'sse',
    architecture: `client: clientMsgId = uuid() ONCE ──POST /send──> server
  server: seen clientMsgId? return original : seq = ++seq[conv], INSERT
  ack lost (504)?  client retries with the SAME clientMsgId -> no duplicate stored
push (may arrive twice / out of order) ──> client buffer:
  seq <= lastSeq -> drop duplicate | gap -> hold back | contiguous -> show`,
    ideas: ['Server-assigned seq per conversation = one total order', 'clientMsgId makes POST /send idempotent: retries are safe', 'Client shows only contiguous seqs; gaps are filled by sync'],
    tradeoffs: ['Server keeps a clientMsgId index (needs a TTL in practice)', 'Hold-back buffer adds latency when a message is late', 'At-least-once on the wire, exactly-once only on screen'],
  },
  controls: {
    dropAckPercent: { label: 'Lose the ack (% of sends stored but answered 504)', type: 'number', value: 30, min: 0, max: 100, step: 10 },
    duplicatePercent: { label: 'Duplicate pushes (%)', type: 'number', value: 20, min: 0, max: 100, step: 10 },
    reorder: { label: 'Reorder pushes (random delay 0-1.5s)', type: 'toggle', value: true },
  },
  reset,
  routes: {
    'POST /send': ({ body, trace, control }) => {
      const { message, duplicate } = db.send(body);
      if (duplicate) {
        stats.retriesDeduped++;
        trace(`clientMsgId ${message.clientMsgId.slice(0, 8)} already stored -> return original #${message.id} (seq ${message.seq}), nothing new stored or pushed`);
        return { message };
      }
      stats.messages++;
      trace(`persist #${message.id}: ${message.convId} seq ${message.seq}`);
      for (const u of membersOf(message.convId)) {
        if (u === message.from || !conns.get(u)?.size) continue;
        const copies = chance(control('duplicatePercent')) ? 2 : 1;
        if (copies === 2) stats.duplicatesPushed++;
        for (let i = 0; i < copies; i++) {
          const push = () => conns.get(u)?.forEach((p) => p('message', message));
          if (control('reorder')) { stats.delayedPushes++; setTimeout(push, Math.random() * 1500); } else push();
        }
        trace(`push to ${u}${copies === 2 ? ' TWICE (network duplicate)' : ''}${control('reorder') ? ' with random delay (may overtake)' : ''}`);
      }
      if (chance(control('dropAckPercent'))) {
        stats.acksLost++;
        trace('ack LOST on the way back: message IS stored, client sees a timeout and will retry');
        return { status: 504, error: 'ack lost (gateway timeout); message was stored' };
      }
      return { message };
    },
    'GET /messages': ({ query, trace }) => {
      const messages = db.sync(query.user, query.after);
      trace(`sync ${query.user}: id > ${Number(query.after) || 0} -> ${messages.length} messages, ordered by seq`);
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
    'GET /stats': () => ({ stats }),
  },
});
