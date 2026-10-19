// Middle backend: grid index + atomic driver lock with TTL (SET NX PX) + offer timeout + surge pricing.
const { serve, sleep } = require('../../lib/api-kit');
const S = require('../shared');

let world, grid, locks, stats;
let offerTimeout = 1500;
function reset() {
  world?.stop();
  stats = { requests: 0, matched: 0, noDriver: 0, offerTimeouts: 0, lockConflicts: 0, doubleBookings: 0 };
  grid = S.createGrid();
  locks = S.createLocks();
  world = S.createWorld({ onMove: (d) => (d.status === 'offline' ? grid.remove(d) : grid.update(d)) });
}
reset();

async function requestOne(riderId, point, trace) {
  stats.requests++;
  world.demand.push({ ...point, at: Date.now() });
  const surge = S.surgeAt(S.surgeMap(world), point);
  trace(`${riderId}: surge in this zone = ${surge}x (demand / supply, last 60s)`);
  const { list, scanned } = grid.nearest(point);
  await sleep(scanned.drivers / 2000);
  trace(`${riderId}: ring search: ${scanned.cells} cells, ${scanned.drivers.toLocaleString()} of ${scanned.of.toLocaleString()} drivers, ${list.length} candidates`);
  try {
    const trip = await S.offerBook(world, locks, { riderId, point, list, surge }, trace, stats, offerTimeout);
    stats.matched++;
    return { trip, driver: S.publicDriver(world.byId.get(trip.driverId)), km: trip.km, scanned };
  } catch (e) {
    stats.noDriver++;
    throw e;
  }
}

serve(__dirname, {
  meta: {
    title: 'Atomic lock + offer timeout + surge',
    profile: 'write-heavy',
    architecture: `POST /request ──> grid ring search ──> candidates sorted by distance
   for each candidate:
     SET lock:driver:{id} {rider} NX PX {offerTimeout}   -- atomic, only one rider wins
     push offer to driver app, wait
       accepted  -> trip, DEL lock
       no answer -> lock expires by itself (TTL) -> next driver
surge(zone) = demand / supply   (cap 3x)`,
    ideas: ['Atomic SET NX (or UPDATE ... WHERE status=\'available\') prevents double booking', 'TTL on the lock: a silent driver is never stuck', 'Surge pricing per zone balances demand and supply'],
    tradeoffs: ['Sequential offers: fewer cancels, but slower matching', 'Extra dependency (Redis) on the hot path', 'Lock TTL too short = driver loses the ride while tapping accept'],
  },
  controls: {
    offerTimeout: { label: 'Offer timeout (ms)', type: 'number', value: 1500, min: 300, max: 5000, step: 100 },
  },
  onControl: (id, v) => { if (id === 'offerTimeout') offerTimeout = S.clamp(Number(v) || 1500, 300, 5000); },
  reset,
  routes: {
    'GET /drivers': () => ({ drivers: world.drivers.map(S.publicDriver), bbox: S.BBOX, fleet: S.FLEET, surge: S.surgeMap(world) }),
    'GET /trips': () => ({ trips: world.listTrips() }),
    'GET /stats': () => ({ stats: { ...stats, locksHeld: locks.held(), surgeZones: S.surgeMap(world).length, offerTimeoutMs: offerTimeout } }),
    'POST /request': ({ body, trace }) => requestOne(S.parseRider(body.riderId), S.parsePoint(body), trace),
    'POST /request-burst': ({ body, trace }) => S.burst(body, (r, p) => requestOne(r, p, trace)),
    'POST /trips/:id/advance': ({ params, body, trace }) => ({ trip: S.advanceTrip(world, params.id, body.to, trace) }),
  },
});
