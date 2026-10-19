// Senior backend: 3 gateways hold the connections, a session registry says who is where,
// pub/sub routes each message to the recipient's gateway (one publish per gateway for groups),
// presence = heartbeat with a TTL, and a gateway can crash without losing messages.
const { EventEmitter } = require('events');
const { serve, fail } = require('../../lib/api-kit');
const { USERS, createStore, membersOf, assertUser, openStream } = require('../shared');

const GATEWAYS = ['gw1', 'gw2', 'gw3'];
const PINNED = { alice: 'gw1', carol: 'gw2', bob: 'gw3' }; // load balancer's sticky choice
const PRESENCE_TTL = 6000;

const bus = new EventEmitter(); // Redis Pub/Sub / Kafka: one channel per gateway
const gateways = Object.fromEntries(GATEWAYS.map((id) => [id, { id, alive: true, conns: new Map() }])); // user -> Set<{push,res}>
GATEWAYS.forEach((id) => bus.on(id, ({ to, message }) => {
  const gw = gateways[id];
  if (gw.alive) for (const u of to) gw.conns.get(u)?.forEach((c) => c.push('message', message));
}));

let db, stats, registry, lastSeen;
function reset() {
  db = createStore({ dedup: true });
  stats = { messages: 0, busPublishes: 0, storedForOffline: 0, reconnects: 0, heartbeats: 0, heartbeatsDropped: 0 };
  registry = new Map(); // userId -> gatewayId (Redis, refreshed on connect)
  lastSeen = new Map(); // userId -> last heartbeat (Redis key with TTL)
}
reset();

function crash(id) {
  const gw = gateways[id];
  gw.alive = false;
  for (const [u, set] of gw.conns) {
    set.forEach((c) => c.res.end()); // sockets die -> clients reconnect via the load balancer
    if (registry.get(u) === id) registry.delete(u);
  }
  gw.conns.clear();
}

serve(__dirname, {
  meta: {
    title: 'Gateways + session registry + pub/sub + presence',
    profile: 'write-heavy',
    realtime: 'sse',
    architecture: `           ┌ gw1 (alice) ┐
client ═LB═┼ gw2 (carol) ┼══ registry: user -> gateway (Redis)
           └ gw3 (bob)   ┘
POST /send ─> persist (seq) ─> look up recipients' gateways in registry
           ─> bus.publish(gwX, {to:[...], msg})  one publish per GATEWAY, not per member
presence   = heartbeat every 2s, online while lastSeen < ${PRESENCE_TTL / 1000}s (TTL)
gw crash   = streams drop -> clients land on another gw -> sync after=lastId`,
    ideas: ['Stateful gateways scale out; the registry tells who is on which one', 'Pub/sub decouples senders from the gateway holding the recipient', 'Group: group recipients by gateway, publish once per gateway', 'Persisted log + sync makes gateway crashes lossless'],
    tradeoffs: ['Registry and bus are extra infra that must be highly available', 'Huge groups (100k) should pull instead of push', 'Presence by heartbeat is approximate (up to TTL stale) and chatty'],
  },
  controls: {
    crashGateway: { label: 'Crash a gateway', type: 'select', value: 'none', options: ['none', ...GATEWAYS] },
    background: { label: 'Background app (heartbeats stop)', type: 'select', value: 'none', options: ['none', ...USERS] },
  },
  onControl(id, value) {
    if (id !== 'crashGateway') return;
    GATEWAYS.forEach((g) => { gateways[g].alive = true; });
    if (GATEWAYS.includes(value)) crash(value);
  },
  reset,
  routes: {
    'POST /send': ({ body, trace }) => {
      const { message, duplicate } = db.send(body);
      if (duplicate) {
        trace(`retry of clientMsgId ${message.clientMsgId.slice(0, 8)} -> return original #${message.id}`);
        return { message };
      }
      stats.messages++;
      trace(`persist #${message.id}: ${message.convId} seq ${message.seq}`);
      const byGateway = new Map(); // group recipients by the gateway they are connected to
      for (const u of membersOf(message.convId)) {
        if (u === message.from) continue;
        const gw = registry.get(u);
        if (gw) (byGateway.get(gw) ?? byGateway.set(gw, []).get(gw)).push(u);
        else { stats.storedForOffline++; trace(`${u} not in registry (offline): stored only, synced on reconnect`); }
      }
      const fromGw = registry.get(message.from) ?? 'http';
      for (const [gw, to] of byGateway) {
        stats.busPublishes++;
        bus.emit(gw, { to, message });
        trace(`${message.from}@${fromGw} -> bus -> ${gw} -> ${to.join(', ')}`);
      }
      return { message };
    },
    'GET /messages': ({ query, trace }) => {
      const messages = db.sync(query.user, query.after);
      trace(`sync ${query.user}: id > ${Number(query.after) || 0} -> ${messages.length} messages`);
      return { messages };
    },
    'GET /stream': (ctx) => {
      const user = assertUser(ctx.query.user);
      const gwId = gateways[PINNED[user]].alive ? PINNED[user] : GATEWAYS.find((g) => gateways[g].alive);
      if (!gwId) fail(503, 'all gateways are down');
      const gw = gateways[gwId];
      if (gwId !== PINNED[user]) stats.reconnects++;
      const set = gw.conns.get(user) ?? gw.conns.set(user, new Set()).get(user);
      const conn = { res: ctx.res };
      conn.push = openStream(ctx, () => {
        set.delete(conn);
        if (!set.size && registry.get(user) === gwId) registry.delete(user);
      });
      set.add(conn);
      registry.set(user, gwId);
      conn.push('hello', { gateway: gwId });
    },
    'POST /heartbeat': ({ body, control, trace }) => {
      const user = assertUser(body.user);
      if (control('background') === user) {
        stats.heartbeatsDropped++;
        trace(`${user}'s app is in the background: heartbeat never sent, presence expires after TTL`);
        return { ok: false };
      }
      stats.heartbeats++;
      lastSeen.set(user, Date.now());
      return { ok: true };
    },
    'GET /presence': () => ({
      presence: USERS.map((user) => ({ user, online: Date.now() - (lastSeen.get(user) ?? 0) < PRESENCE_TTL, gateway: registry.get(user) ?? null })),
    }),
    'GET /stats': () => ({
      stats: { ...stats, ...Object.fromEntries(GATEWAYS.map((g) => [`${g}Conns`, gateways[g].alive ? [...gateways[g].conns.values()].reduce((n, s) => n + s.size, 0) : 'down'])) },
    }),
  },
});
