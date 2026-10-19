// Run server.js first. Demo: pagination, cache hit/miss, invalidation.
const assert = require('assert');
const call = (uid, method, path, body) =>
  fetch('http://localhost:3010' + path, { method, headers: { 'x-user-id': uid }, body: body && JSON.stringify(body) }).then((r) => r.json());

(async () => {
  for (let i = 1; i <= 7; i++) await call(i % 2 ? 2 : 3, 'POST', '/posts', { content: `post ${i}` });

  let t = performance.now();
  const p1 = await call(1, 'GET', '/feed?limit=3');
  console.log(`page1 (miss, ${(performance.now() - t).toFixed(0)}ms):`, p1.items.map((p) => p.id), 'nextCursor', p1.nextCursor);
  t = performance.now();
  const p2 = await call(1, 'GET', `/feed?limit=3&cursor=${p1.nextCursor}`);
  console.log(`page2 (hit,  ${(performance.now() - t).toFixed(0)}ms):`, p2.items.map((p) => p.id));
  assert.deepEqual(p1.items.map((p) => p.id), [7, 6, 5]);
  assert.deepEqual(p2.items.map((p) => p.id), [4, 3, 2]);

  await call(2, 'POST', '/posts', { content: 'breaking news' }); // invalidates An's cache
  const p3 = await call(1, 'GET', '/feed?limit=3');
  console.log('after Binh posts, page1:', p3.items.map((p) => `${p.id}:${p.content}`));
  assert.equal(p3.items[0].content, 'breaking news');

  console.log('stats', await call(1, 'GET', '/stats'));
  console.log('\nok. Limitation: an author with 1M followers invalidates 1M caches per post, and every miss rebuilds with an expensive JOIN. See newsfeed-middle.');
})();
