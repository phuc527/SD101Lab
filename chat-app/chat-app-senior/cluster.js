// Senior: many WebSocket gateways, session registry, pub/sub routing, group fan-out, presence, gateway crash
const assert = require('assert');
const { EventEmitter } = require('events');

// ---------- 1. Estimation ----------
console.log('=== 1. Estimation ===');
const DAU = 100e6, MSG_PER_USER = 40, CONCURRENT = 50e6, CONN_PER_GW = 100_000, MSG_BYTES = 200;
console.log(`messages/s avg     ${Math.round((DAU * MSG_PER_USER) / 86400).toLocaleString()} (peak x3)`);
console.log(`gateway servers    ${CONCURRENT / CONN_PER_GW} (${CONCURRENT.toLocaleString()} open connections / ${CONN_PER_GW.toLocaleString()} each)`);
console.log(`storage/day        ${((DAU * MSG_PER_USER * MSG_BYTES) / 1e9).toFixed(0)} GB -> Cassandra, partition (conversation_id, bucket), clustering seq`);

// ---------- Building blocks ----------
const bus = new EventEmitter(); // Redis Pub/Sub / Kafka: one channel per gateway
const registry = new Map();     // userId -> gatewayId (Redis, refreshed by heartbeat)
const store = new Map();        // convId -> messages (persist first)
let busPublishes = 0;

class Gateway {
  constructor(id) { this.id = id; this.conns = new Map(); this.alive = true; bus.on(id, (m) => this.alive && this.deliver(m)); }
  connect(user, client) { this.conns.set(user, client); registry.set(user, this.id); }
  deliver({ to, msg }) { for (const u of to) this.conns.get(u)?.inbox.push(msg); }
  crash() { this.alive = false; for (const u of this.conns.keys()) if (registry.get(u) === this.id) registry.delete(u); this.conns.clear(); }
}
const client = () => ({ inbox: [], lastSeq(conv) { return Math.max(0, ...this.inbox.filter((m) => m.convId === conv).map((m) => m.seq)); } });

function send(convId, members, from, text) {
  const log = store.get(convId) ?? store.set(convId, []).get(convId);
  const msg = { convId, seq: log.length + 1, from, text };
  log.push(msg); // 1. persist
  const byGateway = new Map(); // 2. group recipients by the gateway they are connected to
  for (const u of members) {
    if (u === from) continue;
    const gw = registry.get(u);
    if (gw) (byGateway.get(gw) ?? byGateway.set(gw, []).get(gw)).push(u); // offline -> stored only (+ mobile push notification)
  }
  for (const [gw, to] of byGateway) { busPublishes++; bus.emit(gw, { to, msg }); } // 3. one publish per gateway
  return msg;
}

// ---------- 2. Cross-gateway routing ----------
console.log('\n=== 2. alice on gw1 -> bob on gw3 ===');
const gws = { gw1: new Gateway('gw1'), gw2: new Gateway('gw2'), gw3: new Gateway('gw3') };
const users = {};
['alice', 'bob', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9'].forEach((u, i) => { users[u] = client(); gws[`gw${(i % 3) + 1}`].connect(u, users[u]); });
gws.gw3.connect('bob', users.bob); // bob is on gw3
send('dm:alice:bob', ['alice', 'bob'], 'alice', 'hi bob');
console.log(`registry: bob -> ${registry.get('bob')} | bob inbox: ${users.bob.inbox.map((m) => m.text)}`);
assert.equal(users.bob.inbox.length, 1);

// ---------- 3. Group fan-out ----------
console.log('\n=== 3. Group of 9 members spread over 3 gateways ===');
busPublishes = 0;
const group = Object.keys(users);
send('group:team', group, 'alice', 'release at 5pm');
const got = group.filter((u) => users[u].inbox.some((m) => m.convId === 'group:team')).length;
console.log(`8 recipients, bus publishes = ${busPublishes} (one per gateway, not per member), delivered = ${got}`);
console.log('huge groups/channels (100k members): stop pushing, members pull on open (like newsfeed celebrities)');
assert.equal(busPublishes, 3);
assert.equal(got, 8);

// ---------- 4. Presence: heartbeat + TTL ----------
console.log('\n=== 4. Presence: heartbeat every 10s, TTL 30s ===');
const presence = new Map(); // Redis: SET presence:{user} 1 EX 30
const heartbeat = (u, now) => presence.set(u, now + 30_000);
const online = (u, now) => (presence.get(u) ?? 0) > now;
heartbeat('alice', 0); heartbeat('bob', 0); heartbeat('bob', 20_000); // alice's app went to background after t=0
console.log(`t=40s alice: ${online('alice', 40_000) ? 'online' : 'offline'} | bob: ${online('bob', 40_000) ? 'online' : 'offline'}`);
console.log('no explicit "logout" needed: a dead connection just stops renewing the TTL');
assert.equal(online('alice', 40_000), false);
assert.equal(online('bob', 40_000), true);

// ---------- 5. Gateway crash ----------
console.log('\n=== 5. gw3 crashes while alice keeps sending to bob ===');
gws.gw3.crash();
send('dm:alice:bob', ['alice', 'bob'], 'alice', 'did you see the release?');
send('dm:alice:bob', ['alice', 'bob'], 'alice', 'hello??');
console.log(`bob's registry entry: ${registry.get('bob') ?? 'none'} -> messages only persisted`);
gws.gw2.connect('bob', users.bob); // LB routes the reconnect to a healthy gateway
const missed = store.get('dm:alice:bob').filter((m) => m.seq > users.bob.lastSeq('dm:alice:bob'));
users.bob.inbox.push(...missed);
console.log(`bob reconnects to gw2, syncs after seq ${missed[0].seq - 1}: ${missed.map((m) => m.text).join(' | ')}`);
assert.deepEqual(users.bob.inbox.filter((m) => m.convId === 'dm:alice:bob').map((m) => m.seq), [1, 2, 3]);
console.log('\nAll senior checks passed.');
