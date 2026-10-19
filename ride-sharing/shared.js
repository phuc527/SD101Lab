// Shared world + helpers for every ride-sharing level, so all 4 APIs start from the same city.
// API contract (same for every level):
//   GET  /drivers                          -> { drivers: [{ id, lat, lng, status }], bbox, fleet, surge?, shards? }
//   POST /request { riderId, lat, lng }     -> { trip, driver, km, scanned } | 404 no driver | 409 rider busy
//   POST /request-burst { count, lat, lng } -> { results: [{ riderId, driverId?, tripId?, error? }], doubleBookings }
//   POST /trips/:id/advance { to }          -> { trip, payment? }  to = accepted | in_progress | completed | cancelled
//                                              illegal transition -> 409 (cancel only before in_progress)
//   GET  /trips                             -> { trips: [trip] } newest first
//   GET  /stats                             -> { stats: { ... } }
// status: available | on_trip | offline. Drivers move every second on the server.
const { fail, sleep } = require('../lib/api-kit');

const BBOX = { minLat: 10.70, maxLat: 10.90, minLng: 106.60, maxLng: 106.80 }; // Ho Chi Minh City
const VISIBLE = 300; // drivers drawn on the map
// ponytail: the 50k hidden fleet is modelled as uniform density (counted in scan cost, never matched),
// so the scan-vs-index difference shows up without simulating 50k moving objects.
const HIDDEN_FLEET = 50_000;
const FLEET = VISIBLE + HIDDEN_FLEET;

// mulberry32: tiny seeded PRNG, same city on every start/reset
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// equirectangular approximation, good enough inside one city
const km = (a, b) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180));
const round = (v, d = 2) => +v.toFixed(d);

// ---- input validation at the API boundary ----
function parsePoint(body) {
  const lat = Number(body.lat), lng = Number(body.lng);
  if (body.lat == null || body.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) fail(400, 'lat and lng must be numbers');
  if (lat < BBOX.minLat || lat > BBOX.maxLat || lng < BBOX.minLng || lng > BBOX.maxLng) {
    fail(400, `pickup must be inside the city: lat ${BBOX.minLat}..${BBOX.maxLat}, lng ${BBOX.minLng}..${BBOX.maxLng}`);
  }
  return { lat, lng };
}
function parseRider(v) {
  const s = String(v ?? '').trim();
  if (!/^[\w-]{1,32}$/.test(s)) fail(400, 'riderId required (letters, digits, - or _, max 32 chars)');
  return s;
}
function parseCount(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 20) fail(400, 'count must be an integer 1..20');
  return n;
}

