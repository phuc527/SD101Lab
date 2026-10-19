// Junior backend: pull model + feed cache (cache-aside) + invalidation on write.
const { serve, sleep } = require('../../lib/api-kit');
const { createStore, parsePaging } = require('../shared');

let db = createStore();
let cache = new Map(); // userId -> post ids newest first (Redis list feed:{userId})
let stats = { hits: 0, misses: 0, invalidations: 0 };

serve(__dirname, {
  meta: {
    title: 'Pull + feed cache (cache-aside)',
    profile: 'read-heavy',
    architecture: `Client ──> API ──> Redis  feed:{userId}  ── HIT ──> return
                    │        MISS
                    └──────> SQL DB (expensive query) ──> fill cache

POST /posts ──> SQL DB ──> DEL feed:{author} + feed:{each follower}`,
    ideas: ['Cache-aside: read the cache first, on miss query the DB and fill the cache', 'Invalidate followers\' caches when someone posts', 'Cursor pagination (id < lastSeen)'],
    tradeoffs: ['Cache hit is ~1ms instead of a DB query', 'An author with many followers triggers an invalidation storm', 'Every miss still runs the expensive query'],
  },
  reset: () => { db = createStore(); cache = new Map(); stats = { hits: 0, misses: 0, invalidations: 0 }; },
  routes: {
    'GET /users': () => ({ users: db.listUsers() }),
    'GET /stats': () => ({ stats: { ...stats, hitRatio: `${Math.round((stats.hits / (stats.hits + stats.misses || 1)) * 100)}%`, cachedFeeds: cache.size } }),
    'POST /follow': ({ body, trace }) => {
      db.follow(body.userId, body.followeeId);
      cache.delete(body.userId);
      trace(`INSERT INTO follows, DEL feed:${body.userId}`);
      return { ok: true };
    },
    'POST /posts': async ({ body, trace }) => {
      const post = db.addPost(body.userId, body.content);
      await sleep(3);
      trace('INSERT INTO posts');
      const affected = db.followerCount(body.userId) + 1;
      [body.userId, ...db.followers.get(body.userId)].forEach((u) => cache.delete(u));
      stats.invalidations += affected;
      await sleep(Math.min(affected / 500, 200)); // DEL for every follower
      trace(`invalidated ${affected.toLocaleString()} feed caches (author + followers)`);
      return { post };
    },
    'GET /feed': async ({ query, trace }) => {
      db.assertUser(query.userId);
      const { cursor, limit } = parsePaging(query);
      let ids = cache.get(query.userId);
      if (ids) {
        stats.hits++;
        await sleep(1);
        trace(`cache HIT feed:${query.userId} (${ids.length} ids)`);
      } else {
        stats.misses++;
        const authors = new Set([...db.following.get(query.userId), query.userId]);
        ids = db.posts.filter((p) => authors.has(p.authorId)).map((p) => p.id).sort((a, b) => b - a);
        await sleep(20 + db.posts.length / 10);
        cache.set(query.userId, ids);
        trace(`cache MISS -> DB query scanned ${db.posts.length} posts -> SET feed:${query.userId}`);
      }
      return db.page(ids, cursor, limit);
    },
  },
});
