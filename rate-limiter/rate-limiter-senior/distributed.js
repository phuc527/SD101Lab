// Senior: distributed rate limiting: local counters, race conditions, atomic INCR, failure policy, leases
const assert = require('assert');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIMIT = 10;

// Fake Redis: every command costs a network round trip
class FakeRedis {
  data = new Map(); calls = 0; up = true;
  async #rtt() { this.calls++; if (!this.up) throw new Error('ECONNREFUSED'); await sleep(Math.random() * 2); }
  async get(k) { await this.#rtt(); return this.data.get(k) ?? 0; }
  async set(k, v) { await this.#rtt(); this.data.set(k, v); }
  async incrby(k, n = 1) { await this.#rtt(); const v = (this.data.get(k) ?? 0) + n; this.data.set(k, v); return v; } // atomic: one command, single-threaded server
}

(async () => {
  // ---------- 1. Estimation ----------
  console.log('=== 1. Estimation ===');
  console.log('10M active users x 2 counters (sliding window) x ~50B = ~1GB -> fits in one Redis');
  console.log('1M req/s -> one Redis handles ~100k ops/s -> shard Redis by key (user id), ~10+ shards');

  // ---------- 2. Local counters on each node ----------
  console.log('\n=== 2. Each of 3 API nodes keeps its own counter (LB round-robin) ===');
  const local = [0, 0, 0];
  let allowedLocal = 0;
  for (let i = 0; i < 30; i++) { const n = i % 3; if (local[n] < LIMIT) { local[n]++; allowedLocal++; } }
  console.log(`limit is ${LIMIT}, but the user got ${allowedLocal} requests through (each node sees only 1/3 of the traffic)`);
  assert.equal(allowedLocal, 30);

  // ---------- 3. Central Redis: GET + SET races vs atomic INCR ----------
  console.log('\n=== 3. Shared Redis, 50 concurrent requests, limit 10 ===');
  const r1 = new FakeRedis();
  const naive = async () => { const v = await r1.get('u'); if (v >= LIMIT) return false; await r1.set('u', v + 1); return true; };
  const naiveOk = (await Promise.all(Array.from({ length: 50 }, naive))).filter(Boolean).length;
  const r2 = new FakeRedis();
  const atomic = async () => (await r2.incrby('u')) <= LIMIT; // or a Lua script for multi-step logic
  const atomicOk = (await Promise.all(Array.from({ length: 50 }, atomic))).filter(Boolean).length;
  console.log(`GET then SET (read-modify-write): ${naiveOk} allowed  <- race condition, everyone read 0`);
  console.log(`INCR (atomic):                    ${atomicOk} allowed`);
  assert.ok(naiveOk > LIMIT);
  assert.equal(atomicOk, LIMIT);

  // ---------- 4. Redis is down: fail-open or fail-closed? ----------
  console.log('\n=== 4. Redis down ===');
  const down = new FakeRedis();
  down.up = false;
  const check = async (policy) => { try { return (await down.incrby('u')) <= LIMIT; } catch { return policy === 'fail-open'; } };
  const feed = (await check('fail-open')) ? 200 : 503;
  const login = (await check('fail-closed')) ? 200 : 503;
  console.log(`GET /feed  (fail-open):   ${feed}  -> availability first, accept the risk of no limit for a while`);
  console.log(`POST /login (fail-closed): ${login}  -> security first, brute force must stay blocked`);
  assert.equal(feed, 200);
  assert.equal(login, 503);

  // ---------- 5. Leases: fewer Redis calls ----------
  console.log('\n=== 5. Token leases: each node takes 5 tokens at a time (global limit 100, 150 requests) ===');
  const GLOBAL = 100, LEASE = 5;
  const r3 = new FakeRedis();
  const makeNode = () => {
    let tokens = 0;
    return async () => {
      if (tokens === 0) {
        const after = await r3.incrby('u', LEASE);
        tokens = Math.max(0, Math.min(LEASE, GLOBAL - (after - LEASE)));
        if (tokens === 0) return false;
      }
      tokens--;
      return true;
    };
  };
  const ns = [makeNode(), makeNode(), makeNode()];
  let ok = 0;
  for (let i = 0; i < 150; i++) if (await ns[i % 3]()) ok++;
  console.log(`allowed ${ok}/150, Redis calls ${r3.calls} (vs 150 with one INCR per request)`);
  console.log('trade-off: tokens leased to an idle node are wasted -> limit becomes approximate');
  assert.equal(ok, GLOBAL);
  assert.ok(r3.calls < 150);
  console.log('\nAll senior checks passed.');
})();
