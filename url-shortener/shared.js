// Shared helpers for every url-shortener level, so all 4 APIs speak the same contract.
// API contract (same for every level):
//   POST /shorten { url, ttlSeconds? } -> { code, shortUrl, existed }
//   GET  /resolve/:code                -> { redirect: 301|302|404|410, location? }  (HTTP 200: the redirect is simulated)
//   GET  /links                        -> { links: [{ code, url, clicks, createdAt, expiresAt? }] } newest first
//   GET  /stats                        -> { stats: { ... } }
const { fail } = require('../lib/api-kit');

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE_URL = 'https://sho.rt/';

function toBase62(n) {
  n = BigInt(n);
  let s = '';
  do { s = ALPHABET[Number(n % 62n)] + s; n /= 62n; } while (n > 0n);
  return s;
}
const randomCode = (len = 7) => Array.from({ length: len }, () => ALPHABET[Math.floor(Math.random() * 62)]).join('');

// Boundary check every level does: a non-empty string (fresher stops here)
function readUrl(body) {
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) fail(400, 'url required');
  if (url.length > 2048) fail(400, 'url max 2048 chars');
  return url;
}
const isHttpUrl = (u) => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } };
function readTtl(body) {
  if (body.ttlSeconds == null || body.ttlSeconds === '') return null;
  const t = Number(body.ttlSeconds);
  if (!Number.isInteger(t) || t < 1 || t > 86_400) fail(400, 'ttlSeconds must be an integer 1..86400');
  return t;
}

// LRU cache: Map keeps insertion order, so delete + set moves a key to the most-recent end
function createLru(size) {
  const m = new Map();
  return {
    get size() { return m.size; },
    get(k) { if (!m.has(k)) return undefined; const v = m.get(k); m.delete(k); m.set(k, v); return v; },
    set(k, v) { m.delete(k); m.set(k, v); if (m.size > size) m.delete(m.keys().next().value); },
  };
}

const listLinks = (links) => ({
  links: [...links.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 30)
    .map(({ code, url, clicks, createdAt, expiresAt }) => ({ code, url, clicks, createdAt, expiresAt })),
});

module.exports = { ALPHABET, BASE_URL, toBase62, randomCode, readUrl, isHttpUrl, readTtl, listLinks, createLru };
