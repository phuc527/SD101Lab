// Fresher backend: one table, every keystroke runs SELECT ... WHERE term LIKE 'q%' ORDER BY count DESC LIMIT 5.
const { serve, sleep } = require('../../lib/api-kit');
const { K, seed, readPrefix, readTerm, byScore } = require('../shared');

let rows, stats;
function reset() {
  rows = [...seed()].map(([term, score]) => ({ term, score })); // queries(term, count), no index
  stats = { suggestCalls: 0, rowsScanned: 0, searches: 0 };
}
reset();

serve(__dirname, {
  meta: {
    title: 'Single table, LIKE prefix scan',
    profile: 'read-heavy',
    architecture: `keystroke ──> GET /suggest?q=ja ──> SELECT term FROM queries
                                    WHERE term LIKE 'ja%' ORDER BY count DESC LIMIT 5   (full scan, ≈40ms)
POST /search ──> UPDATE queries SET count = count + 1   (visible on the next keystroke)`,
    ideas: ['Simplest thing that works: one table queries(term, count)', 'Top 5 by popularity', 'Counts update in place, so results are always fresh'],
    tradeoffs: ['Every keystroke scans every row: cost = QPS × rows', 'Typing "system design" = 13 DB queries', 'Reads and writes hit the same rows (lock contention)'],
  },
  reset,
  routes: {
    'GET /stats': () => ({ stats: { ...stats, rows: rows.length } }),
    'GET /suggest': async ({ query, trace }) => {
      const q = readPrefix(query);
      await sleep(40);
      const hits = rows.filter((r) => r.term.startsWith(q));
      stats.suggestCalls++;
      stats.rowsScanned += rows.length;
      trace(`full scan LIKE '${q}%': read ${rows.length} rows (≈40ms), ${hits.length} match`);
      trace(`ORDER BY count DESC LIMIT ${K}`);
      return { q, suggestions: hits.sort(byScore).slice(0, K), source: 'db scan' };
    },
    'POST /search': async ({ body, trace }) => {
      const term = readTerm(body);
      await sleep(10);
      const row = rows.find((r) => r.term === term);
      if (row) row.score++;
      else rows.push({ term, score: 1 });
      stats.searches++;
      trace(row ? `UPDATE count = ${row.score}` : 'INSERT new term (count = 1)');
      return { term, recorded: true, visibleIn: 'now' };
    },
  },
});
