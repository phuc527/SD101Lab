// Fresher backend: random 7-char base62 code, retry on collision, no validation, no dedup.
const { serve, sleep } = require('../../lib/api-kit');
const { BASE_URL, randomCode, readUrl, isHttpUrl, listLinks } = require('../shared');

let links, stats;
function reset() {
  links = new Map(); // code -> { code, url, clicks, createdAt }
  stats = { links: 0, redirects: 0, notFound: 0, collisionRetries: 0 };
}
reset();

serve(__dirname, {
  meta: {
    title: 'Random code + single table',
    profile: 'read-heavy',
    architecture: `POST /shorten ──> API ──> random 7 chars ──> SELECT exists? ──> INSERT urls(code, long_url)
GET /:code   ──> API ──> SELECT long_url WHERE code = ? ──> 302 Location`,
    ideas: ['Key-value problem: urls(code PK, long_url)', 'base62, 7 chars = 62^7 ≈ 3.5 trillion codes', 'Random code, regenerate on collision'],
    tradeoffs: ['Every write checks the DB for a collision', 'Same URL -> a new code every time (wasted storage)', 'No validation: javascript: URLs are accepted (XSS / phishing)'],
  },
  reset,
  routes: {
    'GET /stats': () => ({ stats: { ...stats } }),
    'GET /links': () => listLinks(links),
    'POST /shorten': async ({ body, trace }) => {
      const url = readUrl(body);
      if (!isHttpUrl(url)) trace(`⚠ no validation: "${url.slice(0, 40)}" accepted as-is (javascript:/data: links enable XSS & phishing)`);
      let code = randomCode();
      while (links.has(code)) { stats.collisionRetries++; trace(`collision on ${code}, retry`); code = randomCode(); }
      trace(`random code ${code}, SELECT: not taken`);
      links.set(code, { code, url, clicks: 0, createdAt: Date.now() });
      stats.links++;
      await sleep(5);
      trace('INSERT INTO urls (no dedup: same URL gets a new code each time)');
      return { status: 201, code, shortUrl: BASE_URL + code, existed: false };
    },
    'GET /resolve/:code': async ({ params, trace }) => {
      await sleep(10);
      const link = links.get(params.code);
      trace(`SELECT long_url FROM urls WHERE code = '${params.code}'`);
      if (!link) { stats.notFound++; trace('not found -> 404'); return { redirect: 404 }; }
      link.clicks++;
      stats.redirects++;
      trace('302 Location: long URL, click counted');
      return { redirect: 302, location: link.url };
    },
  },
});