// ---- the world: drivers + trips ----
// opts.onMove(driver) is called after every position change (geo index levels update their index there).
// opts.tick replaces the default movement loop (senior simulates a ping pipeline instead).
function createWorld({ seed = 42, onMove, tick } = {}) {
  const rand = rng(seed);
  const center = { lat: 10.776, lng: 106.700 }; // District 1: dense downtown -> hot spot
  const drivers = [];
  for (let i = 0; i < VISIBLE; i++) {
    const dense = i < VISIBLE * 0.6;
    const g = () => (rand() + rand() + rand() - 1.5) * 0.035; // rough bell curve around downtown
    drivers.push({
      id: `d${i + 1}`,
      lat: dense ? clamp(center.lat + g(), BBOX.minLat, BBOX.maxLat) : BBOX.minLat + rand() * 0.2,
      lng: dense ? clamp(center.lng + g(), BBOX.minLng, BBOX.maxLng) : BBOX.minLng + rand() * 0.2,
      status: rand() < 0.1 ? 'offline' : 'available',
      tripIds: new Set(), // more than one entry = double booked
      ts: Date.now(),
    });
  }
  const byId = new Map(drivers.map((d) => [d.id, d]));
  const trips = new Map();
  const demand = []; // { lat, lng, at } of recent requests, for surge
  let seq = 0;

  const world = {
    drivers, byId, trips, demand, rand,
    // next device position: small random walk (~100m per second)
    jitter: (d) => ({
      lat: clamp(d.lat + (rand() - 0.5) * 0.0018, BBOX.minLat, BBOX.maxLat),
      lng: clamp(d.lng + (rand() - 0.5) * 0.0018, BBOX.minLng, BBOX.maxLng),
    }),
    move(d, pos, ts = Date.now()) {
      d.lat = pos.lat; d.lng = pos.lng; d.ts = ts;
      onMove?.(d);
    },
    createTrip(riderId, point, driver, surge = 1) {
      const busy = [...trips.values()].find((t) => t.riderId === riderId && ['requested', 'accepted', 'in_progress'].includes(t.status));
      if (busy) fail(409, `rider ${riderId} already has active trip #${busy.id}`);
      const rideKm = 2 + rand() * 8;
      const trip = {
        id: ++seq, riderId, driverId: driver.id, status: 'requested',
        pickup: point, km: round(km(driver, point)), surge,
        fare: Math.round(((15000 + 9000 * rideKm) * surge) / 1000) * 1000, // VND
        createdAt: Date.now(),
      };
      trips.set(trip.id, trip);
      driver.tripIds.add(trip.id);
      driver.status = 'on_trip';
      return trip;
    },
    listTrips: () => [...trips.values()].reverse().slice(0, 50),
    stop: () => clearInterval(timer),
  };
  const defaultTick = () => drivers.forEach((d) => d.status !== 'offline' && world.move(d, world.jitter(d)));
  const timer = setInterval(() => (tick ?? defaultTick)(world), 1000);
  timer.unref();
  drivers.forEach((d) => onMove?.(d));
  return world;
}

// ---- trip state machine ----
const NEXT = { requested: 'accepted', accepted: 'in_progress', in_progress: 'completed' };
function advanceTrip(world, id, to, trace) {
  const trip = world.trips.get(Number(id)) ?? fail(404, `trip ${id} not found`);
  if (!['accepted', 'in_progress', 'completed', 'cancelled'].includes(to)) fail(400, 'to must be accepted | in_progress | completed | cancelled');
  const ok = to === 'cancelled' ? ['requested', 'accepted'].includes(trip.status) : NEXT[trip.status] === to;
  if (!ok) {
    trace(`REJECT ${trip.status} -> ${to}`);
    fail(409, `illegal transition ${trip.status} -> ${to}${to === 'cancelled' ? ' (cancel is only allowed before in_progress)' : ''}`);
  }
  trace(`UPDATE trips SET status='${to}' WHERE id=${trip.id} AND status='${trip.status}'`);
  trip.status = to;
  if (to === 'completed' || to === 'cancelled') {
    const d = world.byId.get(trip.driverId);
    d.tripIds.delete(trip.id);
    if (!d.tripIds.size && d.status === 'on_trip') d.status = 'available';
    trace(`driver ${d.id} -> ${d.status}`);
  }
  return trip;
}

// ---- matching helpers ----
// Brute force: distance to every driver (what fresher does).
function scanAll(world, point) {
  const list = world.drivers.filter((d) => d.status === 'available').sort((a, b) => km(a, point) - km(b, point));
  return { list, scanned: { drivers: FLEET, of: FLEET } };
}

// Grid index: ~1km cells, ring search around the pickup cell.
const CELL = 0.009; // degrees ≈ 1km
const ROWS = Math.ceil((BBOX.maxLat - BBOX.minLat) / CELL);
const COLS = Math.ceil((BBOX.maxLng - BBOX.minLng) / CELL);
const HIDDEN_PER_CELL = HIDDEN_FLEET / (ROWS * COLS);
const cellOf = (p) => [clamp(Math.floor((p.lat - BBOX.minLat) / CELL), 0, ROWS - 1), clamp(Math.floor((p.lng - BBOX.minLng) / CELL), 0, COLS - 1)];

