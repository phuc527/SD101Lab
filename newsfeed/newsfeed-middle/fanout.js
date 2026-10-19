// Middle: fan-out on write (push) vs fan-out on read (pull) vs hybrid (celebrity problem)
const assert = require('assert');

const NORMAL_FOLLOWERS = 200, CELEB_FOLLOWERS = 1_000_000, CELEB_THRESHOLD = 10_000;
const FOLLOWING_PER_USER = 300, CELEBS_FOLLOWED = 3;

// Cost model in ops: 1 op = 1 write to a feed list, or 1 timeline read
const models = {
  'push (fan-out on write)': ({ posts, celebPosts, reads }) => [posts * NORMAL_FOLLOWERS + celebPosts * CELEB_FOLLOWERS, reads],
  'pull (fan-out on read)': ({ posts, celebPosts, reads }) => [posts + celebPosts, reads * FOLLOWING_PER_USER],
  'hybrid': ({ posts, celebPosts, reads }) => [posts * NORMAL_FOLLOWERS + celebPosts, reads * (1 + CELEBS_FOLLOWED)],
};
const load = { posts: 100_000, celebPosts: 30, reads: 10_000_000 }; // per hour
console.log('Load per hour:', load);
console.table(Object.entries(models).map(([model, f]) => {
  const [w, r] = f(load);
  return { model, writeOps: w.toLocaleString(), readOps: r.toLocaleString(), total: (w + r).toLocaleString() };
}));

// Working hybrid implementation
class FeedService {
  followers = new Map(); following = new Map(); feeds = new Map(); timelines = new Map();
  #add(map, k, v) { (map.get(k) ?? map.set(k, []).get(k)).push(v); }
  follow(a, b) { this.#add(this.followers, b, a); this.#add(this.following, a, b); }
  isCeleb(u) { return (this.followers.get(u)?.length ?? 0) >= CELEB_THRESHOLD; }
  post(author, p) {
    this.#add(this.timelines, author, p);
    if (this.isCeleb(author)) return 0; // no fan-out, merged at read time
    const fs = this.followers.get(author) ?? [];
    fs.forEach((f) => this.#add(this.feeds, f, p)); // push to each follower's feed
    return fs.length;
  }
  read(user, limit = 10) {
    const celebPosts = (this.following.get(user) ?? []).filter((u) => this.isCeleb(u)).flatMap((u) => this.timelines.get(u) ?? []);
    return [...(this.feeds.get(user) ?? []), ...celebPosts].sort((a, b) => b.ts - a.ts).slice(0, limit);
  }
}

const s = new FeedService();
for (let i = 0; i < CELEB_THRESHOLD; i++) s.follow(`fan${i}`, 'taylor');
s.follow('an', 'binh');
s.follow('an', 'taylor');
const w1 = s.post('binh', { ts: 1, text: 'binh: hi' });
const w2 = s.post('taylor', { ts: 2, text: 'taylor: new album' });
console.log(`\nbinh (normal) posts -> ${w1} fan-out write | taylor (celebrity, ${CELEB_THRESHOLD + 1} followers) posts -> ${w2} fan-out writes`);
const feed = s.read('an');
console.log("an's feed (push + merged celeb pull):", feed.map((p) => p.text));
assert.equal(w2, 0);
assert.deepEqual(feed.map((p) => p.ts), [2, 1]);
console.log('\nok. Limitation: fan-out runs synchronously inside the request on a single node. See newsfeed-senior.');
