// Senior: estimation + sharding + async fan-out via queue + ranking + graceful degradation
const assert = require('assert');
const crypto = require('crypto');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1. Back-of-envelope estimation ----------
function estimation() {
  console.log('=== 1. Estimation ===');
  const DAU = 300e6, READS = 10, POSTS = 1, FOLLOWERS = 200, FEED_LEN = 500, ID_BYTES = 8;
  const est = {
    'read QPS': (DAU * READS) / 86400,
    'post QPS': (DAU * POSTS) / 86400,
    'fan-out writes/s': (DAU * POSTS * FOLLOWERS) / 86400,
    'feed cache (GB)': (DAU * FEED_LEN * ID_BYTES) / 1e9,
  };
  for (const [k, v] of Object.entries(est)) console.log(`${k.padEnd(18)} ${Math.round(v).toLocaleString()}`);
  console.log('-> ~35k read QPS (peak x3), ~700k fan-out writes/s means fan-out must be ASYNC. ~1.2TB of ids means the cache must be SHARDED.');
}

// ---------- 2. Sharding: consistent hashing vs hash % N ----------
function sharding() {
  console.log('\n=== 2. Sharding the feed cache by userId (add a node 3 -> 4) ===');
  const h = (s) => crypto.createHash('md5').update(String(s)).digest().readUInt32BE(0);
  const ring = (nodes) => nodes.flatMap((n) => [...Array(100)].map((_, i) => [h(`${n}#${i}`), n])).sort((a, b) => a[0] - b[0]);
  const lookup = (r, key) => { const x = h(key); return (r.find(([k]) => k >= x) ?? r[0])[1]; };
  const r3 = ring(['a', 'b', 'c']), r4 = ring(['a', 'b', 'c', 'd']);
  const keys = [...Array(10000)].map((_, i) => `user${i}`);
  const moved = keys.filter((k) => lookup(r3, k) !== lookup(r4, k)).length / 100;
  const modMoved = keys.filter((k) => h(k) % 3 !== h(k) % 4).length / 100;
  console.log(`consistent hashing moves ${moved.toFixed(1)}% of keys | hash % N moves ${modMoved.toFixed(1)}% (cache miss storm)`);
  assert.ok(moved < modMoved);
}

// ---------- 3. Async fan-out: queue + workers + retry + DLQ + idempotency ----------
async function asyncFanout() {
  console.log('\n=== 3. Async fan-out (queue, 3 workers, retry, idempotent) ===');
  const followers = [...Array(1000)].map((_, i) => i);
  const feeds = new Map(); // userId -> Set(postId): a Set (Redis ZADD) makes retries idempotent
  const queue = [], dlq = [];
  const flaky = new Set([7, 42]); // these users' shards fail once

  const t0 = performance.now();
  for (let i = 0; i < followers.length; i += 100) queue.push({ postId: 'p1', users: followers.slice(i, i + 100), attempt: 0 });
  console.log(`API returned in ${(performance.now() - t0).toFixed(2)}ms with ${queue.length} jobs queued (user doesn't wait for fan-out)`);

  const worker = async () => {
    while (queue.length) {
      const job = queue.shift();
      await sleep(5);
      job.users.forEach((u) => (feeds.get(u) ?? feeds.set(u, new Set()).get(u)).add(job.postId)); // partial write before failing
      const bad = job.users.find((u) => flaky.has(u));
      if (bad !== undefined) {
        flaky.delete(bad);
        // ponytail: immediate requeue, production uses exponential backoff
        job.attempt < 3 ? queue.push({ ...job, attempt: job.attempt + 1 }) : dlq.push(job);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const delivered = [...feeds.values()].filter((s) => s.has('p1')).length;
  const dupes = [...feeds.values()].some((s) => s.size > 1);
  console.log(`delivered ${delivered}/1000, DLQ=${dlq.length}, duplicates after retry: ${dupes}`);
  assert.equal(delivered, 1000); assert.equal(dupes, false);
}

// ---------- 4. Ranking instead of pure chronological ----------
function ranking() {
  console.log('\n=== 4. Ranking: score = affinity x type weight x engagement / time decay ===');
  const posts = [
    { id: 'a', ageH: 1, likes: 2, affinity: 0.2, type: 'text' },
    { id: 'b', ageH: 10, likes: 500, affinity: 0.9, type: 'photo' },
    { id: 'c', ageH: 3, likes: 50, affinity: 0.8, type: 'video' },
    { id: 'd', ageH: 40, likes: 900, affinity: 0.1, type: 'text' },
  ];
  const W = { text: 1, photo: 1.3, video: 1.5 };
  const score = (p) => (p.affinity * W[p.type] * Math.log10(p.likes + 10)) / Math.pow(p.ageH + 2, 1.2);
  const chrono = [...posts].sort((x, y) => x.ageH - y.ageH).map((p) => p.id).join(' ');
  const ranked = [...posts].sort((x, y) => score(y) - score(x)).map((p) => p.id).join(' ');
  console.log(`chronological: ${chrono} | ranked: ${ranked}  (close friend's video beats a stranger's fresh text)`);
  assert.equal(ranked[0], 'c');
}

// ---------- 5. Graceful degradation when the feed cache is down ----------
async function degrade() {
  console.log('\n=== 5. Failure: feed cache down -> fallback, never 500 ===');
  const withTimeout = (p, ms, fallback) => Promise.race([p, sleep(ms).then(() => fallback)]);
  const cacheDown = Promise.reject(new Error('ECONNREFUSED')).catch(() => null);
  const pullTopK = sleep(20).then(() => 'pull from top-50 followees');
  const source = (await cacheDown) ?? (await withTimeout(pullTopK, 100, 'static trending feed'));
  console.log('served from:', source);
  assert.equal(source, 'pull from top-50 followees');
}

(async () => {
  estimation();
  sharding();
  await asyncFanout();
  ranking();
  await degrade();
  console.log('\nAll senior checks passed.');
})();
