import { useState } from 'react'
import type { PlaygroundProps } from '../labs'
import { errorMessage } from '../lib/api'
import { usePoll } from '../lib/hooks'

type Order = { id: string; userId: string; status: string; createdAt: number }
type Orders = { orders: Order[]; total: number; stock: number; oversold: number }
type Bought = { result?: string; orderId?: string }

const STOCK = 100

export default function FlashSale({ api }: PlaygroundProps) {
  const list = usePoll(() => api.get<Orders>('/orders', { silent: true }), 1000, api.base)
  const [userId, setUserId] = useState('u1')
  const [key, setKey] = useState('')
  const [buyers, setBuyers] = useState(500)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [last, setLast] = useState<string>()

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label)
    setError(undefined)
    const t0 = performance.now()
    try {
      const msg = await fn()
      setLast(`${msg} · ${Math.round(performance.now() - t0)}ms`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(undefined)
      list.refresh()
    }
  }

  // 409 (sold out / limit) is an expected answer here, not an error
  const buyOnce = (body: object) =>
    api.post<Bought>('/buy', body).catch((e) => ({ result: errorMessage(e) }) as Bought)

  const buy = () =>
    run('buy', async () => {
      const r = await buyOnce({ userId, idempotencyKey: key || undefined })
      return `${userId}: ${r.result}${r.orderId ? ` ${r.orderId}` : ''}`
    })

  const doubleSubmit = () =>
    run('double', async () => {
      const body = { userId, idempotencyKey: `buy-${Date.now()}` }
      const [a, b] = await Promise.all([buyOnce(body), buyOnce(body)])
      return `same key twice: ${a.result} ${a.orderId ?? ''} + ${b.result} ${b.orderId ?? ''}`
    })

  const rush = () =>
    run('rush', async () => {
      const r = await api.post<{ buyers: number; won: number; rejected: number }>('/rush', { buyers })
      return `${r.buyers} buyers: ${r.won} won, ${r.rejected} rejected`
    })

  const d = list.data
  const sold = d ? Math.min(d.total, STOCK) : 0

  return (
    <div className="stack">
      <div className="stack-sm">
        <h3>iPhone, {STOCK} units, sale is live</h3>
        {list.error && <p className="error-text" role="alert">{list.error}</p>}
        {list.loading ? (
          <p className="muted">Loading…</p>
        ) : (
          d && (
            <>
              <progress max={STOCK} value={sold} aria-label={`${sold} of ${STOCK} sold`} style={{ width: '100%' }} />
              <dl className="stats">
                <div><dt className="muted">Stock left</dt><dd>{d.stock}</dd></div>
                <div><dt className="muted">Orders</dt><dd>{d.total}</dd></div>
                <div>
                  <dt className="muted">Oversold</dt>
                  <dd>{d.oversold ? <span className="badge badge-write">{d.oversold} too many</span> : 0}</dd>
                </div>
              </dl>
            </>
          )
        )}
      </div>

      <form
        className="stack-sm"
        onSubmit={(e) => {
          e.preventDefault()
          buy()
        }}
      >
        <div className="row wrap">
          <label className="field" style={{ flex: '0 1 7rem' }}>
            <span>User</span>
            <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="u1..u1000" />
          </label>
          <label className="field" style={{ flex: '0 1 9rem' }}>
            <span>Idempotency key</span>
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="optional" />
          </label>
          <label className="field" style={{ flex: '0 1 7rem' }}>
            <span>Rush buyers</span>
            <input type="number" min={1} max={2000} value={buyers} onChange={(e) => setBuyers(Number(e.target.value))} />
          </label>
        </div>
        <div className="row wrap">
          <button className="btn" type="submit" disabled={!!busy}>{busy === 'buy' ? 'Buying…' : 'Buy'}</button>
          <button className="btn btn-ghost" type="button" disabled={!!busy} onClick={doubleSubmit}>Double-submit (same key)</button>
          <button className="btn btn-ghost" type="button" disabled={!!busy} onClick={rush}>
            {busy === 'rush' ? 'Rushing…' : `Rush ${buyers} buyers`}
          </button>
        </div>
        <p className="muted">Tip: Reset data, then rush. Compare oversold, time and DB queries across levels. Every 3rd rush click is someone clicking twice.</p>
        {error && <p className="error-text" role="alert">{error}</p>}
        {last && <p aria-live="polite">{last}</p>}
      </form>

      <div>
        <h3>Orders (latest 40)</h3>
        {!d?.orders.length ? (
          !list.loading && !list.error && <p className="muted">No orders yet.</p>
        ) : (
          <ul className="list">
            {d.orders.map((o) => (
              <li key={o.id} className="list-row">
                <span><code>{o.id}</code> → {o.userId}</span>
                <span className={`badge ${o.status === 'confirmed' ? 'badge-read' : ''}`}>{o.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
