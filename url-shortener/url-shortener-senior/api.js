// Senior backend: range-leased ids across 3 app nodes, scrambled codes, LRU cache, async click analytics, expiry.
const { serve, sleep, fail } = require('../../lib/api-kit');
const { BASE_URL, toBase62, readUrl, isHttpUrl, readTtl, listLinks, createLru } = require('../shared');

const RANGE = 100; // ids per lease (≈1000 in production); small so leases and gaps are visible
const NODES = ['node-1', 'node-2', 'node-3'];
const CACHE_SIZE = 5;
const FLUSH_MS = 2000;

// Scramble: id * P mod 62^7 is a bijection when gcd(P, 62^7) = 1 (62 = 2 * 31),
// so codes stay unique but look random. P ≈ 0.618 * M spreads neighbours far apart.
const M = 62n ** 7n;
let P = (M * 618n) / 1000n;
while (P % 2n === 0n || P % 31n === 0n) P++;
const scramble = (id) => toBase62((BigInt(id) * P) % M).padStart(7, '0');

let links, byUrl, ticket, leases, rr, cache, buffer, stats, node2Down = false;
function reset() {
  links = new Map();
  byUrl = new Map();
  ticket = 1; // ticket server / etcd: next free range start
  leases = new Map(); // node -> { next, end }
  rr = 0;
  cache = createLru(CACHE_SIZE);
  buffer = new Map(); // code -> clicks not yet flushed to the analytics store
  stats = { links: 0, ticketCalls: 0, idsLost: 0, cacheHits: 0, cacheMisses: 0, clicksFlushed: 0, flushes: 0, expired: 0 };
}
reset();

// Analytics consumer: drain the click buffer in one batch (Kafka -> ClickHouse)
setInterval(() => {
  if (!buffer.size) return;
  for (const [code, n] of buffer) { const l = links.get(code); if (l) l.clicks += n; stats.clicksFlushed += n; }
  buffer.clear();
  stats.flushes++;
}, FLUSH_MS).unref();

function nextId(trace) {
  const up = NODES.filter((n) => !(n === 'node-2' && node2Down));
  const node = up[rr++ % up.length];
  let lease = leases.get(node);
  if (!lease || lease.next > lease.end) {
    lease = { next: ticket, end: ticket + RANGE - 1 };
    ticket += RANGE;
    leases.set(node, lease);
    stats.ticketCalls++;
    trace(`${node}: range exhausted -> lease [${lease.next}..${lease.end}] from ticket server`);
  }
  const id = lease.next++;
  trace(`LB -> ${node}, id ${id} from its local range (no coordination)`);
  return id;
}

serve(__dirname, {
  meta: {
    title: 'Range allocation + scramble + async analytics',
    profile: 'read-heavy',
    architecture: `POST /shorten ──> LB ──> node-1|2|3 (each holds a leased id range of ${RANGE}) ──> scramble(id) ──> base62 ──> KV DB
                         └── range empty? ──> Ticket server / etcd: lease next ${RANGE} ids
GET /:code ──> LRU cache (${CACHE_SIZE}) ──> KV DB ──> expired? 410 Gone ──> 302
                 └──> click event ──> Kafka buffer ──> analytics consumer (batch flush every ${FLUSH_MS / 1000}s)`,
    ideas: ['Range leasing: 1 ticket call per ' + RANGE + ' ids, nodes never coordinate', 'Scramble id*P mod 62^7: unique (bijection) but not guessable', 'Redirect never waits for analytics: clicks are batched', 'Expiry checked on read (410 Gone) + cleanup cron'],
    tradeoffs: ['A crashed node loses its leased range: gaps in ids (acceptable)', 'Click counts are eventually consistent (lag up to one flush)', 'More moving parts: ticket server, queue, consumer'],
  },
  controls: {
    node2Down: { label: 'Kill node-2 (loses its leased range)', type: 'toggle', value: false },
  },
  onControl: (id, v) => {
    if (id !== 'node2Down') return;
    node2Down = Boolean(v);
    const lease = leases.get('node-2');
    if (node2Down && lease) { stats.idsLost += lease.end - lease.next + 1; leases.delete('node-2'); }
  },
  reset,
  routes: {
    'GET /stats': () => {
      const reads = stats.cacheHits + stats.cacheMisses;
      const clicksBuffered = [...buffer.values()].reduce((a, b) => a + b, 0);
      return { stats: { ...stats, clicksBuffered, hitRatio: reads ? `${Math.round((stats.cacheHits / reads) * 100)}%` : '-', nodes: node2Down ? 'node-2 DOWN' : '3 up' } };
    },
    'GET /links': () => listLinks(links),
    'POST /shorten': async ({ body, trace }) => {
      const raw = readUrl(body);
      if (!isHttpUrl(raw)) fail(400, 'only http(s) URLs are allowed');
      const ttl = readTtl(body);
      const url = new URL(raw).href;
      const old = byUrl.get(url);
      if (old && !(links.get(old).expiresAt < Date.now())) { trace(`already shortened -> ${old}`); return { code: old, shortUrl: BASE_URL + old, existed: true }; }
      const id = nextId(trace);
      const code = scramble(id);
      trace(`scramble: ${id} * P mod 62^7 -> ${code}`);
      await sleep(5);
      const link = { code, url, clicks: 0, createdAt: Date.now(), expiresAt: ttl ? Date.now() + ttl * 1000 : undefined };
      links.set(code, link);
      byUrl.set(url, code);
      stats.links++;
      trace(`PUT ${code} into KV DB${ttl ? `, expires in ${ttl}s` : ''}`);
      return { status: 201, code, shortUrl: BASE_URL + code, existed: false };
    },
    'GET /resolve/:code': async ({ params, trace }) => {
      const { code } = params;
      let link = cache.get(code);
      if (link) { stats.cacheHits++; trace(`cache HIT ${code}`); }
      else {
        stats.cacheMisses++;
        await sleep(20);
        link = links.get(code);
        trace(`cache MISS ${code} -> KV DB read`);
        if (!link) { trace('not found -> 404'); return { redirect: 404 }; }
        cache.set(code, link);
      }
      if (link.expiresAt && link.expiresAt < Date.now()) { stats.expired++; trace('expired (checked on read) -> 410 Gone'); return { redirect: 410 }; }
      buffer.set(code, (buffer.get(code) ?? 0) + 1);
      trace(`click event buffered (flushed within ${FLUSH_MS / 1000}s), redirect does not wait`);
      return { redirect: 302, location: link.url };
    },
  },
});
