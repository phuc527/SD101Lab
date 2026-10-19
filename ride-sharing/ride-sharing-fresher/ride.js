// Fresher: data model, trip state machine, nearest driver by brute force
const assert = require('assert');

// Tables:
// riders(id, name) | drivers(id, name, status, lat, lng)   status = 'available' | 'on_trip' | 'offline'
// trips(id, rider_id, driver_id, status, pickup, dropoff, fare, created_at)
const drivers = new Map([
  ['d1', { id: 'd1', status: 'available', lat: 10.7769, lng: 106.7009 }], // Ben Thanh
  ['d2', { id: 'd2', status: 'available', lat: 10.7626, lng: 106.6602 }], // District 5
  ['d3', { id: 'd3', status: 'offline', lat: 10.7740, lng: 106.7040 }],   // closest, but offline
  ['d4', { id: 'd4', status: 'available', lat: 10.8231, lng: 106.6297 }], // Tan Binh
]);

// Haversine: distance between 2 GPS points in km
function distanceKm(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Brute force: O(number of drivers) per request
const nearestDriver = (p) =>
  [...drivers.values()].filter((d) => d.status === 'available')
    .map((d) => ({ id: d.id, km: distanceKm(p, d) }))
    .sort((a, b) => a.km - b.km)[0];

// Trip state machine: only these transitions are legal
const TRANSITIONS = {
  requested: ['accepted', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [], cancelled: [],
};
function transition(trip, to) {
  if (!TRANSITIONS[trip.status].includes(to)) throw new Error(`illegal: ${trip.status} -> ${to}`);
  trip.status = to;
  return trip;
}

const pickup = { lat: 10.7720, lng: 106.6980 }; // rider near Ben Thanh market
const best = nearestDriver(pickup);
console.log(`rider at ${pickup.lat},${pickup.lng} -> nearest available driver: ${best.id} (${best.km.toFixed(2)} km)`);
assert.equal(best.id, 'd1'); // d3 is closer but offline

const trip = { id: 't1', riderId: 'r1', driverId: best.id, status: 'requested' };
drivers.get(best.id).status = 'on_trip';
for (const s of ['accepted', 'in_progress', 'completed']) console.log('trip ->', transition(trip, s).status);
assert.throws(() => transition(trip, 'cancelled'), /illegal/);
console.log('cancel a completed trip -> rejected (illegal transition)');
assert.notEqual(nearestDriver(pickup).id, 'd1'); // d1 is busy now

console.log('\nok. Limitation: scanning every driver per request is O(N); with 1M drivers that is too slow. See ride-sharing-junior.');
