// Junior: REST API + cursor pagination + feed cache with invalidation
const http = require('http');

const follows = new Map([[1, new Set([2, 3])], [2, new Set()], [3, new Set()]]);
const followersOf = (id) => [...follows].filter(([, s]) => s.has(id)).map(([u]) => u);
const posts = [];
let seq = 0;

// Cache: userId -> post ids (newest first), like a Redis list feed:{userId}
const feedCache = new Map();
const stats = { hit: 0, miss: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function buildFeedFromDb(userId) {
  await sleep(30); // fake expensive JOIN query
  const f = follows.get(userId);
  return posts.filter((p) => f.has(p.authorId) || p.authorId === userId)
    .sort((a, b) => b.id - a.id).map((p) => p.id);
}

async function getFeed(userId, cursor, limit) {
  let ids = feedCache.get(userId);
  if (ids) stats.hit++;
  else { stats.miss++; ids = await buildFeedFromDb(userId); feedCache.set(userId, ids); }
  // Cursor = last post id seen. Unlike offset, new posts don't shift the pages.
  const start = cursor ? ids.findIndex((id) => id < cursor) : 0;
  const page = start === -1 ? [] : ids.slice(start, start + limit);
  return { items: page.map((id) => posts[id - 1]), nextCursor: page.length === limit ? page.at(-1) : null };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const userId = Number(req.headers['x-user-id']);
  const send = (c, b) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
  if (url.pathname === '/stats') return send(200, stats);
  if (!follows.has(userId)) return send(401, { error: 'x-user-id header required' });

  if (req.method === 'POST' && url.pathname === '/posts') {
    let body = '';
    for await (const c of req) body += c;
    const { content } = JSON.parse(body || '{}');
    if (!content) return send(400, { error: 'content required' });
    const p = { id: ++seq, authorId: userId, content };
    posts.push(p);
    [userId, ...followersOf(userId)].forEach((u) => feedCache.delete(u)); // invalidate affected feeds
    return send(201, p);
  }
  if (req.method === 'GET' && url.pathname === '/feed') {
    const limit = Math.min(Number(url.searchParams.get('limit')) || 10, 50); // cap the page size
    const cursor = Number(url.searchParams.get('cursor')) || null;
    return send(200, await getFeed(userId, cursor, limit));
  }
  send(404, { error: 'not found' });
}).listen(3010, () => console.log('newsfeed-junior on :3010'));
