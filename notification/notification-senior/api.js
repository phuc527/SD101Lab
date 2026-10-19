// Senior backend: priority lanes, per-user rate limit, circuit breaker with provider failover,
// and broadcast fan-out done by a background job in batches.
const { serve, sleep } = require('../../lib/api-kit');
const { CHANNELS, USERS, optedOut, readNotify, readMessage, provider, newNotification, listNotifications } = require('../shared');

const MAX_ATTEMPTS = 5;
const CONCURRENCY = 4;
const USER_LIMIT = 3; // low-priority messages per user per minute
const BATCH = 50;
const PROVIDERS = { email: ['SendGrid', 'SES'], sms: ['Twilio', 'Vonage'], push: ['FCM', 'FCM-backup'] };

let all, lanes, keys, dlq, sentTo, breakers, stats;
function reset() {
  all = [];
  lanes = Object.fromEntries(CHANNELS.map((c) => [c, { high: [], low: [], busy: 0 }]));
  keys = new Map();
  dlq = [];
  sentTo = new Map(); // userId -> timestamps of low-priority messages (sliding window)
  breakers = Object.fromEntries(CHANNELS.map((c) => [c, { fails: 0, openUntil: 0 }]));
  stats = { sent: 0, sentViaFailover: 0, retries: 0, dead: 0, deduped: 0, skippedOptOut: 0, throttled: 0, breakerTrips: 0, duplicatesDelivered: 0 };
}
reset();

const controls = {
  failPct: { label: 'Provider failure rate (%)', type: 'number', value: 0, min: 0, max: 100, step: 10 },
  channelDown: { label: 'Primary provider down', type: 'select', value: 'none', options: ['none', ...CHANNELS] },
};

// Circuit breaker on the primary: 3 failures in a row -> open for 5s -> traffic goes to the secondary
function pickProvider(channel) {
  const b = breakers[channel];
  return Date.now() < b.openUntil ? 1 : 0;
}
async function deliver(n, lane) {
  lane.busy++;
  n.status = 'sending';
  n.attempts++;
  const which = pickProvider(n.channel);
  const primaryDown = which === 0 && controls.channelDown.value === n.channel;
  const r = await provider(n.channel, primaryDown ? 100 : controls.failPct.value, PROVIDERS[n.channel][which]);
  if (which === 0) {
    const b = breakers[n.channel];
    if (r.ok) b.fails = 0;
    else if (++b.fails >= 3) { b.openUntil = Date.now() + 5000; b.fails = 0; stats.breakerTrips++; }
  }
  if (r.delivered && !n.delivered) n.delivered = 1;
  if (r.ok || n.delivered) {
    n.status = 'sent'; n.via = PROVIDERS[n.channel][which]; n.doneAt = Date.now();
    stats.sent++; if (which) stats.sentViaFailover++;
  } else if (n.attempts >= MAX_ATTEMPTS) { n.status = 'dead'; n.doneAt = Date.now(); dlq.push(n); stats.dead++; }
  else {
    stats.retries++;
    n.status = 'retrying';
    n.readyAt = Date.now() + 200 * 2 ** (n.attempts - 1) * (0.5 + Math.random());
    lane[n.priority].push(n);
  }
  lane.busy--;
}
const takeReady = (q, now) => { const i = q.findIndex((n) => !n.readyAt || n.readyAt <= now); return i < 0 ? undefined : q.splice(i, 1)[0]; };
setInterval(() => {
  const now = Date.now();
  for (const lane of Object.values(lanes)) {
    while (lane.busy < CONCURRENCY) {
      const n = takeReady(lane.high, now) ?? takeReady(lane.low, now); // high (OTP, security) always first
      if (!n) break;
      deliver(n, lane);
    }
  }
}, 10).unref();

