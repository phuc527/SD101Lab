import { useState } from 'react'
import type { PlaygroundProps } from '../labs'
import { errorMessage } from '../lib/api'
import { timeAgo } from '../lib/format'
import { usePoll } from '../lib/hooks'

type Item = {
  id: string
  userId: string
  channel: string
  message: string
  priority: string
  status: string
  attempts: number
  delivered: number
  createdAt: number
  doneAt?: number
}
type Sent = { result?: string; id?: string }

const CHANNELS = ['email', 'sms', 'push']
const GOOD = ['sent']
const BAD = ['failed', 'dead']

export default function Notification({ api }: PlaygroundProps) {
  const list = usePoll(async () => ({ ...(await api.get<{ notifications: Item[] }>('/notifications', { silent: true })), at: Date.now() }), 1000, api.base)
  const [userId, setUserId] = useState('u1')
  const [channel, setChannel] = useState('sms')
  const [message, setMessage] = useState('Your OTP is 482913')
  const [priority, setPriority] = useState('high')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [last, setLast] = useState<string>()

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label)
    setError(undefined)
    const t0 = performance.now()
    try {
      const msg = await fn()
      setLast(`${msg} · API answered in ${Math.round(performance.now() - t0)}ms`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(undefined)
      list.refresh()
    }
  }

  const notify = (body: object) =>
    run('notify', async () => {
      const r = await api.post<Sent>('/notify', body)
      return `${r.id ?? ''} ${r.result ?? ''}`
    })
  const send = () => notify({ userId, channel, message, priority, idempotencyKey: key || undefined })

  const broadcast = () =>
    run('broadcast', async () => {
      const r = await api.post<{ users: number; accepted: number }>('/broadcast', { message: 'Black Friday: 50% off everything' })
      return `broadcast to ${r.users} users, ${r.accepted} accepted`
    })

  const doubleClick = () =>
    run('double', async () => {
      const k = `otp-${Date.now()}`
      const body = { userId: 'u1', channel: 'sms', message: 'Your OTP is 482913', priority: 'high', idempotencyKey: k }
      const [a, b] = await Promise.all([api.post<Sent>('/notify', body), api.post<Sent>('/notify', body)])
      return `same idempotencyKey twice: ${a.result} + ${b.result}`
    })

  const items = list.data?.notifications
  const now = list.data?.at ?? 0

  return (
    <div className="stack">
      <form
        className="stack-sm"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <div className="row wrap">
          <label className="field" style={{ flex: '0 1 6rem' }}>
            <span>User</span>
            <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="u1..u200" />
          </label>
          <label className="field">
            <span>Channel</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Priority</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="high">high (OTP)</option>
              <option value="low">low (marketing)</option>
            </select>
          </label>
          <label className="field" style={{ flex: '0 1 9rem' }}>
            <span>Idempotency key</span>
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="optional" />
          </label>
        </div>
        <label className="field">
          <span>Message</span>
          <input value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <div className="row wrap">
          <button className="btn" type="submit" disabled={!!busy}>{busy === 'notify' ? 'Sending…' : 'Send'}</button>
          <button className="btn btn-ghost" type="button" disabled={!!busy} onClick={broadcast}>
            {busy === 'broadcast' ? 'Broadcasting…' : 'Broadcast promo to 200 users'}
          </button>
          <button className="btn btn-ghost" type="button" disabled={!!busy} onClick={() => notify({ userId: 'u1', channel: 'sms', message: 'Your OTP is 482913', priority: 'high' })}>
            Send OTP now
          </button>
          <button className="btn btn-ghost" type="button" disabled={!!busy} onClick={doubleClick}>Double-submit (same key)</button>
        </div>
        <p className="muted">Tip: broadcast, then immediately send an OTP and watch how long it waits. Raise the failure rate to see retries and duplicates.</p>
        {error && <p className="error-text" role="alert">{error}</p>}
        {last && <p aria-live="polite">{last}</p>}
      </form>

      <div>
        <h3>Notifications (latest 40)</h3>
        {list.error && <p className="error-text" role="alert">{list.error}</p>}
        {list.loading ? (
          <p className="muted">Loading…</p>
        ) : !items?.length ? (
          !list.error && <p className="muted">Nothing sent yet.</p>
        ) : (
          <ul className="list">
            {items.map((n) => (
              <li key={n.id} className="list-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div>
                    <code>{n.id}</code> → {n.userId} · {n.channel} · {n.priority}{' '}
                    <span className={`badge ${GOOD.includes(n.status) ? 'badge-read' : BAD.includes(n.status) ? 'badge-write' : ''}`}>{n.status}</span>
                    {n.delivered > 1 && <span className="badge badge-write"> delivered {n.delivered}×</span>}
                  </div>
                  <div className="muted" style={{ overflowWrap: 'anywhere' }}>
                    {n.message} · {n.attempts} attempt{n.attempts === 1 ? '' : 's'} ·{' '}
                    {n.doneAt ? `done in ${n.doneAt - n.createdAt}ms` : `waiting ${timeAgo(n.createdAt, now)}`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
