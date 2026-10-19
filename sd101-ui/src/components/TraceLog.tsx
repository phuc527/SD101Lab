import { useSyncExternalStore } from 'react'
import { traceStore } from '../lib/api'

/** Every request the playground made to the current level, with the backend's own trace. */
export function TraceLog({ base }: { base: string }) {
  const all = useSyncExternalStore(traceStore.subscribe, traceStore.get)
  const entries = all.filter((e) => e.base === base)

  return (
    <section className="card" aria-labelledby="trace-title">
      <div className="card-head">
        <h2 id="trace-title">Request trace</h2>
        <button className="btn btn-ghost" onClick={traceStore.clear} disabled={!entries.length}>Clear</button>
      </div>
      {!entries.length ? (
        <p className="muted">No requests yet. Use the playground and each request shows up here with what the backend did.</p>
      ) : (
        <ol className="trace" aria-live="polite">
          {entries.map((e) => (
            <li key={e.id}>
              <div className="trace-line">
                <span className="method">{e.method}</span>
                <code className="path">{e.path}</code>
                <span className={`status ${e.status >= 400 || e.status === 0 ? 'status-bad' : 'status-ok'}`}>{e.status || 'ERR'}</span>
                <span className="ms">{e.ms} ms</span>
              </div>
              {e.error && <p className="error-text">{e.error}</p>}
              {e.trace.length > 0 && <ul className="trace-steps">{e.trace.map((t, i) => <li key={i}>{t}</li>)}</ul>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
