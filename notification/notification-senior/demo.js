// Senior: priority lanes vs FIFO for an OTP sent right after a 200-message broadcast
const assert = require('assert');

const LATENCY = 40;
const promos = Array.from({ length: 200 }, (_, i) => ({ id: `promo${i}`, priority: 'low' }));
const otp = { id: 'otp', priority: 'high' };

// FIFO: the OTP is message #201
const fifoWait = promos.length * LATENCY;
// Priority: the worker always takes high first, so the OTP waits at most for the message in flight
const queue = [...promos, otp];
const next = () => { const i = queue.findIndex((n) => n.priority === 'high'); return queue.splice(i >= 0 ? i : 0, 1)[0]; };
const first = next();
const prioWait = 0;

console.log(`OTP wait with FIFO:     ${fifoWait}ms (behind 200 promos, 1 worker)`);
console.log(`OTP wait with priority: ${prioWait}ms (picked first: ${first.id})`);
assert.equal(first.id, 'otp');

// Circuit breaker: after 3 consecutive failures, route to the secondary for a cooldown
let fails = 0, openUntil = 0;
const route = (now, primaryOk) => {
  if (now < openUntil) return 'secondary';
  if (primaryOk) { fails = 0; return 'primary'; }
  if (++fails >= 3) { openUntil = now + 5000; fails = 0; }
  return 'primary (failed)';
};
const timeline = [0, 100, 200, 300, 400, 5400].map((t) => `${t}ms:${route(t, t >= 5000)}`);
console.log('breaker timeline (primary down until 5s):', timeline.join(', '));
assert.match(timeline[3], /secondary/);
console.log('ok.');
