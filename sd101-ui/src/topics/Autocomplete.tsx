import { useEffect, useRef, useState } from 'react'
import type { PlaygroundProps } from '../labs'
import { errorMessage } from '../lib/api'
import { usePoll } from '../lib/hooks'

type Suggestion = { term: string; score: number }
type Suggested = { q: string; suggestions: Suggestion[]; source: string; degraded?: boolean; ms: number }
type Searched = { term: string; recorded: boolean; visibleIn: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function Autocomplete({ api }: PlaygroundProps) {
  const top = usePoll(() => api.get<Suggested>('/suggest?q=', { silent: true }), 2000, api.base)
  const [q, setQ] = useState('')
  const [debounce, setDebounce] = useState(true)
  const [result, setResult] = useState<Suggested>()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [last, setLast] = useState<Searched>()
  const [counts, setCounts] = useState({ keystrokes: 0, requests: 0, dropped: 0 })
  const latest = useRef(0)

  // One request per (debounced) keystroke; responses that arrive after a newer request are dropped
  useEffect(() => {
    if (!q) return
    const t = setTimeout(async () => {
      const id = ++latest.current
      setCounts((c) => ({ ...c, requests: c.requests + 1 }))
      try {
        const r = await api.get<Suggested>(`/suggest?q=${encodeURIComponent(q)}`)
        if (id !== latest.current) return setCounts((c) => ({ ...c, dropped: c.dropped + 1 }))
        setResult(r)
        setError(undefined)
        setActive(-1)
      } catch (e) {
        if (id === latest.current) setError(errorMessage(e))
      }
    }, debounce ? 150 : 0)
    return () => clearTimeout(t)
  }, [q, debounce, api])

  const type = (v: string) => {
    setQ(v)
    setOpen(true)
    setCounts((c) => ({ ...c, keystrokes: c.keystrokes + 1 }))
    if (!v) setResult(undefined)
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label)
    setError(undefined)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(undefined)
      top.refresh()
    }
  }

  const search = (term: string, times = 1) =>
    run(times > 1 ? `x${term}` : 'search', async () => {
      let r: Searched | undefined
      for (let i = 1; i <= times; i++) r = await api.post<Searched>('/search', { term }, { silent: i < times })
      setLast(r)
      setOpen(false)
    })

  const typeSlowly = (text: string) =>
    run('type', async () => {
      for (let i = 1; i <= text.length; i++) {
        type(text.slice(0, i))
        await sleep(60)
      }
    })

  const list = q && result?.q === q ? result.suggestions : []
  const showList = open && !!q && !!result

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, list.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)) }
    else if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'Enter') {
      e.preventDefault()
      const term = list[active]?.term ?? q.trim()
      if (term) { setQ(term); search(term) }
    }
  }

  return (
    <div className="stack">
      <div className="stack-sm">
        <label className="field" htmlFor="ac-input"><span>Search</span></label>
        <div style={{ position: 'relative' }}>
          <input
            id="ac-input"
            role="combobox"
            aria-expanded={showList}
            aria-controls="ac-list"
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `ac-opt-${active}` : undefined}
            autoComplete="off"
            style={{ width: '100%' }}
            value={q}
            placeholder="Try: ja, re, sys…"
            onChange={(e) => type(e.target.value)}
            onKeyDown={onKey}
            onFocus={() => setOpen(true)}
          />
          {showList && (
            <ul id="ac-list" role="listbox" className="list" style={{ marginTop: 6 }}>
              {list.length === 0 ? (
                <li className="muted list-row">{result.degraded ? 'Suggestions unavailable (degraded). Search still works.' : 'No suggestions'}</li>
              ) : (
                list.map((s, i) => (
                  <li
                    key={s.term}
                    id={`ac-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className="list-row"
                    style={{ cursor: 'pointer', background: i === active ? 'var(--surface-2)' : undefined }}
                    onMouseDown={(e) => { e.preventDefault(); setQ(s.term); search(s.term) }}
                  >
                    <span><strong>{q}</strong>{s.term.slice(q.length)}</span>
                    <span className="muted">{s.score.toLocaleString()}</span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
        {result && q && (
          <p className="muted" aria-live="polite">
            <span className={`badge ${result.degraded ? 'badge-write' : 'badge-read'}`}>{result.source}</span> {result.ms}ms
            {result.degraded && ' · degraded'}
          </p>
        )}
        <label className="toggle">
          <input type="checkbox" checked={debounce} onChange={(e) => setDebounce(e.target.checked)} />
          <span>Client debounce 150ms</span>
        </label>
        <p className="muted">
          Keystrokes {counts.keystrokes} · requests sent {counts.requests} · stale responses dropped {counts.dropped}
        </p>
      </div>

      <div className="row wrap">
        <button className="btn btn-ghost" disabled={!!busy} onClick={() => typeSlowly('system design')}>
          {busy === 'type' ? 'Typing…' : 'Type "system design" key by key'}
        </button>
        <button className="btn btn-ghost" disabled={!!busy} onClick={() => search('rust tutorial', 30)}>
          {busy === 'xrust tutorial' ? 'Searching…' : 'Search "rust tutorial" 30×'}
        </button>
        <button className="btn btn-ghost" disabled={!!busy} onClick={() => search('free crypto scam')}>Search a blocklisted term</button>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {last && (
        <p aria-live="polite">
          Searched <strong>{last.term}</strong>:{' '}
          <span className={`badge ${last.visibleIn === 'now' ? 'badge-read' : 'badge-write'}`}>
            {last.recorded ? `visible in suggestions: ${last.visibleIn}` : last.visibleIn}
          </span>
        </p>
      )}

      <div>
        <h3>Top searches (q = "")</h3>
        {top.error ? (
          <p className="error-text">{top.error}</p>
        ) : top.loading ? (
          <p className="muted">Loading…</p>
        ) : !top.data?.suggestions.length ? (
          <p className="muted">No data.</p>
        ) : (
          <ol className="bullets">
            {top.data.suggestions.map((s) => <li key={s.term}>{s.term} <span className="muted">· {s.score.toLocaleString()}</span></li>)}
          </ol>
        )}
      </div>
    </div>
  )
}
