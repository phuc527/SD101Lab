// Senior backend: location pipeline (last-write-wins + TTL eviction), quadtree shards for hot spots,
// lock-based matching with surge, idempotent payment on completion.
const { serve, sleep, fail } = require('../../lib/api-kit');
const S = require('../shared');

const TTL_MS = 8000; // a driver that stops pinging disappears after this
const SHARD_CAP = 30; // quadtree splits a region when it holds more drivers than this

let world, grid, locks, payments, stats, pingWindow;
let offerTimeout = 1500;
let killApps = false;
const killed = new Set();

// one ping = what the driver app sends; it may arrive late (network) -> keep only the newest by timestamp
function ingest(d, ping) {
  stats.pingsTotal++; pingWindow++;
  if (ping.ts < d.ts) { stats.staleDropped++; return; } // last-write-wins on the device timestamp
  if (d.evicted) { d.evicted = false; stats.rejoined++; }
  world.move(d, ping, ping.ts);
}

function tick() {
  const now = Date.now();
  for (const d of world.drivers) {
    if (killed.has(d.id)) continue; // app crashed: no pings at all
    const old = { lat: d.lat, lng: d.lng, ts: now - 1500 };
    const pos = d.status === 'offline' ? d : world.jitter(d);
    ingest(d, { lat: pos.lat, lng: pos.lng, ts: now });
    if (world.rand() < 0.1) ingest(d, old); // a delayed ping from 1.5s ago shows up after the newer one
  }
  for (const d of world.drivers) {
    if (!d.evicted && now - d.ts > TTL_MS) { d.evicted = true; grid.remove(d); stats.evicted++; } // key expired
  }
  stats.pingsPerSec = pingWindow; pingWindow = 0;
}

function applyKill() {
  killed.clear();
  if (!killApps) return;
  // kill 20% of driver apps (not those on a trip), deterministic pick
  world.drivers.filter((d) => !d.tripIds.size && Number(d.id.slice(1)) % 5 === 0).forEach((d) => killed.add(d.id));
}

function reset() {
  world?.stop();
  stats = { pingsPerSec: 0, pingsTotal: 0, staleDropped: 0, evicted: 0, rejoined: 0, requests: 0, matched: 0, offerTimeouts: 0, lockConflicts: 0, doubleBookings: 0, charges: 0, idempotentReplays: 0, revenueVnd: 0 };
  pingWindow = 0;
  grid = S.createGrid();
  locks = S.createLocks();
  payments = new Map(); // idempotency key -> payment
  world = S.createWorld({ tick, onMove: (d) => (d.status === 'offline' || d.evicted ? grid.remove(d) : grid.update(d)) });
  applyKill();
}
reset();

// Adaptive shards: split a box into 4 while it holds > SHARD_CAP drivers. Dense downtown -> small shards.
const inBox = (p, b) => p.lat >= b.lat0 && p.lat <= b.lat1 && p.lng >= b.lng0 && p.lng <= b.lng1;
function shards(points, box = { lat0: S.BBOX.minLat, lng0: S.BBOX.minLng, lat1: S.BBOX.maxLat, lng1: S.BBOX.maxLng }, depth = 0) {
  if (points.length <= SHARD_CAP || depth >= 5) return [{ ...box, load: points.length }];
  const mLat = (box.lat0 + box.lat1) / 2, mLng = (box.lng0 + box.lng1) / 2;
  const quads = [
    { lat0: box.lat0, lng0: box.lng0, lat1: mLat, lng1: mLng }, { lat0: box.lat0, lng0: mLng, lat1: mLat, lng1: box.lng1 },
    { lat0: mLat, lng0: box.lng0, lat1: box.lat1, lng1: mLng }, { lat0: mLat, lng0: mLng, lat1: box.lat1, lng1: box.lng1 },
  ];
  // each point goes to the first quad that contains it (borders are inclusive)
  const parts = quads.map(() => []);
  points.forEach((p) => parts[quads.findIndex((q) => inBox(p, q))].push(p));
  return quads.flatMap((q, i) => shards(parts[i], q, depth + 1));
}
const live = () => world.drivers.filter((d) => !d.evicted);
const r4 = (s) => ({ lat0: S.round(s.lat0, 4), lng0: S.round(s.lng0, 4), lat1: S.round(s.lat1, 4), lng1: S.round(s.lng1, 4), load: s.load });

