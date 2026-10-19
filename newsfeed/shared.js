// Shared data + seed for every newsfeed level, so all 4 APIs start from the same world.
// API contract (same for every level):
//   GET  /users                         -> { users: [{ id, followers, following, celebrity }] }
//   POST /follow { userId, followeeId } -> { ok }
//   POST /posts  { userId, content }    -> { post }
//   GET  /feed?userId=&cursor=&limit=   -> { items: [post], nextCursor }
//   GET  /stats                         -> { stats: { ... } }
const { fail } = require('../lib/api-kit');

const CELEB_THRESHOLD = 10_000;
const FANS = 20_000; // synthetic followers of "taylor" to make the celebrity problem visible

function createStore() {
  const users = ['alice', 'bob', 'chi', 'dan', 'taylor'];
  const following = new Map(users.map((u) => [u, new Set()]));
  const followers = new Map(users.map((u) => [u, new Set()]));
  const posts = []; // { id, authorId, content, createdAt }
  let seq = 0;

  const assertUser = (u) => { if (!following.has(u)) fail(400, `unknown user ${u}`); };
  const store = {
    posts, following, followers,
    follow(a, b) {
      assertUser(a); assertUser(b);
      if (a === b) fail(400, 'cannot follow yourself');
      following.get(a).add(b);
      followers.get(b).add(a);
    },
    addPost(authorId, content) {
      assertUser(authorId);
      const text = String(content ?? '').trim();
      if (!text) fail(400, 'content required');
      if (text.length > 280) fail(400, 'content max 280 chars');
      const post = { id: ++seq, authorId, content: text, createdAt: Date.now() };
      posts.push(post);
      return post;
    },
    followerCount: (u) => followers.get(u).size + (u === 'taylor' ? FANS : 0),
    isCeleb: (u) => store.followerCount(u) >= CELEB_THRESHOLD,
    listUsers: () => users.map((id) => ({ id, followers: store.followerCount(id), following: following.get(id).size, celebrity: store.isCeleb(id) })),
    assertUser,
    // newest-first page of a list of post ids, cursor = last id seen
    page(ids, cursor, limit) {
      const start = cursor ? ids.findIndex((id) => id < cursor) : 0;
      const pageIds = start === -1 ? [] : ids.slice(start, start + limit);
      return { items: pageIds.map((id) => posts[id - 1]), nextCursor: pageIds.length === limit ? pageIds.at(-1) : null };
    },
  };

  [['alice', 'bob'], ['alice', 'chi'], ['alice', 'taylor'], ['bob', 'alice'], ['chi', 'alice'], ['chi', 'bob'], ['dan', 'taylor'], ['dan', 'alice']]
    .forEach(([a, b]) => store.follow(a, b));
  [['bob', 'Morning run done 🏃'], ['chi', 'Anyone up for coffee?'], ['taylor', 'New album out Friday!'], ['alice', 'Learning system design today'], ['bob', 'Fan-out on write vs read, thoughts?']]
    .forEach(([u, c]) => store.addPost(u, c));
  return store;
}

const parsePaging = (q) => ({
  cursor: Number(q.cursor) || null,
  limit: Math.min(Math.max(Number(q.limit) || 10, 1), 50),
});

module.exports = { createStore, parsePaging, CELEB_THRESHOLD, FANS };