function enqueue(n, trace) {
  const done = (status, msg) => { n.status = status; n.doneAt = Date.now(); trace?.(msg); return status; };
  if (n.priority === 'low') {
    if (optedOut(n.userId, n.channel)) { stats.skippedOptOut++; return done('skipped', `${n.userId} opted out of marketing ${n.channel} -> skip`); }
    const recent = (sentTo.get(n.userId) ?? []).filter((t) => t > Date.now() - 60_000);
    if (recent.length >= USER_LIMIT) { stats.throttled++; sentTo.set(n.userId, recent); return done('throttled', `${n.userId} got ${USER_LIMIT} low-priority messages this minute -> throttle (no spam)`); }
    sentTo.set(n.userId, [...recent, Date.now()]);
  }
  lanes[n.channel][n.priority].push(n);
  trace?.(`enqueue on ${n.channel}/${n.priority} (depth ${lanes[n.channel][n.priority].length})${n.priority === 'high' ? ', jumps ahead of every low message' : ''}`);
  return 'queued';
}

// Fan-out job: the API returns at once; a background job expands the audience in batches
async function fanOut(message) {
  for (let i = 0; i < USERS.length; i += BATCH) {
    for (const userId of USERS.slice(i, i + BATCH)) {
      const n = newNotification({ userId, channel: 'email', message, priority: 'low' });
      all.push(n);
      enqueue(n);
    }
    await sleep(100); // read the next page of the audience
  }
}

serve(__dirname, {
  meta: {
    title: 'Priority, per-user limit, circuit breaker + failover',
    profile: 'write-heavy',
    architecture: `POST /notify ──> idempotency ──> preferences ──> per-user limit (${USER_LIMIT} low/min) ──> lane[channel][priority]
POST /broadcast ──> 202 + fan-out job: page audience ${BATCH} users at a time ──> low lanes

   lane email: [high: OTP] [low: promo ...]  ──> ${CONCURRENCY} workers, high first
        └─> breaker(SendGrid) closed ──> SendGrid
                      open (3 fails) ──> SES for 5s   (same for Twilio→Vonage, FCM→backup)
   fail ──> backoff + jitter ──> after ${MAX_ATTEMPTS} ──> DLQ`,
    ideas: ['Priority lanes: OTP / password reset never wait behind marketing', 'Per-user rate limit protects users from spam (and you from bugs)', 'Circuit breaker + secondary provider: a vendor outage is a non-event', 'Broadcast is a job, not a request: paged fan-out, API returns at once'],
    tradeoffs: ['Two providers = two contracts, templates and costs', 'Throttled marketing messages are dropped (or must be digested later)', 'Low priority can starve while high traffic is heavy', 'At-least-once + dedup is still not exactly-once end to end'],
  },
  controls,
  reset,
  routes: {
    'GET /stats': () => ({
      stats: {
        ...stats, dlq: dlq.length,
        ...Object.fromEntries(CHANNELS.map((c) => [`${c} queue (hi/lo)`, `${lanes[c].high.length}/${lanes[c].low.length + lanes[c].busy}`])),
        ...Object.fromEntries(CHANNELS.map((c) => [`${c} breaker`, Date.now() < breakers[c].openUntil ? 'OPEN' : 'closed'])),
      },
    }),
    'GET /notifications': () => listNotifications(all),
    'POST /notify': ({ body, trace }) => {
      const input = readNotify(body);
      if (input.idempotencyKey && keys.has(input.idempotencyKey)) {
        stats.deduped++;
        trace(`idempotencyKey '${input.idempotencyKey}' already used -> return ${keys.get(input.idempotencyKey)}`);
        return { result: 'deduped', id: keys.get(input.idempotencyKey) };
      }
      const n = newNotification(input);
      all.push(n);
      if (input.idempotencyKey) keys.set(input.idempotencyKey, n.id);
      const result = enqueue(n, trace);
      if (pickProvider(n.channel)) trace(`${PROVIDERS[n.channel][0]} breaker OPEN -> will use ${PROVIDERS[n.channel][1]}`);
      return { status: result === 'queued' ? 202 : 200, result, id: n.id };
    },
    'POST /broadcast': ({ body, trace }) => {
      const message = readMessage(body);
      fanOut(message);
      trace(`202: fan-out job started, ${USERS.length} users in pages of ${BATCH}`);
      return { status: 202, users: USERS.length, accepted: USERS.length };
    },
  },
});
