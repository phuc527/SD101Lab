// Middle backend: pluggable code strategy (counter | hash | random), LRU cache in front of the DB, 301 vs 302.
const crypto = require('crypto');
const { serve, sleep, fail } = require('../../lib/api-kit');
const { BASE_URL, toBase62, randomCode, readUrl, isHttpUrl, listLinks, createLru } = require('../shared');

const CACHE_SIZE = 5; // tiny on purpose: hot links stay, the long tail gets evicted
let links, byUrl, nextId, cache, stats;
function reset() {
  links = new Map();
  byUrl = new Map();
  nextId = 1_000_000;
  cache = createLru(CACHE_SIZE);
  stats = { links: 0, cacheHits: 0, cacheMisses: 0, dbReads: 0, collisions: 0, browserCached: 0 };
}
reset();

let strategy = 'counter', redirectCode = 302, codeLength = 7;

// Returns a free code; counts collisions for hash/random
function generate(url, trace) {
  if (strategy === 'counter') return toBase62(nextId++);
  for (let salt = 0; ; salt++) {
    const code = strategy === 'hash'
      ? toBase62(BigInt('0x' + crypto.createHash('md5').update(url + (salt ? `#${salt}` : '')).digest('hex').slice(0, 16))).slice(0, codeLength)
      : randomCode(codeLength);
    if (!links.has(code)) return code;
    stats.collisions++;
    trace(`COLLISION: ${code} already taken -> ${strategy === 'hash' ? 'add salt and rehash' : 'pick again'}`);
  }
}

serve(__dirname, {
  meta: {
    title: 'Code strategies + LRU cache + 301 vs 302',
    profile: 'read-heavy',
    architecture: `POST /shorten ──> validate ──> strategy: counter | md5(url)[:n] | random ──> collision? retry ──> DB
GET /:code ──> LRU cache (${CACHE_SIZE} entries, Redis) ── HIT ──> redirect
                    └── MISS ──> DB (≈30ms) ──> fill cache ──> 301 (browser caches) | 302 (every click hits us)`,
    ideas: ['Counter never collides; hash/random do (birthday paradox, grows with n²)', 'Zipf traffic: a small LRU cache catches the hot links', '301 = less load but analytics lost; 302 = every click counted'],
    tradeoffs: ['No strategy is unique + unguessable + coordination-free at once', 'Cache adds staleness on update/delete', '301 cannot be undone once browsers cached it'],
  },
  controls: {
    strategy: { label: 'Code strategy', type: 'select', value: 'counter', options: ['counter', 'hash', 'random'] },
    codeLength: { label: 'Code length for hash/random (shorter = more collisions)', type: 'number', value: 7, min: 2, max: 7, step: 1 },
    redirect: { label: 'Redirect status', type: 'select', value: '302', options: ['302', '301'] },
  },
  onControl: (id, v) => {
    if (id === 'strategy' && ['counter', 'hash', 'random'].includes(v)) strategy = v;
    if (id === 'codeLength') codeLength = Math.min(7, Math.max(2, Math.round(Number(v)) || 7));
    if (id === 'redirect') redirectCode = Number(v) === 301 ? 301 : 302;
  },
  reset,
  routes: {
    'GET /stats': () => {
      const reads = stats.cacheHits + stats.cacheMisses;
      return { stats: { ...stats, hitRatio: reads ? `${Math.round((stats.cacheHits / reads) * 100)}%` : '-', cached: `${cache.size}/${CACHE_SIZE}`, strategy, redirect: redirectCode } };
    },
    'GET /links': () => listLinks(links),
    'POST /shorten': async ({ body, trace }) => {
      const raw = readUrl(body);
      if (!isHttpUrl(raw)) fail(400, 'only http(s) URLs are allowed');
      const url = new URL(raw).href;
      await sleep(5);
      const old = byUrl.get(url);
      if (old) { trace(`already shortened -> ${old}`); return { code: old, shortUrl: BASE_URL + old, existed: true }; }
      const code = generate(url, trace);
      trace(`strategy=${strategy}${strategy === 'counter' ? '' : `, length ${codeLength}`} -> ${code}`);
      links.set(code, { code, url, clicks: 0, createdAt: Date.now(), browserCached: false });
      byUrl.set(url, code);
      stats.links++;
      return { status: 201, code, shortUrl: BASE_URL + code, existed: false };
    },
    'GET /resolve/:code': async ({ params, trace }) => {
      const { code } = params;
      const known = links.get(code);
      if (known?.browserCached) {
        // simulated: the browser follows its cached 301 and never asks us, so nothing is counted
        stats.browserCached++;
        trace('browser cached the 301 -> request never reaches the server, click NOT counted');
        return { redirect: 301, location: known.url, browserCache: true };
      }
      let link = cache.get(code);
      if (link) { stats.cacheHits++; trace(`cache HIT ${code}`); }
      else {
        stats.cacheMisses++;
        await sleep(30);
        stats.dbReads++;
        link = links.get(code);
        trace(`cache MISS ${code} -> DB read (≈30ms)`);
        if (!link) { trace('not found -> 404'); return { redirect: 404 }; }
        cache.set(code, link);
      }
      link.clicks++;
      if (redirectCode === 301) { link.browserCached = true; trace('301 Moved Permanently: browser will cache it, later clicks are invisible to us'); }
      else trace('302 Found: browser asks us every time, click counted');
      return { redirect: redirectCode, location: link.url };
    },
  },
});
