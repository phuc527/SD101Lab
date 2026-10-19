// Senior: shard skew, scatter-gather on empty prefix, and sampling error vs write savings
const assert = require('assert');
const { seed, byScore, Trie } = require('../shared');

const SHARDS = { 'a-h': /^[a-h]/, 'i-p': /^[i-p]/, 'q-z': /^[^a-p]/ };
const shardOf = (t) => Object.keys(SHARDS).find((id) => SHARDS[id].test(t));
const counts = seed();
const parts = Object.fromEntries(Object.keys(SHARDS).map((id) => [id, new Map()]));
for (const [t, c] of counts) parts[shardOf(t)].set(t, c);
const tries = Object.fromEntries(Object.entries(parts).map(([id, m]) => [id, Trie.from(m)]));

// Skew: total popularity per shard (read traffic follows popularity)
for (const [id, m] of Object.entries(parts)) {
  const load = [...m.values()].reduce((a, b) => a + b, 0);
  console.log(`shard ${id}: ${m.size} terms, ${tries[id].nodes} nodes, load ${load.toLocaleString()}`);
}

// Empty prefix: ask every shard for its top 5, merge
const global = Object.values(tries).flatMap((t) => t.find('')).sort(byScore).slice(0, 5);
assert.deepEqual(global, Trie.from(counts).find(''));
console.log('scatter-gather top5 ->', global.map((r) => r.term));

// Sampling: log 1/N searches with weight N. Estimate stays close for popular terms, noisy for rare ones.
for (const N of [1, 10, 100]) {
  const est = (true_) => { let s = 0; for (let i = 0; i < true_; i++) if (Math.random() < 1 / N) s += N; return s; };
  console.log(`sample 1/${N}: writes ÷${N}, popular 100000 -> ${est(100_000)}, rare 30 -> ${est(30)}`);
}
console.log('ok.');
