// Fresher: data model + pull model (build the feed when the user reads it)
const assert = require('assert');

// Data model (relational in practice):
// users(id, name) | follows(follower_id, followee_id) | posts(id, author_id, content, created_at)
const users = new Map();
const follows = new Map(); // userId -> Set(followeeId)
const posts = []; // ponytail: array scan, a real DB uses an index on (author_id, created_at)
let postSeq = 0, clock = 0;

function createUser(id, name) { users.set(id, { id, name }); follows.set(id, new Set()); }
function follow(a, b) { follows.get(a).add(b); }
function createPost(authorId, content) {
  const p = { id: ++postSeq, authorId, content, createdAt: ++clock };
  posts.push(p);
  return p;
}

// Pull model: on each read, query posts from everyone I follow, then sort newest first
// SQL: SELECT * FROM posts WHERE author_id IN (:followees, :me) ORDER BY created_at DESC LIMIT 10
function getFeed(userId, limit = 10) {
  const followees = follows.get(userId);
  return posts
    .filter((p) => followees.has(p.authorId) || p.authorId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

createUser(1, 'An'); createUser(2, 'Binh'); createUser(3, 'Chi');
follow(1, 2); follow(1, 3);
createPost(2, 'Binh: hello');
createPost(3, 'Chi: coffee time');
createPost(2, 'Binh: learning system design');
createPost(1, 'An: my first post');

const feed = getFeed(1);
console.log("An's feed:");
feed.forEach((p) => console.log(`  #${p.id} ${p.content}`));

assert.deepEqual(feed.map((p) => p.id), [4, 3, 2, 1]); // newest first
assert.equal(getFeed(2).length, 2); // Binh follows no one, so sees only own posts
console.log('\nok. Limitation: every read queries posts from N followees, which gets slow when following thousands of people. See newsfeed-junior.');
