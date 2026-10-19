// Middle backend: split read and write paths. Searches go to an append-only log, an aggregator rebuilds
// the trie every N seconds and swaps it in, and a prefix cache absorbs hot keystrokes.
const { serve } = require('../../lib/api-kit');
const { seed, readPrefix, readTerm, Trie } = require('../shared');

const CACHE_TTL = 60_000;
let counts, trie, log, cache, lastBuild, stats;
function reset() {
  counts = seed();
  trie = Trie.from(counts);
  log = [];
  cache = new Map(); // prefix -> { suggestions, at }
  lastBuild = Date.now();
  stats = { cacheHits: 0, cacheMisses: 0, searches: 0, rebuilds: 0 };
}
reset();

const controls = {
  cache: { label: 'Prefix cache (Redis)', type: 'toggle', value: true },
  every: { label: 'Aggregate log + rebuild trie every (s)', type: 'number', value: 10, min: 2, max: 30 },
};
const secondsToRebuild = () => Math.max(0, Math.ceil((lastBuild + controls.every.value * 1000 - Date.now()) / 1000));

function rebuild() {
  for (const term of log) counts.set(term, (counts.get(term) ?? 0) + 1);
  log = [];
  trie = Trie.from(counts); // build a new trie off to the side, then swap the pointer
  cache.clear();
  lastBuild = Date.now();
  stats.rebuilds++;
}
setInterval(() => { if (secondsToRebuild() === 0) rebuild(); }, 500).unref();

serve(__dirname, {
  meta: {
    title: 'Async aggregation + rebuilt trie + prefix cache',
    profile: 'read-heavy',
    architecture: `READ   GET /suggest ──> prefix cache ──hit──> top5
                          └─miss──> trie (read-only snapshot) ──> fill cache (TTL 60s)

WRITE  POST /search ──> append to query log (fast, no trie update)
                          │  every N s
                          ▼
       aggregator: count terms ──> build NEW trie ──> swap pointer ──> clear cache`,
    ideas: ['CQRS: the read path never waits for writes', 'Batch aggregation: 1 rebuild instead of one trie update per search', 'Cache short prefixes: "a", "j" are the hottest keys', 'Trie is immutable between swaps (no locks on the read path)'],
    tradeoffs: ['Staleness: a new search shows up only after the next rebuild', 'Full rebuild cost grows with the vocabulary', 'Cache + snapshot = two layers that can be stale'],
  },
  controls,
  onControl: (id) => { if (id === 'every') lastBuild = Date.now(); },
  reset,
  routes: {
    'GET /stats': () => {
      const total = stats.cacheHits + stats.cacheMisses;
      return { stats: { ...stats, hitRate: total ? `${Math.round((stats.cacheHits / total) * 100)}%` : '-', pendingLog: log.length, cachedPrefixes: cache.size, nextRebuildIn: `${secondsToRebuild()}s` } };
    },
    'GET /suggest': ({ query, trace, control }) => {
      const q = readPrefix(query);
      const hit = control('cache') && cache.get(q);
      if (hit && Date.now() - hit.at < CACHE_TTL) {
        stats.cacheHits++;
        trace(`prefix cache HIT '${q}' (age ${Math.round((Date.now() - hit.at) / 1000)}s)`);
        return { q, suggestions: hit.suggestions, source: 'cache' };
      }
      stats.cacheMisses++;
      const suggestions = trie.find(q);
      trace(control('cache') ? `prefix cache MISS '${q}'` : 'cache disabled');
      trace(`trie snapshot built ${Math.round((Date.now() - lastBuild) / 1000)}s ago: walk ${q.length} nodes`);
      if (control('cache')) { cache.set(q, { suggestions, at: Date.now() }); trace('fill cache, TTL 60s'); }
      return { q, suggestions, source: 'trie' };
    },
    'POST /search': ({ body, trace }) => {
      const term = readTerm(body);
      log.push(term);
      stats.searches++;
      trace(`append '${term}' to query log (${log.length} pending), no trie update`);
      trace(`visible after next rebuild in ≈${secondsToRebuild()}s`);
      return { term, recorded: true, visibleIn: `~${secondsToRebuild()}s` };
    },
  },
});
