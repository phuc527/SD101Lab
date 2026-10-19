// Fresher: suggestions = filter by prefix + sort by count over the whole table, on every keystroke
const assert = require('assert');
const { seed, byScore } = require('../shared');

const rows = [...seed()].map(([term, score]) => ({ term, score }));
let scanned = 0;
function suggest(q) {
  scanned += rows.length;
  return rows.filter((r) => r.term.startsWith(q)).sort(byScore).slice(0, 5);
}

const text = 'system design';
for (let i = 1; i <= text.length; i++) suggest(text.slice(0, i));
console.log(`typing "${text}" = ${text.length} queries, ${scanned.toLocaleString()} rows scanned`);
console.log('ja ->', suggest('ja').map((r) => r.term));

assert.equal(suggest('ja')[0].term, 'java');
assert.deepEqual(suggest('zzz'), []);
console.log(`\nAt 50k QPS × 10M rows that is 5×10^11 row reads per second. See autocomplete-junior.`);