function createGrid() {
  const cells = new Map(); // "r:c" -> Set(driver)
  const grid = {
    cells,
    update(d) { // called on every location ping: move the driver between cell sets if needed
      const key = cellOf(d).join(':');
      if (d.cell === key) return;
      grid.remove(d);
      (cells.get(key) ?? cells.set(key, new Set()).get(key)).add(d);
      d.cell = key;
    },
    remove(d) { if (d.cell) cells.get(d.cell)?.delete(d); d.cell = null; },
    // ring 0 = own cell, ring 1 = 8 neighbours, ... Stop one ring after the first hit
    // (a closer driver may sit just across a cell border).
    nearest(point, isFree = (d) => d.status === 'available') {
      const [r0, c0] = cellOf(point);
      const found = [];
      let cellsScanned = 0, driversScanned = 0, hitRing = -1;
      for (let ring = 0; ring < Math.max(ROWS, COLS); ring++) {
        for (let r = r0 - ring; r <= r0 + ring; r++) {
          for (let c = c0 - ring; c <= c0 + ring; c++) {
            if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== ring || r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
            cellsScanned++;
            const set = cells.get(`${r}:${c}`);
            driversScanned += (set?.size ?? 0) + HIDDEN_PER_CELL;
            set?.forEach((d) => isFree(d) && found.push(d));
          }
        }
        if (found.length && hitRing < 0) hitRing = ring;
        if (hitRing >= 0 && ring > hitRing) break;
      }
      found.sort((a, b) => km(a, point) - km(b, point));
      return { list: found, scanned: { cells: cellsScanned, drivers: Math.round(driversScanned), of: FLEET } };
    },
  };
  return grid;
}

// ---- booking ----
// Naive check-then-set: read "available", do some work, then write. Two requests can both pass the check.
async function naiveBook(world, { riderId, point, list }, trace, stats) {
  const d = list[0];
  if (!d) fail(404, 'no available driver nearby');
  trace(`${riderId}: SELECT status FROM drivers WHERE id='${d.id}' -> '${d.status}'`);
  await sleep(20 + world.rand() * 40); // pricing, ETA call, DB round trip... the race window
  if (d.tripIds.size) {
    stats.doubleBookings++;
    trace(`${riderId}: UPDATE drivers SET status='on_trip' WHERE id='${d.id}' -> but ${d.id} already has trip #${[...d.tripIds][0]}: DOUBLE BOOKING`);
  } else {
    trace(`${riderId}: UPDATE drivers SET status='on_trip' WHERE id='${d.id}'`);
  }
  return world.createTrip(riderId, point, d);
}

// Atomic lock with TTL (Redis SET NX PX) + offer flow: driver may accept slowly or ignore; the lock just expires.
function createLocks() {
  const locks = new Map(); // driverId -> { owner, exp }
  return {
    setNX(key, owner, ttlMs) {
      const l = locks.get(key);
      if (l && l.exp > Date.now()) return false;
      locks.set(key, { owner, exp: Date.now() + ttlMs });
      return true;
    },
    del: (key) => locks.delete(key),
    held: () => [...locks.values()].filter((l) => l.exp > Date.now()).length,
  };
}
async function offerBook(world, locks, { riderId, point, list, surge = 1 }, trace, stats, timeoutMs, maxOffers = 3) {
  let offers = 0;
  for (const d of list) {
    if (offers >= maxOffers) break;
    if (!locks.setNX(d.id, riderId, timeoutMs)) {
      stats.lockConflicts++;
      trace(`${riderId}: SET lock:driver:${d.id} NX -> taken by another rider, skip`);
      continue;
    }
    if (d.status !== 'available') { locks.del(d.id); continue; } // re-check under the lock
    offers++;
    trace(`${riderId}: SET lock:driver:${d.id} ${riderId} NX PX ${timeoutMs} -> OK, offer #${offers} sent`);
    const ignores = world.rand() < 0.2;
    const delay = Math.round(200 + world.rand() * 1800);
    if (ignores || delay > timeoutMs) {
      await sleep(timeoutMs);
      stats.offerTimeouts++;
      trace(`${riderId}: ${d.id} ${ignores ? 'ignored the offer' : `needs ${delay}ms`}; lock expired after ${timeoutMs}ms -> next driver`);
      continue; // no cleanup needed: TTL frees the driver
    }
    await sleep(delay);
    trace(`${riderId}: ${d.id} accepted after ${delay}ms (still holding the lock)`);
    const trip = world.createTrip(riderId, point, d, surge);
    locks.del(d.id);
    return trip;
  }
  fail(404, offers ? `no driver accepted after ${offers} offer(s)` : 'no available driver nearby');
}

