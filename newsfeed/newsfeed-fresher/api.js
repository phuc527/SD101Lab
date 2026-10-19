// Fresher backend: pull model. Every feed read queries all posts of everyone you follow.
const { serve, sleep } = require('../../lib/api-kit');
const { createStore, parsePaging } = require('../shared');

let db = createStore();
let stats = { feedReads: 0, postsScanned: 0, writes: 0 };

serve(__dirname, {
  meta: {
    title: 'Pull model (fan-out on read)',
    profile: 'read-heavy',
    architecture: `Client ──> API ──> SQL DB
                    SELECT * FROM posts
                    WHERE author_id IN (:followees, :me)
                    ORDER BY created_at DESC LIMIT 10`,
    ideas: ['Data model: users / follows / posts', 'Feed is built at read time (pull)', 'Index posts(author_id, created_at)'],
    tradeoffs: ['Writes are cheap: 1 INSERT per post', 'Reads are expensive: scan + sort on every feed open', 'Gets slow when following thousands of people'],
  },
  reset: () => { db = createStore(); stats = { feedReads: 0, postsScanned: 0, writes: 0 }; },
  routes: {
    'GET /users': () => ({ users: db.listUsers() }),
    'GET /stats': () => ({ stats: { ...stats, totalPosts: db.posts.length } }),
    'POST /follow': ({ body, trace }) => {
      db.follow(body.userId, body.followeeId);
      trace(`INSERT INTO follows (${body.userId} -> ${body.followeeId})`);
      return { ok: true };
    },
    'POST /posts': async ({ body, trace }) => {
      const post = db.addPost(body.userId, body.content);
      stats.writes++;
      await sleep(3);
      trace('INSERT INTO posts: 1 write, nothing else to do (pull model)');
      return { post };
    },
    'GET /feed': async ({ query, trace }) => {
      db.assertUser(query.userId);
      const { cursor, limit } = parsePaging(query);
      const authors = new Set([...db.following.get(query.userId), query.userId]);
      trace(`SELECT posts WHERE author_id IN (${[...authors].join(', ')})`);
      const ids = db.posts.filter((p) => authors.has(p.authorId)).map((p) => p.id).sort((a, b) => b - a);
      stats.feedReads++;
      stats.postsScanned += db.posts.length;
      await sleep(20 + db.posts.length / 10); // full scan cost grows with the table
      trace(`scanned ${db.posts.length} posts, matched ${ids.length}, sorted by time`);
      return db.page(ids, cursor, limit);
    },
  },
});
