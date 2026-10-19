// Senior: write-heavy location pipeline, hot-spot sharding, AP vs CP data
const assert = require('assert');

let seed = 11;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32), seed / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());

// ---------- 1. Estimation ----------
console.log('=== 1. Estimation ===');
const DRIVERS = 1e6, PING_S = 4, TRIPS_DAY = 20e6, PING_BYTES = 100;
const writes = DRIVERS / PING_S, reads = TRIPS_DAY / 86400;
console.log(`location writes/s   ${writes.toLocaleString()}`);
console.log(`ride requests/s     ${Math.round(reads).toLocaleString()}   -> write:read ≈ ${Math.round(writes / reads)}:1  (WRITE-HEAVY)`);
console.log(`if every ping hit the DB: ${((writes * PING_BYTES * 86400) / 1e12).toFixed(1)} TB/day -> keep only the LATEST location in memory`);
console.log(`latest locations only:    ${((DRIVERS * PING_BYTES) / 1e6).toFixed(0)} MB -> fits in RAM (Redis GEO), history goes to Kafka -> cold storage`);

// ---------- 2. Latest-wins + out-of-order pings + TTL ----------
console.log('\n=== 2. Location store: last-write-wins by timestamp, TTL for dead drivers ===');
const loc = new Map(); // driverId -> { ts, lat, lng, expiresAt }
let dropped = 0;
const ping = (id, ts, lat, lng, now) => {
  const cur = loc.get(id);
  if (cur && cur.ts >= ts) return dropped++; // older ping arrived late (mobile network) -> ignore
  loc.set(id, { ts, lat, lng, expiresAt: now + 30_000 });
};
const pings = Array.from({ length: 10 }, (_, i) => ({ ts: i * 4000, lat: 10.77 + i * 0.001, lng: 106.70 }));
for (let i = pings.length - 1; i > 0; i--) if (rand() < 0.5) [pings[i], pings[i - 1]] = [pings[i - 1], pings[i]]; // reorder
pings.forEach((p) => ping('d1', p.ts, p.lat, p.lng, p.ts));
console.log(`arrival order (ts/1000): ${pings.map((p) => p.ts / 1000).join(' ')}`);
console.log(`stored: ts=${loc.get('d1').ts / 1000}s lat=${loc.get('d1').lat.toFixed(3)} | stale pings dropped: ${dropped}`);
assert.equal(loc.get('d1').ts, 36_000);
const available = (now) => [...loc].filter(([, v]) => v.expiresAt > now).map(([k]) => k);
console.log(`driver app crashes after last ping -> at t=60s available: [${available(60_000)}], at t=70s: [${available(70_000)}]`);
assert.deepEqual(available(70_000), []);

// ---------- 3. Sharding by area: hot spot in the city center ----------
console.log('\n=== 3. Shard the location index by area (50k drivers, dense center) ===');
const pts = Array.from({ length: 50_000 }, () => ({ x: Math.min(0.999, Math.max(0, 0.5 + gauss() * 0.12)), y: Math.min(0.999, Math.max(0, 0.5 + gauss() * 0.12)) }));
const fixed = new Map();
for (const p of pts) { const k = `${Math.floor(p.x * 4)}:${Math.floor(p.y * 4)}`; fixed.set(k, (fixed.get(k) ?? 0) + 1); }
// Quadtree: split any cell holding more than CAP drivers into 4
const CAP = 5000, leaves = [];
const split = (x, y, size, list) => {
  if (list.length <= CAP) return leaves.push(list.length);
  const h = size / 2;
  for (const [dx, dy] of [[0, 0], [h, 0], [0, h], [h, h]])
    split(x + dx, y + dy, h, list.filter((p) => p.x >= x + dx && p.x < x + dx + h && p.y >= y + dy && p.y < y + dy + h));
};
split(0, 0, 1, pts);
const stats = (arr) => ({ shards: arr.length, maxLoad: Math.max(...arr), avgLoad: Math.round(pts.length / arr.length), 'max/avg': (Math.max(...arr) / (pts.length / arr.length)).toFixed(1) });
console.table([{ scheme: 'fixed 4x4 grid', ...stats([...fixed.values()]) }, { scheme: `quadtree (cap ${CAP})`, ...stats(leaves.filter((n) => n > 0)) }]);
console.log('fixed grid: the downtown shard is overloaded; quadtree splits dense areas so each shard holds <= cap');
assert.ok(Math.max(...leaves) <= CAP);
assert.ok(Math.max(...fixed.values()) > CAP);

// ---------- 4. AP vs CP: location can be lossy, payment cannot ----------
console.log('\n=== 4. Payment: idempotency key so a retry never charges twice ===');
const charges = new Map(); // idempotencyKey -> charge (stored in the DB in the same transaction as trip completion)
const charge = (key, amount) => charges.get(key) ?? (charges.set(key, { id: `ch_${charges.size + 1}`, amount }), charges.get(key));
const a = charge('trip:t1:complete', 85_000);
const b = charge('trip:t1:complete', 85_000); // client timed out and retried
console.log(`first call -> ${a.id}, retry -> ${b.id}, total charges: ${charges.size}`);
assert.equal(charges.size, 1);
console.log('location: AP (eventual, lossy is fine) | trip + payment: CP (transaction + idempotency)');
console.log('\nAll senior checks passed.');
