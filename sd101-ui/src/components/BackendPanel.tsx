import { useState } from 'react'
import { errorMessage, type Api } from '../lib/api'
import { usePoll } from '../lib/hooks'
import type { Control, Meta } from '../labs'

type Props = { api: Api; meta: Meta; onReset: () => void }

/** Right column: what this level's backend looks like, its knobs, and live counters. */
export function BackendPanel({ api, meta, onReset }: Props) {
  const stats = usePoll(() => api.get<{ stats: Record<string, unknown> }>('/stats', { silent: true }), 1000, api.base)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string>()

  async function reset() {
    setResetting(true)
    setResetError(undefined)
    try {
      await api.post('/reset')
      onReset()
    } catch (e) {
      setResetError(errorMessage(e))
    } finally {
      setResetting(false)
    }
  }

  return (
    <section className="card" aria-labelledby="backend-title">
      <div className="card-head">
        <h2 id="backend-title">Backend: {meta.title}</h2>
        <button className="btn btn-ghost" onClick={reset} disabled={resetting}>
          {resetting ? 'Resetting…' : 'Reset data'}
        </button>
      </div>
      {resetError && <p className="error-text">{resetError}</p>}

      <pre className="arch" aria-label="Architecture diagram">{meta.architecture}</pre>

      <div className="two-col">
        <div>
          <h3>Key ideas</h3>
          <ul className="bullets">{meta.ideas.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
        <div>
          <h3>Trade-offs</h3>
          <ul className="bullets">{meta.tradeoffs.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      </div>

      {meta.controls.length > 0 && (
        <>
          <h3>Controls</h3>
          <div className="controls">{meta.controls.map((c) => <ControlInput key={`${api.base}:${c.id}`} api={api} control={c} />)}</div>
        </>
      )}

      <h3>Live stats</h3>
      {stats.error ? (
        <p className="error-text">{stats.error}</p>
      ) : !stats.data ? (
        <p className="muted">Loading…</p>
      ) : (
        <dl className="stats">
          {Object.entries(stats.data.stats).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{typeof v === 'number' ? v.toLocaleString() : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

function ControlInput({ api, control }: { api: Api; control: Control }) {
  const [value, setValue] = useState(control.value)
  const [error, setError] = useState<string>()

  async function update(v: Control['value']) {
    const prev = value
    setValue(v)
    try {
      await api.post('/control', { id: control.id, value: v })
      setError(undefined)
    } catch (e) {
      setValue(prev)
      setError(errorMessage(e))
    }
  }

  const id = `ctl-${control.id}`
  return (
    <div className="control">
      {control.type === 'toggle' ? (
        <label className="toggle" htmlFor={id}>
          <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => update(e.target.checked)} />
          <span>{control.label}</span>
        </label>
      ) : control.type === 'select' ? (
        <label htmlFor={id}>
          <span>{control.label}</span>
          <select id={id} value={String(value)} onChange={(e) => update(e.target.value)}>
            {control.options?.map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
      ) : (
        <label htmlFor={id}>
          <span>{control.label}: <strong>{String(value)}</strong></span>
          <input id={id} type="range" min={control.min ?? 0} max={control.max ?? 100} step={control.step ?? 1} value={Number(value)} onChange={(e) => update(Number(e.target.value))} />
        </label>
      )}
      {error && <span className="error-text">{error}</span>}
    </div>
  )
}
