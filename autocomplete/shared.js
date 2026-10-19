// Shared helpers for every autocomplete level, so all 4 APIs speak the same contract.
// API contract (same for every level):
//   GET  /suggest?q=prefix -> { q, suggestions: [{ term, score }], source, degraded? }   (q = '' -> global top 5)
//   POST /search { term }  -> { term, recorded, visibleIn }   (visibleIn: 'now' | '~Ns')
//   GET  /stats            -> { stats: { ... } }
const { fail } = require('../lib/api-kit');

const K = 5;
const WORDS = ['amazon', 'android', 'api gateway', 'apple', 'aws', 'bitcoin', 'black friday', 'booking', 'chatgpt', 'chrome',
  'claude', 'crypto', 'docker', 'facebook', 'football', 'free crypto scam', 'gmail', 'google maps', 'instagram', 'iphone 17',
  'java', 'javascript', 'kafka', 'kubernetes', 'linkedin', 'macbook', 'messi', 'netflix', 'nodejs', 'postgres', 'python',
  'react', 'redis', 'spotify', 'system design', 'tiktok', 'typescript', 'uber', 'weather', 'youtube', 'zalo'];
const SUFFIXES = ['', ' login', ' download', ' price', ' news', ' tutorial', ' vs', ' app', ' near me', ' 2026'];

// Deterministic fake popularity so every level starts from the same data
function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function seed() {
  const counts = new Map();
  for (const w of WORDS) SUFFIXES.forEach((s, i) => counts.set(w + s, (hash(w + s) % 900) + (i === 0 ? 1000 : 10)));
  return counts;
}

// Prefix comes straight from the keyboard: keep trailing spaces ("java " != "java"), cap the length
function readPrefix(query) {
  const q = String(query.q ?? '').toLowerCase().trimStart();
  if (q.length > 50) fail(400, 'q max 50 chars');
  return q;
}
function readTerm(body) {
  const t = typeof body.term === 'string' ? body.term.toLowerCase().trim().replace(/\s+/g, ' ') : '';
  if (!t) fail(400, 'term required');
  if (t.length > 50) fail(400, 'term max 50 chars');
  return t;
}

const byScore = (a, b) => b.score - a.score || a.term.localeCompare(b.term);
function mergeTop(top, term, score) {
  return [...top.filter((x) => x.term !== term), { term, score }].sort(byScore).slice(0, K);
}

// Trie where every node caches the top-K terms below it, so a lookup is O(prefix length)
// ponytail: mergeTop assumes scores only grow; a decreasing score needs a subtree rescan
class Trie {
  constructor() { this.root = { c: {}, top: [] }; this.nodes = 1; }
  set(term, score) {
    let n = this.root;
    let touched = 1;
    n.top = mergeTop(n.top, term, score);
    for (const ch of term) {
      n = n.c[ch] ??= (this.nodes++, { c: {}, top: [] });
      n.top = mergeTop(n.top, term, score);
      touched++;
    }
    return touched;
  }
  find(prefix) {
    let n = this.root;
    for (const ch of prefix) { n = n.c[ch]; if (!n) return []; }
    return n.top;
  }
  static from(scores) { const t = new Trie(); for (const [term, s] of scores) t.set(term, s); return t; }
}

module.exports = { K, seed, readPrefix, readTerm, byScore, Trie };
