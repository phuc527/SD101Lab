import { Suspense, useEffect, useMemo, useState } from 'react'
import { BackendPanel } from './components/BackendPanel'
import { TraceLog } from './components/TraceLog'
import { LEVELS, TOPICS, type Level, type Meta, type TopicId } from './labs'
import { createApi } from './lib/api'
import { usePoll } from './lib/hooks'
import { PLAYGROUNDS } from './topics'

// Route lives in the URL hash so a lab can be bookmarked: #/newsfeed/junior
function readRoute(): { topic: TopicId; level: Level } {
  const [, t, l] = location.hash.split('/')
  const topic = TOPICS.find((x) => x.id === t)?.id ?? 'newsfeed'
  const level = (LEVELS as readonly string[]).includes(l) ? (l as Level) : 'fresher'
  return { topic, level }
}

export default function App() {
  const [route, setRoute] = useState(readRoute)
  const [resetKey, setResetKey] = useState(0)
  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  const go = (topic: TopicId, level: Level) => {
    window.location.assign(`#/${topic}/${level}`)
  }

  const { topic, level } = route
  const info = TOPICS.find((t) => t.id === topic)!
  const api = useMemo(() => createApi(`/api/${topic}/${level}`), [topic, level])
  const meta = usePoll(() => api.get<Meta>('/meta', { silent: true }), 0, api.base)
  const Playground = PLAYGROUNDS[topic]

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <strong>SD101 Labs</strong>
          <span className="muted">System design, 4 levels</span>
        </div>
        <nav aria-label="Topics">
          <ul className="topic-list">
            {TOPICS.map((t) => (
              <li key={t.id}>
                <button className="topic" aria-current={t.id === topic ? 'page' : undefined} onClick={() => go(t.id, level)}>
                  <span className="topic-label">{t.label}</span>
                  <span className={`badge ${t.profile.startsWith('Read') ? 'badge-read' : 'badge-write'}`}>{t.profile}</span>
                  <span className="topic-summary">{t.summary}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{info.label}</h1>
            <p className="muted">Same UI and API for every level. Only the backend architecture changes.</p>
          </div>
          <div className="tabs" role="tablist" aria-label="Level">
            {LEVELS.map((l) => (
              <button key={l} role="tab" aria-selected={l === level} className="tab" onClick={() => go(topic, l)}>
                {l[0].toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        </header>

        {meta.error ? (
          <div className="card notice" role="alert">
            <h2>Cannot reach the {topic}/{level} backend</h2>
            <p>{meta.error}</p>
            <p className="muted">Start everything from <code>sd101-ui</code> with <code>npm run dev</code>. That also starts all lab APIs from <code>SD101/start-apis.js</code>.</p>
            <button className="btn" onClick={meta.refresh}>Retry</button>
          </div>
        ) : !meta.data ? (
          <p className="muted pad">Loading lab…</p>
        ) : (
          <div className="workspace">
            <section className="card playground" aria-labelledby="pg-title">
              <h2 id="pg-title">Playground</h2>
              <Suspense fallback={<p className="muted">Loading playground…</p>}>
                <Playground key={`${api.base}:${resetKey}`} api={api} level={level} meta={meta.data} resetKey={resetKey} />
              </Suspense>
            </section>
            <div className="side">
              <BackendPanel api={api} meta={meta.data} onReset={() => setResetKey((k) => k + 1)} />
              <TraceLog base={api.base} />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
