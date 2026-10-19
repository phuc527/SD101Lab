// Fresher backend: plain HTTP. No push at all, clients poll GET /messages every 2s.
const { serve, fail } = require('../../lib/api-kit');
const { USERS, createStore, assertUser } = require('../shared');

let db, stats, lastPoll;
function reset() {
  db = createStore();
  stats = { polls: 0, emptyPolls: 0, wastedPct: '0%', messages: 0 };
  lastPoll = new Map(); // user -> last poll time ("online" = polled recently)
}
reset();

serve(__dirname, {
  meta: {
    title: 'Short polling over HTTP',
    profile: 'write-heavy',
    realtime: 'poll',
    architecture: `client ──(every 2s) GET /messages?after=lastId──> API ──> messages table
client ──POST /send──> API ──> INSERT message
         (server can never call the client: no open connection)`,
    ideas: ['Polling is the simplest thing that works', 'after=lastId: only fetch what is new', 'Latency = up to one polling interval'],
    tradeoffs: ['Most polls come back empty: wasted requests and DB reads', 'Fast polling = load, slow polling = laggy chat', 'Does not scale to millions of idle clients'],
  },
  reset,
  routes: {
    'POST /send': ({ body, trace }) => {
      const { message } = db.send(body);
      stats.messages++;
      trace(`INSERT message #${message.id} (${message.convId} seq ${message.seq})`);
      trace(`no push: ${message.to} sees it on their next poll (up to 2s later)`);
      return { message };
    },
    'GET /messages': ({ query, trace }) => {
      const messages = db.sync(query.user, query.after);
      lastPoll.set(query.user, Date.now());
      stats.polls++;
      if (!messages.length) stats.emptyPolls++;
      stats.wastedPct = `${Math.round((stats.emptyPolls / stats.polls) * 100)}%`;
      trace(`SELECT messages WHERE id > ${Number(query.after) || 0} -> ${messages.length} rows${messages.length ? '' : ' (wasted poll)'}`);
      return { messages };
    },
    'GET /stream': () => fail(501, 'fresher has no push: poll GET /messages instead'),
    'POST /heartbeat': ({ body }) => { assertUser(body.user); return { ok: true }; },
    'GET /presence': () => ({ presence: USERS.map((user) => ({ user, online: Date.now() - (lastPoll.get(user) ?? 0) < 5000 })) }),
    'GET /stats': () => ({ stats }),
  },
});
