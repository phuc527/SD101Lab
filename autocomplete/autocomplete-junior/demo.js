// Junior: trie with top-5 cached per node. Compare against a brute-force scan.
const assert = require('assert');
const { seed, byScore, Trie } = require('../shared');

const counts = seed();
const trie = Trie.from(counts);
const brute = (q) => [...counts].map(([term, score]) => ({ term, score })).filter((r) => r.term.startsWith(q)).sort(byScore).slice(0, 5);

for (const q of ['', 'j', 'ja', 'react ', 'nope']) assert.deepEqual(trie.find(q), brute(q));
console.log(`${counts.size} terms, ${trie.nodes} trie nodes`);
console.log('ja ->', trie.find('ja').map((r) => r.term));

const N = 20_000;
let t = performance.now();
for (let i = 0; i < N; i++) brute('ja');
const scanMs = performance.now() - t;
t = performance.now();
for (let i = 0; i < N; i++) trie.find('ja');
const trieMs = performance.now() - t;
console.log(`${N} lookups: scan ${scanMs.toFixed(0)}ms vs trie ${trieMs.toFixed(1)}ms`);

const touched = trie.set('jazz', 5000);
console.log(`search "jazz" -> updated top5 on ${touched} nodes (write amplification)`);
assert.equal(trie.find('ja')[0].term, 'jazz');
console.log('ok. Next: writes block reads and every search touches many nodes. See autocomplete-middle.');
