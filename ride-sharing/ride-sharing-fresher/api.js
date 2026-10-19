// Fresher backend: one table of drivers, brute-force nearest search, naive check-then-set booking.
const { serve, sleep } = require('../../lib/api-kit');
const S = require('../shared');

let world, stats;
function reset() {
  world?.stop();
  world = S.createWorld();
  stats = { requests: 0, matched: 0, driversScanned: 0, doubleBookings: 0 };
}
reset();

async function requestOne(riderId, point, trace) {
  stats.requests++;
  const { list, scanned } = S.scanAll(world, point);
  stats.driversScanned += scanned.drivers;
  await sleep(scanned.drivers / 2000); // full scan cost grows with the fleet
  trace(`${riderId}: SELECT * FROM drivers -> computed distance to ALL ${scanned.drivers.toLocaleString()} drivers, sorted`);
  const trip = await S.naiveBook(world, { riderId, point, list }, trace, stats);
  stats.matched++;
  const driver = world.byId.get(trip.driverId);
  return { trip, driver: S.publicDriver(driver), km: trip.km, scanned };
}

serve(__dirname, {
  meta: {
    title: 'Brute-force scan + check-then-set',
    profile: 'write-heavy',
    architecture: `Driver app ──(location every 4s)──> API ──> UPDATE drivers SET lat,lng
Rider app  ──> POST /request ──> SELECT * FROM drivers          (all of them)
                                 distance() for each, ORDER BY distance
                                 if status='available'  ...then later...
                                 UPDATE drivers SET status='on_trip'`,
    ideas: ['Entities: riders / drivers / trips', 'Trip state machine: requested -> accepted -> in_progress -> completed', 'Nearest driver = compute distance to every driver'],
    tradeoffs: ['O(N) per request: fine for 300 drivers, slow for 50k', 'Check-then-set is not atomic: 2 riders can book the same driver', 'Every location ping is a DB write'],
  },
  reset,
  routes: {
    'GET /drivers': () => ({ drivers: world.drivers.map(S.publicDriver), bbox: S.BBOX, fleet: S.FLEET }),
    'GET /trips': () => ({ trips: world.listTrips() }),
    'GET /stats': () => ({ stats: { ...stats, fleet: S.FLEET, activeTrips: world.listTrips().filter((t) => !['completed', 'cancelled'].includes(t.status)).length } }),
    'POST /request': ({ body, trace }) => requestOne(S.parseRider(body.riderId), S.parsePoint(body), trace),
    'POST /request-burst': ({ body, trace }) => S.burst(body, (r, p) => requestOne(r, p, trace)),
    'POST /trips/:id/advance': ({ params, body, trace }) => ({ trip: S.advanceTrip(world, params.id, body.to, trace) }),
  },
});
