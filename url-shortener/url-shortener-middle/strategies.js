// Middle: code generation strategies, LRU cache for hot links, 301 vs 302
const assert = require('assert');
const crypto = require('crypto');

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const toBase62 = (n) => { let s = ''; do { s = BASE62[n % 62] + s; n = Math.floor(n / 62); } while (n > 0); return s; };

// ---------- 1. Code generation: use a small 4-char space so collisions are visible ----------
console.log('=== 1. Code generation (200k URLs into 4-char codes, space = 62^4 = 14.8M) ===');
const N = 200_000, SPACE = 62 ** 4;
const urls = Array.from({ length: N }, (_, i) => `https://site.com/page/${i}`);
const collisions = (codeOf) => {
  const seen = new Set();
  let c = 0;
  for (const u of urls) { const k = codeOf(u); seen.has(k) ? c++ : seen.add(k); }
  return c;
};
let ctr = 0;
const rows = [
  { strategy: 'hash(url) truncated', collisions: collisions((u) => toBase62(crypto.createHash('md5').update(u).digest().readUInt32BE(0) % SPACE)), sameUrlSameCode: 'yes', guessable: 'no', onCollision: 'append salt, rehash, check DB' },
  { strategy: 'random', collisions: collisions(() => toBase62(crypto.randomInt(SPACE))), sameUrlSameCode: 'no', guessable: 'no', onCollision: 'regenerate, check DB' },
  { strategy: 'counter + base62', collisions: collisions(() => toBase62(ctr++)), sameUrlSameCode: 'no', guessable: 'YES', onCollision: 'never collides' },
];
console.table(rows);
console.log(`birthday paradox: expected collisions ≈ n²/2N = ${Math.round((N * N) / 2 / SPACE)}, even though only ${((N / SPACE) * 100).toFixed(1)}% of the space is used`);
assert.equal(rows[2].collisions, 0);
assert.ok(rows[0].collisions > 0);

// ---------- 2. Cache hot links: traffic follows a Zipf distribution ----------
console.log('\n=== 2. LRU cache for redirects (100k links, 300k Zipf-distributed clicks) ===');
class LRU {
  constructor(cap) { this.cap = cap; this.m = new Map(); }
  get(k) { if (!this.m.has(k)) return undefined; const v = this.m.get(k); this.m.delete(k); this.m.set(k, v); return v; }
  set(k, v) { this.m.delete(k); this.m.set(k, v); if (this.m.size > this.cap) this.m.delete(this.m.keys().next().value); }
}
const LINKS = 100_000, CLICKS = 300_000;
const cdf = [];
let sum = 0;
for (let i = 1; i <= LINKS; i++) cdf.push((sum += 1 / i)); // popularity of link i ∝ 1/i
const pick = () => {
  const x = Math.random() * sum;
  let lo = 0, hi = LINKS - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; cdf[mid] < x ? (lo = mid + 1) : (hi = mid); }
  return lo;
};
const traffic = Array.from({ length: CLICKS }, pick);
const cacheRows = [100, 1_000, 10_000].map((cap) => {
  const c = new LRU(cap);
  let hit = 0;
  for (const k of traffic) c.get(k) !== undefined ? hit++ : c.set(k, true);
  return { cacheSize: cap, '% of links cached': `${(cap / LINKS) * 100}%`, hitRatio: `${((hit / CLICKS) * 100).toFixed(1)}%` };
});
console.table(cacheRows);
console.log('-> caching 1-10% of links absorbs most of the traffic (80/20 rule)');

// ---------- 3. 301 vs 302 ----------
console.log('\n=== 3. 301 (permanent) vs 302 (temporary): one user clicks the same link 5 times ===');
const serverHits = (status) => {
  const browserCache = new Set();
  let hits = 0;
  for (let i = 0; i < 5; i++) {
    if (browserCache.has('abc')) continue; // browser redirects by itself, never asks the server
    hits++;
    if (status === 301) browserCache.add('abc');
  }
  return hits;
};
console.log(`301: server sees ${serverHits(301)} hit  -> less load, but analytics undercount and you cannot change the target later`);
console.log(`302: server sees ${serverHits(302)} hits -> accurate click analytics, more load`);
assert.equal(serverHits(301), 1);
assert.equal(serverHits(302), 5);
console.log('\nok. Limitation: one counter/DB node, analytics written synchronously, links never expire. See url-shortener-senior.');
