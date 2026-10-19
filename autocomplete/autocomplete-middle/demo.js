// Middle: searches append to a log; a batch rebuild swaps in a new trie. Shows staleness and cache hits.
const assert = require('assert');
const { seed, Trie } = require('../shared');

const counts = seed();
let trie = Trie.from(counts);
let log = [];
const cache = new Map();
let hits = 0;
const suggest = (q) => {
  if (cache.has(q)) { hits++; return cache.get(q); }
  const r = trie.find(q);
  cache.set(q, r);
  return r;
};
const search = (term) => log.push(term); // O(1), no trie work
function rebuild() {
  for (const t of log) counts.set(t, (counts.get(t) ?? 0) + 1);
  log = [];
  trie = Trie.from(counts);
  cache.clear();
}

for (let i = 0; i < 3000; i++) search('rust tutorial');
console.log('after 3000 searches, before rebuild: ru ->', suggest('ru').map((r) => r.term));
assert.equal(suggest('ru').length, 0); // stale on purpose
rebuild();
console.log('after rebuild:                     ru ->', suggest('ru').map((r) => r.term));
assert.equal(suggest('ru')[0].term, 'rust tutorial');

// Zipf-ish traffic: short prefixes dominate, so a small cache absorbs most reads
const prefixes = ['j', 'ja', 'r', 're', 's', 'sy', 'a', 'java', 'redis', 'system d'];
for (let i = 0; i < 10_000; i++) suggest(prefixes[Math.floor(prefixes.length * Math.random() ** 3)]);
console.log(`prefix cache hit rate ${(hits / 10_002 * 100).toFixed(1)}% with only ${cache.size} keys`);
console.log('ok. Next: one trie on one box limits RAM and QPS. See autocomplete-senior.');
