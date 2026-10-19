// Middle backend: hybrid fan-out. Push to followers' feeds for normal users, pull for celebrities.
const { serve, sleep } = require('../../lib/api-kit');
const { createStore, parsePaging, CELEB_THRESHOLD } = require('../shared');

let db, feeds, stats;
function reset() {
  db = createStore();
  feeds = new Map(); // userId -> post ids newest first (precomputed, Redis list)
  stats = { fanoutWrites: 0, celebPostsSkipped: 0, feedReads: 0 };
  // backfill precomputed feeds for the seed posts
  for (const p of db.posts) if (!db.isCeleb(p.authorId)) for (const u of [p.authorId, ...db.followers.get(p.authorId)]) push(u, p.id);
}
const push = (u, id) => (feeds.get(u) ?? feeds.set(u, []).get(u)).unshift(id);
reset();

serve(__dirname, {
  meta: {
    title: 'Hybrid fan-out (push + pull for celebrities)',
    profile: 'read-heavy',
    architecture: `POST /posts ──> Posts DB
     │ normal author:  write post id into EVERY follower's feed list (push)
     │ celebrity (>= ${CELEB_THRESHOLD.toLocaleString()} followers): skip fan-out
     ▼
GET /feed ──> read precomputed feed:{me}  +  merge timelines of celebs I follow (pull)`,
    ideas: ['Push = fan-out on write: reads become 1 list lookup', 'Pull for celebrities avoids 1 post -> millions of writes', 'Feed stores only post ids; content is hydrated'],
    tradeoffs: ['Writes cost N followers per post (write amplification)', 'Read path is more complex: merge + sort', 'Deleted/edited posts still sit in followers\' feeds'],
  },
  reset,
  routes: {
    'GET /users': () => ({ users: db.listUsers() }),
    'GET /stats': () => ({ stats: { ...stats, precomputedFeeds: feeds.size } }),
    'POST /follow': ({ body, trace }) => {
      db.follow(body.userId, body.followeeId);
      if (!db.isCeleb(body.followeeId)) { // backfill recent posts of the new followee
        const recent = db.posts.filter((p) => p.authorId === body.followeeId).slice(-20);
        const merged = new Set([...(feeds.get(body.userId) ?? []), ...recent.map((p) => p.id)]);
        feeds.set(body.userId, [...merged].sort((a, b) => b - a));
        trace(`backfilled ${recent.length} posts of ${body.followeeId} into feed:${body.userId}`);
      } else trace(`${body.followeeId} is a celebrity: merged at read time, no backfill`);
      return { ok: true };
    },
    'POST /posts': async ({ body, trace }) => {
      const post = db.addPost(body.userId, body.content);
      trace('INSERT INTO posts');
      if (db.isCeleb(body.userId)) {
        stats.celebPostsSkipped++;
        trace(`${body.userId} has ${db.followerCount(body.userId).toLocaleString()} followers -> celebrity, NO fan-out (followers pull at read time)`);
        return { post };
      }
      const targets = [body.userId, ...db.followers.get(body.userId)];
      targets.forEach((u) => push(u, post.id));
      stats.fanoutWrites += targets.length;
      await sleep(2 + targets.length); // synchronous fan-out inside the request
      trace(`fan-out on write: pushed post ${post.id} into ${targets.length} feeds (${targets.join(', ')})`);
      return { post };
    },
    'GET /feed': async ({ query, trace }) => {
      db.assertUser(query.userId);
      const { cursor, limit } = parsePaging(query);
      stats.feedReads++;
      const own = feeds.get(query.userId) ?? [];
      trace(`read precomputed feed:${query.userId} (${own.length} ids)`);
      const celebs = [...db.following.get(query.userId)].filter((u) => db.isCeleb(u));
      const celebIds = db.posts.filter((p) => celebs.includes(p.authorId)).map((p) => p.id);
      if (celebs.length) trace(`pull + merge timelines of celebrities: ${celebs.join(', ')} (${celebIds.length} posts)`);
      await sleep(2 + celebs.length * 5);
      const ids = [...new Set([...own, ...celebIds])].sort((a, b) => b - a);
      return db.page(ids, cursor, limit);
    },
  },
});
