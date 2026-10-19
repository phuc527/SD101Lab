// Shared helpers for every notification level, so all 4 APIs speak the same contract.
// API contract (same for every level):
//   POST /notify { userId, channel, message, priority?, idempotencyKey? } -> { result: 'sent'|'queued'|'deduped'|'skipped', id? }  (HTTP 202 when queued)
//   POST /broadcast { message }   -> { users, accepted }   (marketing message to every user)
//   GET  /notifications           -> { notifications: [{ id, userId, channel, message, priority, status, attempts, createdAt, doneAt? }] }
//   GET  /stats                   -> { stats: { ... } }
const { fail, sleep } = require('../lib/api-kit');

const CHANNELS = ['email', 'sms', 'push'];
const USERS = Array.from({ length: 200 }, (_, i) => `u${i + 1}`);
// u3, u6, ... opted out of marketing email (senior/middle respect it)
const optedOut = (userId, channel) => channel === 'email' && Number(userId.slice(1)) % 3 === 0;

function readNotify(body) {
  const userId = String(body.userId ?? '');
  if (!USERS.includes(userId)) fail(400, 'userId must be u1..u200');
  if (!CHANNELS.includes(body.channel)) fail(400, `channel must be one of ${CHANNELS.join(', ')}`);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) fail(400, 'message required');
  if (message.length > 500) fail(400, 'message max 500 chars');
  const priority = body.priority === 'high' ? 'high' : 'low';
  const idempotencyKey = body.idempotencyKey ? String(body.idempotencyKey).slice(0, 100) : undefined;
  return { userId, channel: body.channel, message, priority, idempotencyKey };
}
function readMessage(body) {
  const m = typeof body.message === 'string' ? body.message.trim() : '';
  if (!m) fail(400, 'message required');
  return m.slice(0, 500);
}

// Third-party provider (SendGrid / Twilio / FCM): slow and sometimes fails.
// ackLost: the provider DID deliver but the response timed out -> caller thinks it failed (duplicate risk)
const LATENCY = { email: 40, sms: 60, push: 15 };
async function provider(channel, failPct, name = channel) {
  await sleep(LATENCY[channel]);
  const r = Math.random() * 100;
  if (r < failPct / 2) return { ok: false, delivered: false, why: `${name} 503` };
  if (r < failPct) return { ok: false, delivered: true, why: `${name} timeout (but it was delivered)` };
  return { ok: true, delivered: true };
}

let seq = 0;
const newNotification = (n) => ({ id: `n${++seq}`, ...n, status: 'queued', attempts: 0, delivered: 0, createdAt: Date.now() });
const listNotifications = (all) => ({
  notifications: all.slice(-40).reverse().map(({ id, userId, channel, message, priority, status, attempts, delivered, createdAt, doneAt }) =>
    ({ id, userId, channel, message, priority, status, attempts, delivered, createdAt, doneAt })),
});

module.exports = { CHANNELS, USERS, optedOut, readNotify, readMessage, provider, newNotification, listNotifications };
