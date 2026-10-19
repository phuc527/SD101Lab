// Junior backend: in-memory trie, each node caches its top 5, so a lookup walks only len(prefix) nodes.
const { serve } = require('../../lib/api-kit');
const { seed, readPrefix, readTerm, Trie } = require('../shared');

let counts, trie, stats;
function reset() {
  counts = seed();
  trie = Trie.from(counts);
  stats = { suggestCalls: 0, nodesWalked: 0, searches: 0, nodesUpdatedOnWrite: 0 };
}
reset();

serve(__dirname, {
  meta: {
    title: 'Trie with top-5 cached per node',
    profile: 'read-heavy',
    architecture: `GET /suggest?q=ja ──> root ─j─> ─a─> node.top5   (walk 2 nodes, no sort, no DB)

        (root) top5
         ├─ j  top5
         │  └─ a  top5 ──> [java, javascript, ...]
         └─ r  top5 ...

POST /search ──> count++ ──> refresh top5 on EVERY node along the path (sync)`,
    ideas: ['Trie: lookup cost depends on prefix length, not on the number of terms', 'Precompute top-K at each node: reads become O(len(q))', 'Whole trie in memory (a few MB for millions of terms)'],
    tradeoffs: ['Write amplification: one search updates len(term)+1 nodes', 'Writes and reads share one structure (locking at scale)', 'Memory grows with every distinct term, including typos'],
  },
  reset,
  routes: {
    'GET /stats': () => ({ stats: { ...stats, terms: counts.size, trieNodes: trie.nodes } }),
    'GET /suggest': ({ query, trace }) => {
      const q = readPrefix(query);
      const suggestions = trie.find(q);
      stats.suggestCalls++;
      stats.nodesWalked += q.length;
      trace(`walk trie: ${q.length} node${q.length === 1 ? '' : 's'} ('${q}')`);
      trace(suggestions.length ? `read precomputed top ${suggestions.length} at that node (no sort)` : 'prefix not in trie -> empty');
      return { q, suggestions, source: 'trie' };
    },
    'POST /search': ({ body, trace }) => {
      const term = readTerm(body);
      const score = (counts.get(term) ?? 0) + 1;
      counts.set(term, score);
      const touched = trie.set(term, score);
      stats.searches++;
      stats.nodesUpdatedOnWrite += touched;
      trace(`count('${term}') = ${score}`);
      trace(`refresh top5 on ${touched} nodes along the path (synchronous write)`);
      return { term, recorded: true, visibleIn: 'now' };
    },
  },
});
