// Junior backend: enqueue and return 202; one worker drains a FIFO queue with naive immediate retries.
const { serve } = require('../../lib/api-kit');
const { USERS, readNotify, readMessage, provider, newNotification, listNotifications } = require('../shared');

const MAX_ATTEMPTS = 3;
let all, queue, stats, busy;
function reset() {
  all = [];
  queue = [];
  busy = false;
  stats = { sent: 0, failed: 0, retries: 0, duplicatesDelivered: 0 };
}
reset();

const controls = { failPct: { label: 'Provider failure rate (%)', type: 'number', value: 0, min: 0, max: 100, step: 10 } };

// ponytail: one worker, in-memory queue; a real one is SQS/RabbitMQ with N consumers
async function work() {
  if (busy || !queue.length) return;
  busy = true;
  const n = queue.shift();
  n.status = 'sending';
  let ok = false;
  while (!ok && n.attempts < MAX_ATTEMPTS) {
    n.attempts++;
    const r = await provider(n.channel, controls.failPct.value);
    if (r.delivered) { n.delivered++; if (n.delivered > 1) stats.duplicatesDelivered++; }
    ok = r.ok;
    if (!ok && n.attempts < MAX_ATTEMPTS) stats.retries++; // retry right away, no backoff, no dedup
  }
  n.status = ok ? 'sent' : 'failed';
  n.doneAt = Date.now();
  stats[n.status]++;
  busy = false;
}
setInterval(work, 5).unref();

serve(__dirname, {
  meta: {
    title: 'Queue + 1 worker + immediate retry',
    profile: 'write-heavy',
    architecture: `POST /notify ──> INSERT ──> push to queue ──> 202 Accepted (fast)
                                  │
                       [ FIFO queue: OTP, promo, promo, ... ]
                                  │
                        1 worker ──> provider ──fail──> retry now (max ${MAX_ATTEMPTS})`,
    ideas: ['Async: API latency no longer depends on the provider', 'Queue absorbs bursts (broadcast returns instantly)', 'Retries survive transient 503s'],
    tradeoffs: ['Head-of-line blocking: an OTP waits behind 200 promo emails', 'Retry on timeout re-sends a delivered message (duplicates)', 'Immediate retries hammer a provider that is already down', 'One worker: throughput capped at 1/latency'],
  },
  controls,
  reset,
  routes: {
    'GET /stats': () => ({ stats: { ...stats, queued: queue.length, total: all.length } }),
    'GET /notifications': () => listNotifications(all),
    'POST /notify': ({ body, trace }) => {
      const n = newNotification(readNotify(body));
      all.push(n);
      queue.push(n);
      trace(`INSERT ${n.id}, enqueue at position ${queue.length} (FIFO, priority ignored)`);
      trace('return 202, worker sends later');
      return { status: 202, result: 'queued', id: n.id, queuePosition: queue.length };
    },
    'POST /broadcast': ({ body, trace }) => {
      const message = readMessage(body);
      for (const userId of USERS) {
        const n = newNotification({ userId, channel: 'email', message, priority: 'low' });
        all.push(n);
        queue.push(n);
      }
      trace(`enqueued ${USERS.length} emails, queue depth ${queue.length}`);
      return { status: 202, users: USERS.length, accepted: USERS.length };
    },
  },
});
