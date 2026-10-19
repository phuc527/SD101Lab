// Junior backend: grid geospatial index (~1km cells) updated on every location ping. Booking is still naive.
const { serve, sleep } = require('../../lib/api-kit');
const S = require('../shared');

let world, grid, stats;
function reset() {
  world?.stop();
  stats = { requests: 0, matched: 0, pings: 0, cellsScanned: 0, driversScanned: 0, doubleBookings: 0 };
  grid = S.createGrid();
  world = S.createWorld({ onMove: (d) => { stats.pings++; d.status === 'offline' ? grid.remove(d) : grid.update(d); } });
}
reset();

async function requestOne(riderId, point, trace) {
  stats.requests++;
  const { list, scanned } = grid.nearest(point);
  stats.cellsScanned += scanned.cells;
  stats.driversScanned += scanned.drivers;
  await sleep(scanned.drivers / 2000);
  trace(`${riderId}: ring search: ${scanned.cells} cells, ${scanned.drivers.toLocaleString()} of ${scanned.of.toLocaleString()} drivers looked at`);
  const trip = await S.naiveBook(world, { riderId, point, list }, trace, stats);
  stats.matched++;
  return { trip, driver: S.publicDriver(world.byId.get(trip.driverId)), km: trip.km, scanned };
}

serve(__dirname, {
  meta: {
    title: 'Grid geo index + ring search',
    profile: 'write-heavy',
    architecture: `Driver ping ──> Location service ──> grid[cell(lat,lng)].add(driver)   (~1km cells, in memory)
                                    (move driver between cells when it crosses a border)
POST /request ──> cell(pickup) ──> ring 0, ring 1, ... until found (+1 ring for borders)
              ──> check status ... UPDATE status='on_trip'   (still check-then-set)`,
    ideas: ['Geospatial index: grid / geohash / S2 / Redis GEO', 'Search only nearby cells: cost ~ local density, not fleet size', 'Index is updated on every location ping (write-heavy)'],
    tradeoffs: ['Fixed cells: downtown cells are crowded, suburbs empty', 'Ring search needs one extra ring to be correct at cell borders', 'Booking still races: double booking possible'],
  },
  reset,
  routes: {
    'GET /drivers': () => ({ drivers: world.drivers.map(S.publicDriver), bbox: S.BBOX, fleet: S.FLEET }),
    'GET /trips': () => ({ trips: world.listTrips() }),
    'GET /stats': () => ({ stats: { ...stats, fleet: S.FLEET, gridCells: grid.cells.size } }),
    'POST /request': ({ body, trace }) => requestOne(S.parseRider(body.riderId), S.parsePoint(body), trace),
    'POST /request-burst': ({ body, trace }) => S.burst(body, (r, p) => requestOne(r, p, trace)),
    'POST /trips/:id/advance': ({ params, body, trace }) => ({ trip: S.advanceTrip(world, params.id, body.to, trace) }),
  },
});