async function requestOne(riderId, point, trace) {
  stats.requests++;
  world.demand.push({ ...point, at: Date.now() });
  const shard = shards(live()).find((s) => inBox(point, s));
  trace(`${riderId}: route to quadtree shard [${shard.lat0.toFixed(3)}, ${shard.lng0.toFixed(3)}] load ${shard.load} (cap ${SHARD_CAP})`);
  const surge = S.surgeAt(S.surgeMap(world), point);
  const { list, scanned } = grid.nearest(point);
  await sleep(scanned.drivers / 2000);
  trace(`${riderId}: GEOSEARCH ${scanned.cells} cells, ${scanned.drivers.toLocaleString()} of ${scanned.of.toLocaleString()} drivers, surge ${surge}x`);
  const trip = await S.offerBook(world, locks, { riderId, point, list, surge }, trace, stats, offerTimeout);
  stats.matched++;
  return { trip, driver: S.publicDriver(world.byId.get(trip.driverId)), km: trip.km, scanned };
}

// Payment is charged exactly once per trip: key = trip id. A retried "complete" replays the stored result.
async function advance({ params, body, trace }) {
  const trip = world.trips.get(Number(params.id)) ?? fail(404, `trip ${params.id} not found`);
  const key = `pay:trip:${trip.id}`;
  if (body.to === 'completed' && trip.status === 'completed') {
    stats.idempotentReplays++;
    trace(`Idempotency-Key ${key} already used -> return stored payment, NOT charged again`);
    return { trip, payment: payments.get(key) };
  }
  S.advanceTrip(world, trip.id, body.to, trace);
  if (trip.status !== 'completed') return { trip };
  await sleep(30); // payment gateway call
  const payment = { key, amountVnd: trip.fare, chargedAt: Date.now() };
  payments.set(key, payment);
  stats.charges++; stats.revenueVnd += trip.fare;
  trace(`POST /charges Idempotency-Key: ${key} amount ${trip.fare.toLocaleString()} VND -> charged`);
  return { trip, payment };
}

serve(__dirname, {
  meta: {
    title: 'Location pipeline + adaptive shards + idempotent payment',
    profile: 'write-heavy',
    architecture: `Driver app ══ws══ Gateway ─(ping/s)─> Location svc ─> Redis GEO, sharded by quadtree, key TTL ${TTL_MS / 1000}s
                                    │ last-write-wins on ping timestamp (late pings dropped)
                                    └─> Kafka "locations" -> history, surge, ETA
Rider ─> Trip svc ─> Matching (shard lookup, GEOSEARCH, SET NX lock, offers) ─> Trip DB (Postgres)
                 └─> Payment svc (Idempotency-Key = trip id) ─> card gateway`,
    ideas: ['~250k location writes/s vs a few hundred reads/s: keep only the latest position in RAM', 'Out-of-order pings: last-write-wins by device timestamp; dead apps expire via TTL', 'Quadtree shards split hot downtown; payment is idempotent so retries never double charge'],
    tradeoffs: ['Location is AP: a few seconds stale is fine; payment is CP: exactly-once via idempotency', 'Quadtree re-sharding moves keys between nodes', 'TTL too short evicts drivers in tunnels, too long matches dead apps'],
  },
  controls: {
    killApps: { label: 'Kill 20% of driver apps', type: 'toggle', value: false },
    offerTimeout: { label: 'Offer timeout (ms)', type: 'number', value: 1500, min: 300, max: 5000, step: 100 },
  },
  onControl: (id, v) => {
    if (id === 'killApps') { killApps = !!v; applyKill(); }
    if (id === 'offerTimeout') offerTimeout = S.clamp(Number(v) || 1500, 300, 5000);
  },
  reset,
  routes: {
    'GET /drivers': () => ({ drivers: live().map(S.publicDriver), bbox: S.BBOX, fleet: S.FLEET, surge: S.surgeMap(world), shards: shards(live()).map(r4) }),
    'GET /trips': () => ({ trips: world.listTrips() }),
    'GET /stats': () => ({ stats: { ...stats, liveDrivers: live().length, appsKilled: killed.size, shards: shards(live()).length } }),
    'POST /request': ({ body, trace }) => requestOne(S.parseRider(body.riderId), S.parsePoint(body), trace),
    'POST /request-burst': ({ body, trace }) => S.burst(body, (r, p) => requestOne(r, p, trace)),
    'POST /trips/:id/advance': advance,
  },
});
