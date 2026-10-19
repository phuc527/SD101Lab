import { useState } from 'react'
import type { PlaygroundProps } from '../labs'
import { ApiError, errorMessage } from '../lib/api'
import './RateLimiter.css'

// Matches rate-limiter/shared.js: windows are aligned to the epoch, so the client can aim at a boundary.
const WINDOW_MS = 5000
const MAX_CELLS = 60

type HitOk = { allowed: true; limit: number; remaining: number; retryAfterMs: number; node?: number }
type Cell = { id: number; status: number; node?: number }
type Last = { status: number; text: string }

let seq = 0
const wait = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)))

export default function RateLimiter({ api, resetKey }: PlaygroundProps) {
  const [key, setKey] = useState('alice')
  const [endpoint, setEndpoint] = useState<'feed' | 'login'>('feed')
  // History belongs to one backend + reset; a new scope starts empty (no effect needed)
  const scope = `${api.base}|${resetKey}`
  const [log, setLog] = useState<{ scope: string; cells: Cell[]; last?: Last }>({ scope, cells: [] })
  const { cells, last } = log.scope === scope ? log : { cells: [] as Cell[], last: undefined }
  const setLast = (l: Last) => setLog((p) => ({ scope, cells: p.scope === scope ? p.cells : [], last: l }))
  const setCells = (fn: (prev: Cell[]) => Cell[]) =>
    setLog((p) => ({ scope, last: p.scope === scope ? p.last : undefined, cells: fn(p.scope === scope ? p.cells : []) }))
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()

  // One request; 429/503 come back as ApiError whose message carries retryAfter / reason.
  async function hit(silent: boolean): Promise<Cell> {
    const cell: Cell = { id: ++seq, status: 200 }
    try {
      const r = await api.post<HitOk>('/hit', { key: key.trim(), endpoint }, { silent })
      cell.node = r.node
      setLast({ status: 200, text: `200 allowed · remaining ${r.remaining}/${r.limit}${r.node ? ` · node-${r.node}` : ''}` })
    } catch (e) {
      if (!(e instanceof ApiError) || e.status === 0 || e.status === 400) throw e
      cell.status = e.status
      setLast({ status: e.status, text: e.message })
    }
    return cell
  }

  async function run(label: string, fn: () => Promise<Cell[]>) {
    if (!key.trim()) return setError('Enter a key first')
    setBusy(label)
    setError(undefined)
    try {
      const added = await fn()
      setCells((prev) => [...prev, ...added].slice(-MAX_CELLS))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(undefined)
    }
  }

  // Concurrent burst: only the last call goes to the trace panel so it isn't flooded.
  const burst = (n: number) => Promise.all(Array.from({ length: n }, (_, i) => hit(i < n - 1)))

  const straddle = () =>
    run('Waiting for window edge…', async () => {
      await wait(WINDOW_MS - (Date.now() % WINDOW_MS) - 300) // ~300 ms before the window ends
      const before = await burst(10)
      await wait(WINDOW_MS - (Date.now() % WINDOW_MS) + 50) // just after the new window starts
      return [...before, ...(await burst(10))]
    })

  const allowed = cells.filter((c) => c.status === 200).length
  const rejected = cells.filter((c) => c.status === 429).length
  const other = cells.length - allowed - rejected

  return (
    <div className="stack">
      <div className="row wrap">
        <label className="field">
          <span>Key (user / API key)</span>
          <input value={key} maxLength={64} onChange={(e) => setKey(e.target.value)} />
        </label>
        <label className="field">
          <span>Endpoint</span>
          <select value={endpoint} onChange={(e) => setEndpoint(e.target.value as 'feed' | 'login')}>
            <option value="feed">feed</option>
            <option value="login">login</option>
          </select>
        </label>
      </div>

      <div className="row wrap">
        <button className="btn" disabled={!!busy} onClick={() => run('Sending…', async () => [await hit(false)])}>Send 1</button>
        <button className="btn btn-ghost" disabled={!!busy} onClick={() => run('Bursting…', () => burst(20))}>Burst 20 (concurrent)</button>
        <button className="btn btn-ghost" disabled={!!busy} onClick={straddle}>Burst 20 straddling a window boundary</button>
      </div>
      <p className="muted" aria-live="polite">{busy ?? `Limit: 10 requests / ${WINDOW_MS / 1000}s per key (the backend decides how).`}</p>
      {error && <p className="error-text" role="alert">{error}</p>}

      <div className="stack-sm">
        <div className="row wrap between">
          <h3>Last {MAX_CELLS} requests</h3>
          <button className="btn btn-ghost btn-sm" disabled={!cells.length} onClick={() => setCells(() => [])}>Clear</button>
        </div>
        {last && <p className={last.status === 200 ? '' : 'error-text'}>Latest: {last.text}</p>}
        {cells.length === 0 ? (
          <p className="muted">No requests yet. Send one or fire a burst.</p>
        ) : (
          <>
            <p aria-live="polite">
              <span className="badge badge-read">✓ {allowed} allowed</span> <span className="badge badge-write">✕ {rejected} rejected (429)</span>
              {other > 0 && <span className="badge"> ! {other} other errors</span>}
            </p>
            <ol className="rl-timeline" aria-label={`Timeline: ${allowed} allowed, ${rejected} rejected, ${other} other`}>
              {cells.map((c) => (
                <li
                  key={c.id}
                  className={`rl-cell ${c.status === 200 ? 'rl-ok' : c.status === 429 ? 'rl-bad' : 'rl-err'}`}
                  title={`#${c.id}: ${c.status}${c.node ? ` via node-${c.node}` : ''}`}
                >
                  {c.status === 200 ? '✓' : c.status === 429 ? '✕' : '!'}
                </li>
              ))}
            </ol>
            <p className="muted">Legend: ✓ allowed (200) · ✕ rate limited (429) · ! other error (e.g. 503 fail-closed). Oldest first.</p>
          </>
        )}
      </div>
    </div>
  )
}