// ---- surge: demand (requests in last 60s) / supply (available drivers) per ~2km zone, capped at 3x ----
const ZONE = 0.02;
const zoneOf = (p) => [Math.floor((p.lat - BBOX.minLat) / ZONE), Math.floor((p.lng - BBOX.minLng) / ZONE)];
function surgeMap(world) {
  const now = Date.now();
  while (world.demand.length && world.demand[0].at < now - 60_000) world.demand.shift();
  const zones = new Map();
  const z = (p) => { const k = zoneOf(p).join(':'); return zones.get(k) ?? zones.set(k, { demand: 0, supply: 0 }).get(k); };
  world.demand.forEach((p) => z(p).demand++);
  world.drivers.forEach((d) => d.status === 'available' && !d.evicted && z(d).supply++);
  const cells = [];
  for (const [k, v] of zones) {
    const multiplier = round(clamp(v.demand / Math.max(v.supply, 1), 1, 3), 1);
    if (multiplier <= 1) continue;
    const [r, c] = k.split(':').map(Number);
    const lat0 = BBOX.minLat + r * ZONE, lng0 = BBOX.minLng + c * ZONE;
    cells.push({ lat0, lng0, lat1: Math.min(lat0 + ZONE, BBOX.maxLat), lng1: Math.min(lng0 + ZONE, BBOX.maxLng), multiplier, demand: v.demand, supply: v.supply });
  }
  return cells;
}
const surgeAt = (cells, p) => cells.find((c) => p.lat >= c.lat0 && p.lat < c.lat1 && p.lng >= c.lng0 && p.lng < c.lng1)?.multiplier ?? 1;

const publicDriver = (d) => ({ id: d.id, lat: round(d.lat, 5), lng: round(d.lng, 5), status: d.status });

// Burst: N riders at the same spot fire concurrently.
async function burst(body, requestOne) {
  const point = parsePoint(body);
  const count = parseCount(body.count);
  const tag = Date.now().toString(36).slice(-4);
  const results = await Promise.all(Array.from({ length: count }, async (_, i) => {
    const riderId = `burst-${tag}-${i + 1}`;
    try {
      const { trip } = await requestOne(riderId, point);
      return { riderId, driverId: trip.driverId, tripId: trip.id };
    } catch (e) {
      return { riderId, error: e.message };
    }
  }));
  const perDriver = new Map();
  results.forEach((r) => r.driverId && perDriver.set(r.driverId, (perDriver.get(r.driverId) ?? 0) + 1));
  const doubleBookings = [...perDriver.values()].reduce((s, n) => s + n - 1, 0);
  return { results, doubleBookings };
}

module.exports = {
  BBOX, VISIBLE, HIDDEN_FLEET, FLEET, rng, km, round, clamp,
  parsePoint, parseRider, parseCount,
  createWorld, advanceTrip, scanAll, createGrid, naiveBook, createLocks, offerBook,
  surgeMap, surgeAt, publicDriver, burst,
};
