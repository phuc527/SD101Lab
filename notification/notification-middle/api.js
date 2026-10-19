// Middle backend: a queue per channel, exponential backoff with jitter, DLQ, idempotency keys,
// provider-side dedup, and user preferences (opt-out).
const { serve } = require('../../lib/api-kit');
const { CHANNELS, USERS, optedOut, readNotify, readMessage, provider, newNotification, listNotifications } = require('../shared');

const MAX_ATTEMPTS = 5;
const CONCURRENCY = 2;
let all, lanes, keys, dlq, stats;
function reset() {
  all = [];
  lanes = Object.fromEntries(CHANNELS.map((c) => [c, { queue: [], busy: 0 }]));
  keys = new Map(); // idempotencyKey -> notification id (a UNIQUE index in real life)
  dlq = [];
  stats = { sent: 0, retries: 0, dead: 0, deduped: 0, skippedOptOut: 0, duplicatesDelivered: 0 };
}
reset();

const controls = {
  failPct: { label: 'Provider failure rate (%)', type: 'number', value: 0, min: 0, max: 100, step: 10 },
  channelDown: { label: 'Provider down', type: 'select', value: 'none', options: ['none', ...CHANNELS] },
};

async function deliver(n, lane) {
  lane.busy++;
  n.status = 'sending';
  n.attempts++;
  const down = controls.channelDown.value === n.channel;
  const r = await provider(n.channel, down ? 100 : controls.failPct.value);
  // notification id is sent as the provider's idempotency key, so a retry after a lost ack is not re-delivered
  if (r.delivered && !n.delivered) n.delivered = 1;
  if (r.ok || n.delivered) { n.status = 'sent'; n.doneAt = Date.now(); stats.sent++; }
  else if (n.attempts >= MAX_ATTEMPTS) { n.status = 'dead'; n.doneAt = Date.now(); dlq.push(n); stats.dead++; }
  else {
    stats.retries++;
    n.status = 'retrying';
    n.readyAt = Date.now() + 200 * 2 ** (n.attempts - 1) * (0.5 + Math.random()); // 200ms, 400ms, 800ms... ± jitter
    lane.queue.push(n);
  }
  lane.busy--;
}
setInterval(() => {
  const now = Date.now();
  for (const lane of Object.values(lanes)) {
    while (lane.busy < CONCURRENCY) {
      const i = lane.queue.findIndex((n) => !n.readyAt || n.readyAt <= now);
      if (i < 0) break;
      deliver(lane.queue.splice(i, 1)[0], lane);
    }
  }
}, 10).unref();

function enqueue(n, trace) {
  if (n.priority === 'low' && optedOut(n.userId, n.channel)) {
    n.status = 'skipped'; n.doneAt = Date.now(); stats.skippedOptOut++;
    trace?.(`${n.userId} opted out of marketing ${n.channel} -> skip`);
    return 'skipped';
  }
  lanes[n.channel].queue.push(n);
  trace?.(`enqueue on ${n.channel} queue (depth ${lanes[n.channel].queue.length}), other channels unaffected`);
  return 'queued';
}

serve(__dirname, {
  meta: {
    title: 'Queue per channel, backoff, DLQ, idempotency',
    profile: 'write-heavy',
    architecture: `POST /notify ──> idempotencyKey seen? ──yes──> return same id (deduped)
                  └─> check preferences (opt-out) ──> enqueue on its channel
   [email queue] ──> ${CONCURRENCY} workers ──> SendGrid ─┐
   [sms queue]   ──> ${CONCURRENCY} workers ──> Twilio   ─┼─ fail ──> backoff 200ms·2^n ± jitter ──> requeue
   [push queue]  ──> ${CONCURRENCY} workers ──> FCM      ─┘          after ${MAX_ATTEMPTS} tries ──> DLQ
   provider gets notification.id as its idempotency key (no double delivery on retry)`,
    ideas: ['Idempotency key: client retries of POST /notify do not create a second message', 'Exponential backoff + jitter: do not stampede a struggling provider', 'DLQ: failed messages are kept for inspection/replay, never silently lost', 'Separate queues: an SMS outage does not stall push'],
    tradeoffs: ['Still FIFO inside a channel: an OTP can wait behind a broadcast', 'Provider down = messages pile up and go to DLQ (no failover)', 'No per-user limit: a bug can spam one user'],
  },
  controls,
  reset,
  routes: {
    'GET /stats': () => ({ stats: { ...stats, ...Object.fromEntries(CHANNELS.map((c) => [`${c} queue`, lanes[c].queue.length + lanes[c].busy])), dlq: dlq.length } }),
    'GET /notifications': () => listNotifications(all),
    'POST /notify': ({ body, trace }) => {
      const input = readNotify(body);
      if (input.idempotencyKey && keys.has(input.idempotencyKey)) {
        stats.deduped++;
        trace(`idempotencyKey '${input.idempotencyKey}' already used -> return ${keys.get(input.idempotencyKey)}, nothing enqueued`);
        return { result: 'deduped', id: keys.get(input.idempotencyKey) };
      }
      const n = newNotification(input);
      all.push(n);
      if (input.idempotencyKey) keys.set(input.idempotencyKey, n.id);
      const result = enqueue(n, trace);
      return { status: result === 'queued' ? 202 : 200, result, id: n.id };
    },
    'POST /broadcast': ({ body, trace }) => {
      const message = readMessage(body);
      let accepted = 0;
      for (const userId of USERS) {
        const n = newNotification({ userId, channel: 'email', message, priority: 'low' });
        all.push(n);
        if (enqueue(n) === 'queued') accepted++;
      }
      trace(`${accepted} emails enqueued, ${USERS.length - accepted} skipped (opted out)`);
      return { status: 202, users: USERS.length, accepted };
    },
  },
});
