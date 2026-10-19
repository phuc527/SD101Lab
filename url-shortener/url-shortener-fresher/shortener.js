// Fresher: a short code maps to a long URL in a key-value store
const assert = require('assert');
const crypto = require('crypto');

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
// Table: urls(code PRIMARY KEY, long_url, created_at)
const urls = new Map();

// ponytail: b % 62 has a slight modulo bias, fine for a demo
const randomCode = (len = 7) => Array.from(crypto.randomBytes(len), (b) => BASE62[b % 62]).join('');

function shorten(longUrl) {
  let code;
  do code = randomCode(); while (urls.has(code)); // retry on collision
  urls.set(code, { longUrl, createdAt: Date.now() });
  return code;
}

// GET /:code -> 302 Location: longUrl, or 404
function redirect(code) {
  const row = urls.get(code);
  return row ? { status: 302, location: row.longUrl } : { status: 404 };
}

const code = shorten('https://en.wikipedia.org/wiki/Systems_design');
console.log(`short URL: https://sho.rt/${code}`);
console.log(`GET /${code} ->`, redirect(code));
console.log('GET /nope ->', redirect('nope'));

assert.equal(code.length, 7);
assert.equal(redirect(code).location, 'https://en.wikipedia.org/wiki/Systems_design');
assert.equal(redirect('nope').status, 404);
assert.notEqual(shorten('https://a.com'), shorten('https://a.com')); // same URL -> 2 different codes

console.log(`\n7 base62 chars = 62^7 = ${(62 ** 7).toLocaleString()} possible codes`);
console.log('ok. Limitation: the same URL gets a new code every time, URLs are not validated, and every random code needs a DB lookup. See url-shortener-junior.');
