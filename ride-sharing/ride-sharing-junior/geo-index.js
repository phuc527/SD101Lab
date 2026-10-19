// Junior: grid geospatial index (same idea as geohash / Redis GEO) vs brute force
const assert = require('assert');

let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32), seed / 2 ** 32);

// Equirectangular approximation: accurate enough inside one city
const distKm = (a, b) => {
  const x = (b.lng - a.lng) * 111.32 * Math.cos((a.lat * Math.PI) / 180), y = (b.lat - a.lat) * 110.57;
  return Math.hypot(x, y);
};

const CELL = 0.01; // ~1.1km per cell
class GridIndex {
  cells = new Map(); where = new Map(); // "row:col" -> Set(driverId) | driverId -> { lat, lng, key }
  #key(lat, lng) { return `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`; }
  update(id, lat, lng) { // called on every location ping
    const old = this.where.get(id), key = this.#key(lat, lng);
    if (old && old.key !== key) this.cells.get(old.key).delete(id); // moved to another cell
    if (!this.cells.has(key)) this.cells.set(key, new Set());
    this.cells.get(key).add(id);
    this.where.set(id, { lat, lng, key });
  }
  nearest(p, k = 3) {
    const r0 = Math.floor(p.lat / CELL), c0 = Math.floor(p.lng / CELL);
    let found = [];
    let scanned = 0;
    // Expand ring by ring; one extra ring after finding k guarantees nothing closer is missed
    for (let ring = 0, extra = -1; ring < 200 && extra !== 0; ring++) {
      for (let r = r0 - ring; r <= r0 + ring; r++)
        for (let c = c0 - ring; c <= c0 + ring; c++) {
          if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== ring) continue; // only the ring border
          for (const id of this.cells.get(`${r}:${c}`) ?? []) { scanned++; found.push({ id, km: distKm(p, this.where.get(id)) }); }
        }
      if (extra > 0) extra--;
      if (found.length >= k && extra === -1) extra = 1;
    }
    found.sort((a, b) => a.km - b.km);
    return { top: found.slice(0, k), scanned };
  }
}

// 100k drivers spread over Ho Chi Minh City (~22km x 22km)
const N = 100_000;
const drivers = Array.from({ length: N }, (_, i) => ({ id: `d${i}`, lat: 10.7 + rand() * 0.2, lng: 106.6 + rand() * 0.2 }));
const idx = new GridIndex();
let t = performance.now();
drivers.forEach((d) => idx.update(d.id, d.lat, d.lng));
console.log(`indexed ${N.toLocaleString()} drivers into ${idx.cells.size} cells in ${(performance.now() - t).toFixed(0)}ms`);

const queries = Array.from({ length: 500 }, () => ({ lat: 10.72 + rand() * 0.16, lng: 106.62 + rand() * 0.16 }));
t = performance.now();
const bf = queries.map((p) => { // O(N) scan for the minimum
  let best = { km: Infinity };
  for (const d of drivers) { const km = distKm(p, d); if (km < best.km) best = { id: d.id, km }; }
  return best;
});
const bruteMs = performance.now() - t;
t = performance.now();
const gi = queries.map((p) => idx.nearest(p, 1));
const gridMs = performance.now() - t;
const avgScanned = gi.reduce((s, r) => s + r.scanned, 0) / gi.length;

console.table([
  { method: 'brute force', 'scanned/query': N, 'ms / 500 queries': bruteMs.toFixed(0) },
  { method: 'grid index', 'scanned/query': Math.round(avgScanned), 'ms / 500 queries': gridMs.toFixed(0) },
]);
assert.deepEqual(gi.map((r) => r.top[0].id), bf.map((r) => r.id)); // same answer as brute force

// Location updates: a driver drives east and changes cells
idx.update('d0', 10.7500, 106.6500);
const before = idx.where.get('d0').key;
idx.update('d0', 10.7500, 106.6650);
console.log(`\nd0 moved: cell ${before} -> ${idx.where.get('d0').key}; old cell no longer contains d0: ${!idx.cells.get(before)?.has('d0')}`);
assert.ok(!idx.cells.get(before)?.has('d0'));

console.log('\nok. Limitation: two riders can grab the same driver at the same moment, and a driver who ignores the request blocks the rider. See ride-sharing-middle.');
