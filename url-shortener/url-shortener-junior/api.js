// Junior backend: DB auto-increment id -> base62 (never collides), http(s)-only validation, idempotent shorten.
const { serve, sleep, fail } = require('../../lib/api-kit');
const { BASE_URL, toBase62, readUrl, isHttpUrl, listLinks } = require('../shared');

const START_ID = 1_000_000; // start high so codes are 4 chars instead of "1"
let links, byUrl, nextId, stats;
function reset() {
  links = new Map(); // code -> { code, url, clicks, createdAt }
  byUrl = new Map(); // normalized long_url -> code (UNIQUE index)
  nextId = START_ID;
  stats = { links: 0, dedupHits: 0, rejected: 0, redirects: 0, notFound: 0 };
}
reset();

serve(__dirname, {
  meta: {
    title: 'Counter + base62, validation, idempotent',
    profile: 'read-heavy',
    architecture: `POST /shorten ──> validate http(s) ──> SELECT by long_url (UNIQUE) ──> exists? return old code (200)
                                        └─ new ──> INSERT, id = AUTO_INCREMENT ──> base62(id) (201)
GET /:code ──> base62 -> id ──> SELECT (≈30ms DB) ──> 302 | 404`,
    ideas: ['Counter + base62: unique ids, never collide, no DB check', 'Idempotent: same URL returns the same code', 'Only http/https: block javascript:/data: links', 'Normalize with new URL().href'],
    tradeoffs: ['Codes are sequential: anyone can enumerate every link', 'One DB counter = single point of failure', 'Every redirect hits the DB (slow, no cache yet)'],
  },
  reset,
  routes: {
    'GET /stats': () => ({ stats: { ...stats, nextId } }),
    'GET /links': () => listLinks(links),
    'POST /shorten': async ({ body, trace }) => {
      const raw = readUrl(body);
      if (!isHttpUrl(raw)) { stats.rejected++; fail(400, 'only http(s) URLs are allowed'); }
      const url = new URL(raw).href;
      trace(`validated + normalized -> ${url}`);
      await sleep(5);
      const old = byUrl.get(url);
      if (old) { stats.dedupHits++; trace(`UNIQUE(long_url) hit: return existing code ${old} (200)`); return { code: old, shortUrl: BASE_URL + old, existed: true }; }
      const id = nextId++;
      const code = toBase62(id);
      links.set(code, { code, url, clicks: 0, createdAt: Date.now() });
      byUrl.set(url, code);
      stats.links++;
      trace(`INSERT id=${id} -> base62 ${code} (unique by construction, no collision check)`);
      return { status: 201, code, shortUrl: BASE_URL + code, existed: false };
    },
    'GET /resolve/:code': async ({ params, trace }) => {
      await sleep(30); // fake DB round-trip on every redirect
      const link = links.get(params.code);
      trace(`DB lookup code=${params.code} (≈30ms, no cache)`);
      if (!link) { stats.notFound++; trace('not found -> 404'); return { redirect: 404 }; }
      link.clicks++;
      stats.redirects++;
      trace('302 Location, click counted');
      return { redirect: 302, location: link.url };
    },
  },
});
