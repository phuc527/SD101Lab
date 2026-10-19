// Senior backend: trie sharded by first letter, sampled logging, trending boost, blocklist,
// and graceful degradation when a shard is down (stale cache or empty, never an error page).
const { serve } = require('../../lib/api-kit');
const { seed, readPrefix, readTerm, Trie, byScore, K } = require('../shared');

const SHARDS = [{ id: 'a-h', re: /^[a-h]/ }, { id: 'i-p', re: /^[i-p]/ }, { id: 'q-z', re: /^[^a-p]/ }];
const shardOf = (s) => SHARDS.find((x) => x.re.test(s)).id;
const BLOCKED = ['scam']; // ponytail: substring blocklist, a real one is a moderated list + classifier
const blocked = (t) => BLOCKED.some((w) => t.includes(w));
const EVERY = 5_000;
const TREND_BOOST = 30;

let counts, recent, tries, cache, log, lastBuild, stats;
const controls = {
  shardDown: { label: 'Shard down', type: 'select', value: 'none', options: ['none', ...SHARDS.map((s) => s.id)] },
  trending: { label: 'Trending boost (recent searches rank higher)', type: 'toggle', value: true },
  sample: { label: 'Log sampling 1/N (write cost vs accuracy)', type: 'number', value: 1, min: 1, max: 10 },
};
const secondsToRebuild = () => Math.max(0, Math.ceil((lastBuild + EVERY - Date.now()) / 1000));

function build() {
  for (const [term, w] of log) {
    counts.set(term, (counts.get(term) ?? 0) + w);
    recent.set(term, (recent.get(term) ?? 0) + w);
  }
  log = [];
  const parts = Object.fromEntries(SHARDS.map((s) => [s.id, new Map()]));
  for (const [term, c] of counts) {
    if (blocked(term)) continue;
    const boost = controls.trending.value ? Math.round((recent.get(term) ?? 0) * TREND_BOOST) : 0;
    parts[shardOf(term)].set(term, c + boost);
  }
  tries = Object.fromEntries(Object.entries(parts).map(([id, m]) => [id, Trie.from(m)]));
  for (const [t, r] of recent) if (r < 1) recent.delete(t); else recent.set(t, r / 2); // decay
  cache.clear();
  lastBuild = Date.now();
  stats.rebuilds++;
}
function reset() {
  counts = seed();
  recent = new Map(); // term -> recent searches, halves every rebuild
  log = [];
  cache = new Map(); // prefix -> suggestions; survives a shard outage (stale but useful)
  stats = { suggestCalls: 0, cacheHits: 0, degraded: 0, searches: 0, logged: 0, blockedSearches: 0, rebuilds: 0 };
  build();
}
reset();
setInterval(() => { if (secondsToRebuild() === 0) build(); }, 500).unref();

serve(__dirname, {
  meta: {
    title: 'Sharded tries, sampling, trending, degradation',
    profile: 'read-heavy',
    architecture: `client (debounce, browser cache) ──> CDN cache for 1-2 char prefixes
   └──> router: shard by first letter ──> [a-h] trie   [i-p] trie   [q-z] trie   (replicated)
          '' = scatter-gather top5 from all shards
          shard down ──> stale prefix cache ──> else empty list (degraded, page still works)

POST /search ──> sample 1/N ──> Kafka log (weight N) ──> aggregator every 5s:
     counts + recent×${TREND_BOOST} (trending, decays /2) ──> drop blocklisted ──> build tries ──> swap`,
    ideas: ['Shard by prefix so each trie fits in memory; replicate shards for read QPS', 'Empty prefix = scatter-gather and merge top 5', 'Sampling: log 1 in N searches with weight N (N× fewer writes)', 'Trending = recent window with decay; blocklist filtered at build time', 'Autocomplete is optional: degrade, never fail the page'],
    tradeoffs: ['Prefix sharding is uneven: "s" is far hotter than "x" (split hot ranges)', 'Sampling makes rare terms noisy or invisible', 'Trending boost can promote spam bursts (needs abuse detection)', 'More moving parts: router, aggregator, cache, replicas'],
  },
  controls,
  onControl: (id) => { if (id === 'trending') build(); },
  reset,
  routes: {
    'GET /stats': () => ({ stats: { ...stats, pendingLog: log.length, cachedPrefixes: cache.size, trendingTerms: recent.size, nextRebuildIn: `${secondsToRebuild()}s`, ...Object.fromEntries(SHARDS.map((s) => [`nodes ${s.id}`, tries[s.id].nodes])) } }),
    'GET /suggest': ({ query, trace, control }) => {
      const q = readPrefix(query);
      stats.suggestCalls++;
      const down = control('shardDown');
      if (!q) {
        const live = SHARDS.filter((s) => s.id !== down);
        trace(`empty prefix: scatter-gather top${K} from ${live.length} shards${down !== 'none' ? ` (${down} down, skipped)` : ''}`);
        const suggestions = live.flatMap((s) => tries[s.id].find('')).sort(byScore).slice(0, K);
        return { q, suggestions, source: 'scatter-gather', degraded: down !== 'none' };
      }
      const shard = shardOf(q);
      trace(`route '${q}' -> shard ${shard}`);
      if (shard === down) {
        stats.degraded++;
        const stale = cache.get(q);
        trace(stale ? `shard ${shard} DOWN: serve stale cache` : `shard ${shard} DOWN, nothing cached: return empty (degraded, not 5xx)`);
        return { q, suggestions: stale ?? [], source: stale ? 'stale cache' : 'none', degraded: true };
      }
      if (cache.has(q)) {
        stats.cacheHits++;
        trace('prefix cache HIT (Cache-Control: max-age=60 for browser/CDN)');
        return { q, suggestions: cache.get(q), source: 'cache' };
      }
      const suggestions = tries[shard].find(q);
      cache.set(q, suggestions);
      trace(`shard ${shard} trie: walk ${q.length} nodes, fill cache`);
      return { q, suggestions, source: `shard ${shard}` };
    },
    'POST /search': ({ body, trace, control }) => {
      const term = readTerm(body);
      stats.searches++;
      if (blocked(term)) { stats.blockedSearches++; trace(`'${term}' matches blocklist: logged for analytics, never suggested`); }
      const n = control('sample');
      if (Math.random() >= 1 / n) {
        trace(`sampling 1/${n}: this search not logged (saves a write)`);
        return { term, recorded: false, visibleIn: 'sampled out' };
      }
      log.push([term, n]);
      stats.logged++;
      trace(`log '${term}' with weight ${n} -> Kafka (${log.length} pending)`);
      trace(`aggregator rebuilds shard ${shardOf(term)} in ≈${secondsToRebuild()}s${control('trending') ? `, trending boost ×${TREND_BOOST}` : ''}`);
      return { term, recorded: true, visibleIn: blocked(term) ? 'never (blocked)' : `~${secondsToRebuild()}s` };
    },
  },
});
