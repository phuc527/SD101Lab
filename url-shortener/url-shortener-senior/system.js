// Senior: estimation, distributed ID ranges, scrambled codes, async analytics, expiry
const assert = require('assert');

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const toBase62 = (n) => { let s = ''; do { s = BASE62[n % 62] + s; n = Math.floor(n / 62); } while (n > 0); return s; };

// ---------- 1. Estimation ----------
console.log('=== 1. Estimation ===');
const WRITES_DAY = 100e6, READ_RATIO = 100, YEARS = 5, ROW_BYTES = 500;
const total = WRITES_DAY * 365 * YEARS;
console.log(`write QPS         ${Math.round(WRITES_DAY / 86400).toLocaleString()}`);
console.log(`read QPS          ${Math.round((WRITES_DAY * READ_RATIO) / 86400).toLocaleString()}  -> cache + CDN/edge`);
console.log(`URLs in ${YEARS} years   ${total.toLocaleString()}  vs 62^7 = ${(62 ** 7).toLocaleString()} -> 7 chars is enough`);
console.log(`storage           ${((total * ROW_BYTES) / 1e12).toFixed(0)} TB -> shard by code (NoSQL KV: DynamoDB/Cassandra)`);

// ---------- 2. Distributed ID: each app node leases a range of ids ----------
console.log('\n=== 2. Range allocation: no coordination per request ===');
class TicketServer { // ZooKeeper/etcd or a DB row: UPDATE ranges SET next = next + 1000 RETURNING next
  next = 1; calls = 0;
  lease(size) { this.calls++; const start = this.next; this.next += size; return [start, start + size]; }
}
class AppNode {
  constructor(ts, size = 1000) { this.ts = ts; this.size = size; this.range = [0, 0]; }
  nextId() { if (this.range[0] >= this.range[1]) this.range = this.ts.lease(this.size); return this.range[0]++; }
}
const ts = new TicketServer();
const nodes = [new AppNode(ts), new AppNode(ts), new AppNode(ts)];
const ids = Array.from({ length: 30_000 }, (_, i) => nodes[i % 3].nextId());
console.log(`3 nodes created ${ids.length.toLocaleString()} ids, unique=${new Set(ids).size === ids.length}, ticket server calls=${ts.calls} (not 30,000)`);
console.log('if a node crashes, the rest of its range is lost -> gaps in ids are fine');
assert.equal(new Set(ids).size, ids.length);

// ---------- 3. Scramble sequential ids so codes are not guessable ----------
console.log('\n=== 3. Scramble: id * P mod 62^7 (bijection, so still unique) ===');
const M = 62n ** 7n; // M = 2^7 * 31^7
let P = (M * 618034n) / 1000000n; // ~golden ratio * M spreads consecutive ids far apart
while (P % 2n === 0n || P % 31n === 0n) P++; // gcd(P, M) = 1 -> bijection
const scramble = (id) => toBase62(Number((BigInt(id) * P) % M)).padStart(7, '0');
console.log('id 1..5 ->', [1, 2, 3, 4, 5].map(scramble).join(' '));
assert.equal(new Set(ids.map(scramble)).size, ids.length);

// ---------- 4. Async analytics: the redirect never waits for a DB write ----------
console.log('\n=== 4. Click analytics: aggregate in memory, flush every second ===');
const clicks = Array.from({ length: 10_000 }, (_, i) => `code${i % 50}`); // 10k clicks on 50 links over 5s
let batchedWrites = 0;
for (let sec = 0; sec < 5; sec++) {
  const agg = new Map();
  for (const c of clicks.slice(sec * 2000, (sec + 1) * 2000)) agg.set(c, (agg.get(c) ?? 0) + 1);
  batchedWrites += agg.size; // UPDATE stats SET clicks = clicks + n WHERE code = ?
}
console.log(`sync: ${clicks.length.toLocaleString()} DB writes | batched: ${batchedWrites} DB writes (via Kafka -> consumer -> ClickHouse in production)`);
assert.ok(batchedWrites < clicks.length / 10);

// ---------- 5. Expiry: lazy check on read + background cleanup ----------
console.log('\n=== 5. Expiration ===');
const urls = new Map([['abc', { url: 'https://a.com', expiresAt: 1000 }], ['xyz', { url: 'https://b.com', expiresAt: Infinity }]]);
const resolve = (code, now) => {
  const r = urls.get(code);
  if (!r) return 404;
  if (r.expiresAt <= now) return 410; // Gone: checked on read, no need to wait for cleanup
  return 302;
};
const cleanup = (now) => { for (const [k, v] of urls) if (v.expiresAt <= now) urls.delete(k); }; // cron in off-peak hours
console.log(`t=500 abc -> ${resolve('abc', 500)} | t=2000 abc -> ${resolve('abc', 2000)} | xyz -> ${resolve('xyz', 2000)}`);
cleanup(2000);
assert.equal(resolve('abc', 2000), 404);
assert.equal(urls.size, 1);
console.log('\nAll senior checks passed.');
