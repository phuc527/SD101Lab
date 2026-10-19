// Middle: matching under concurrency: double booking, lock with TTL, offer timeout, surge pricing
const assert = require('assert');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---------- 1. Double booking race ----------
  console.log('=== 1. Two riders request at the same time, both see driver d1 as nearest ===');
  const status = new Map([['d1', 'available'], ['d2', 'available']]);
  const naiveBook = async (rider, driver) => {
    if (status.get(driver) !== 'available') return null;
    await sleep(5); // DB/network latency between check and write
    status.set(driver, `busy:${rider}`);
    return driver;
  };
  const naive = await Promise.all([naiveBook('r1', 'd1'), naiveBook('r2', 'd1')]);
  console.log(`check-then-set: r1 -> ${naive[0]}, r2 -> ${naive[1]}  <- DOUBLE BOOKED, d1 has two trips`);
  assert.deepEqual(naive, ['d1', 'd1']);

  // Atomic lock: Redis SET lock:driver:{id} {rider} NX EX 10  (or UPDATE ... WHERE status='available')
  const locks = new Map(); // driverId -> { owner, expiresAt }
  const tryLock = (driver, owner, now, ttl) => { // single atomic step
    const l = locks.get(driver);
    if (l && l.expiresAt > now) return false;
    locks.set(driver, { owner, expiresAt: now + ttl });
    return true;
  };
  const book = (rider, candidates, now) => candidates.find((d) => tryLock(d, rider, now, 10_000)) ?? null;
  const r1 = book('r1', ['d1', 'd2'], 0), r2 = book('r2', ['d1', 'd2'], 0);
  console.log(`atomic lock:    r1 -> ${r1}, r2 -> ${r2}  <- r2 falls back to the next nearest driver`);
  assert.equal(r1, 'd1');
  assert.equal(r2, 'd2');

  // ---------- 2. Offer timeout: driver ignores the request ----------
  console.log('\n=== 2. Dispatch: offer to the nearest driver, 10s to accept, else next driver ===');
  locks.clear();
  const candidates = [{ id: 'd1', respondsAfter: null }, { id: 'd2', respondsAfter: 15_000 }, { id: 'd3', respondsAfter: 4_000 }];
  let now = 0, assigned = null;
  for (const c of candidates) {
    tryLock(c.id, 'r9', now, 10_000);
    const accepted = c.respondsAfter !== null && c.respondsAfter <= 10_000;
    console.log(`t=${now / 1000}s offer -> ${c.id}: ${accepted ? `accepted after ${c.respondsAfter / 1000}s` : 'no answer within 10s, lock expires'}`);
    if (accepted) { assigned = c.id; now += c.respondsAfter; break; }
    now += 10_000; // TTL frees the driver automatically, no cleanup job needed
  }
  console.log(`rider r9 matched with ${assigned} after ${now / 1000}s`);
  assert.equal(assigned, 'd3');
  assert.ok(tryLock('d1', 'r10', now, 10_000)); // d1's lock expired, d1 can get other riders again

  // ---------- 3. Surge pricing ----------
  console.log('\n=== 3. Surge pricing per area: demand / supply ===');
  const areas = [
    { area: 'District 1, 6pm rain', requests: 300, drivers: 80 },
    { area: 'District 7', requests: 60, drivers: 70 },
    { area: 'Airport, flight landed', requests: 150, drivers: 75 },
  ];
  const surge = (a) => Math.min(3, Math.max(1, Math.round((a.requests / a.drivers) * 10) / 10)); // capped at x3
  console.table(areas.map((a) => ({ ...a, multiplier: `x${surge(a)}` })));
  console.log('higher price -> fewer requests + drivers move to the area -> balance restored');
  assert.equal(surge(areas[0]), 3);
  assert.equal(surge(areas[1]), 1);

  console.log('\nok. Limitation: one node holds every driver location; 250k location writes/s need a different design. See ride-sharing-senior.');
})();
