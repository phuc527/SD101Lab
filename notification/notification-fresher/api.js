// Fresher backend: call the provider inside the HTTP request. Simple, but slow and fragile.
const { serve } = require('../../lib/api-kit');
const { USERS, readNotify, readMessage, provider, newNotification, listNotifications } = require('../shared');

let all, stats;
function reset() {
  all = [];
  stats = { sent: 0, failed: 0 };
}
reset();

async function send(n, failPct, trace) {
  n.attempts++;
  const r = await provider(n.channel, failPct);
  if (r.delivered) n.delivered++;
  n.status = r.ok ? 'sent' : 'failed';
  n.doneAt = Date.now();
  stats[n.status]++;
  trace?.(r.ok ? `${n.channel} provider OK` : `${r.why} -> give up, error to caller`);
}

serve(__dirname, {
  meta: {
    title: 'Synchronous send inside the request',
    profile: 'write-heavy',
    architecture: `POST /notify ──> INSERT notification ──> call SendGrid/Twilio/FCM (40-60ms) ──> 200 | 502
POST /broadcast ──> for each of 200 users: call provider, one by one   (request blocks ≈8s)`,
    ideas: ['One table notifications(id, user, channel, message, status)', 'Status is known when the request returns', 'No extra infrastructure'],
    tradeoffs: ['API latency = provider latency; provider down = your API down', 'No retry: a 503 loses the notification', 'Broadcast to N users blocks the request for N × latency'],
  },
  controls: { failPct: { label: 'Provider failure rate (%)', type: 'number', value: 0, min: 0, max: 100, step: 10 } },
  reset,
  routes: {
    'GET /stats': () => ({ stats: { ...stats, total: all.length } }),
    'GET /notifications': () => listNotifications(all),
    'POST /notify': async ({ body, trace, control }) => {
      const n = newNotification(readNotify(body));
      all.push(n);
      trace(`INSERT ${n.id}, call ${n.channel} provider synchronously`);
      await send(n, control('failPct'), trace);
      return n.status === 'sent' ? { result: 'sent', id: n.id } : { status: 502, error: 'provider failed, notification lost' };
    },
    'POST /broadcast': async ({ body, trace, control }) => {
      const message = readMessage(body);
      for (const userId of USERS) {
        const n = newNotification({ userId, channel: 'email', message, priority: 'low' });
        all.push(n);
        await send(n, control('failPct'));
      }
      trace(`sent ${USERS.length} emails one by one inside this request`);
      return { users: USERS.length, accepted: USERS.length };
    },
  },
});
