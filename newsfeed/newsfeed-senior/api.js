// Senior backend: async fan-out via queue + workers, celebrity pull, ranking, graceful degradation.
const { serve, sleep } = require('../../lib/api-kit');
const { createStore, parsePaging, CELEB_THRESHOLD } = require('../shared');

const CHUNK = 2; // followers per fan-out job (tiny so the queue is visible with 5 users; ~100-1000 in production)
let db, feeds, queue, stats;
function reset() {
  db = createStore();
  feeds = new Map();
  queue = [];
  stats = { jobsProcessed: 0, fanoutWrites: 0, fallbacks: 0 };
  for (const p of db.posts) if (!db.isCeleb(p.authorId)) for (const u of [p.authorId, ...db.followers.get(p.authorId)]) add(u, p.id);
}
const add = (u, id) => (feeds.get(u) ?? feeds.set(u, new Set()).get(u)).add(id); // Set = idempotent (ZADD)
reset();

let paused = false, cacheDown = false;
// Fan-out worker: one job every 800ms so you can watch the feed fill up
setInterval(() => {
  if (paused || !queue.length) return;
  const job = queue.shift();
  job.users.forEach((u) => add(u, job.postId));
  stats.jobsProcessed++;
  stats.fanoutWrites += job.users.length;
}, 800).unref();

const affinity = (me, author) => (me === author ? 1.2 : db.following.get(author)?.has(me) ? 1 : 0.6); // mutual follow = closer friend
const score = (me, p) => affinity(me, p.authorId) * Math.pow(0.5, (Date.now() - p.createdAt) / 600_000); // half-life 10 min

serve(__dirname, {
  meta: {
    title: 'Async fan-out + ranking + degradation',
    profile: 'read-heavy',
    architecture: `POST /posts ──> Posts DB ──> Kafka "post_created" ──> return 202 immediately
                                   │
                         Fan-out workers (chunks of ${CHUNK}, retry, idempotent ZADD)
                                   ▼
GET /feed ──> Feed cache (sharded Redis) + celeb pull ──> Ranking ──> hydrate
                │ cache down?
                └──> fallback: pull from followees (degraded but no 500)`,
    ideas: ['Posting never waits for fan-out (async queue)', 'Ranking: affinity x time decay instead of pure time', 'Degrade gracefully when the cache is down'],
    tradeoffs: ['Eventual consistency: followers see the post a bit later', 'More moving parts: queue, workers, retries, DLQ', 'Ranking makes the feed non-deterministic (harder to debug)'],
  },
  controls: {
    pauseWorkers: { label: 'Pause fan-out workers', type: 'toggle', value: false },
    cacheDown: { label: 'Feed cache down', type: 'toggle', value: false },
  },
  onControl: (id, v) => { if (id === 'pauseWorkers') paused = v; if (id === 'cacheDown') cacheDown = v; },
  reset,
  routes: {
    'GET /users': () => ({ users: db.listUsers() }),
    'GET /stats': () => ({ stats: { queueBacklog: queue.length, ...stats, workers: paused ? 'paused' : 'running', feedCache: cacheDown ? 'DOWN' : 'up' } }),
    'POST /follow': ({ body, trace }) => {
      db.follow(body.userId, body.followeeId);
      db.posts.filter((p) => p.authorId === body.followeeId && !db.isCeleb(p.authorId)).slice(-20).forEach((p) => add(body.userId, p.id));
      trace(`follow saved, backfilled recent posts of ${body.followeeId}`);
      return { ok: true };
    },
    'POST /posts': async ({ body, trace }) => {
      const post = db.addPost(body.userId, body.content);
      add(body.userId, post.id);
      trace('INSERT INTO posts, publish "post_created"');
      if (db.isCeleb(body.userId)) {
        trace(`celebrity (>= ${CELEB_THRESHOLD.toLocaleString()} followers): no fan-out jobs`);
        return { status: 202, post };
      }
      const fs = [...db.followers.get(body.userId)];
      for (let i = 0; i < fs.length; i += CHUNK) queue.push({ postId: post.id, users: fs.slice(i, i + CHUNK) });
      trace(`enqueued ${Math.ceil(fs.length / CHUNK)} fan-out jobs for ${fs.length} followers, returned 202 without waiting`);
      return { status: 202, post };
    },
    'GET /feed': async ({ query, trace }) => {
      db.assertUser(query.userId);
      const { cursor, limit } = parsePaging(query);
      const me = query.userId;
      let candidates;
      if (cacheDown) {
        stats.fallbacks++;
        const authors = new Set([...db.following.get(me), me]);
        candidates = db.posts.filter((p) => authors.has(p.authorId));
        await sleep(30);
        trace('feed cache DOWN -> fallback: pull directly from followees\' timelines (slower, still 200)');
      } else {
        const ids = feeds.get(me) ?? new Set();
        const celebs = [...db.following.get(me)].filter((u) => db.isCeleb(u));
        candidates = [...ids].map((id) => db.posts[id - 1]).concat(db.posts.filter((p) => celebs.includes(p.authorId)));
        await sleep(3);
        trace(`feed cache: ${ids.size} ids${celebs.length ? ` + pulled celeb timelines (${celebs.join(', ')})` : ''}`);
      }
      // Ranked feed: cursor = rank offset instead of post id
      const ranked = [...new Map(candidates.map((p) => [p.id, p])).values()]
        .map((p) => ({ ...p, score: +score(me, p).toFixed(3) }))
        .sort((a, b) => b.score - a.score);
      trace(`ranked ${ranked.length} candidates by affinity x time decay`);
      const start = cursor ?? 0;
      const items = ranked.slice(start, start + limit);
      return { items, nextCursor: start + limit < ranked.length ? start + limit : null };
    },
  },
});
