import { useState } from 'react'
import type { PlaygroundProps } from '../labs'
import { errorMessage } from '../lib/api'
import { timeAgo } from '../lib/format'
import { usePoll } from '../lib/hooks'

type Link = { code: string; url: string; clicks: number; createdAt: number; expiresAt?: number }
type Shortened = { code: string; shortUrl: string; existed: boolean }
type Resolved = { redirect: number; location?: string; browserCache?: boolean }

const LONG_URL = 'https://example.com/articles/2024/system-design/how-to-build-a-url-shortener?utm_source=newsletter&utm_campaign=sd101'
const randomUrl = () => `https://example.com/page/${Math.random().toString(36).slice(2, 10)}`

const redirectLabel = (r: Resolved) =>
  r.redirect === 404 ? '404 Not Found' : r.redirect === 410 ? '410 Gone' : `${r.redirect} → ${r.location}${r.browserCache ? ' (browser cache)' : ''}`

export default function UrlShortener({ api }: PlaygroundProps) {
  // fetchedAt: render-time clock for expiry labels (keeps render pure)
  const links = usePoll(async () => ({ ...(await api.get<{ links: Link[] }>('/links', { silent: true })), fetchedAt: Date.now() }), 2000, api.base)
  const [url, setUrl] = useState('')
  const [ttl, setTtl] = useState('')
  const [busy, setBusy] = useState<string>() // label of the running action, disables buttons
  const [error, setError] = useState<string>()
  const [last, setLast] = useState<Shortened>()
  const [clicked, setClicked] = useState<Record<string, Resolved>>({})

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label)
    setError(undefined)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(undefined)
      links.refresh()
    }
  }

  const shorten = (target: string, ttlSeconds?: number) =>
    run('shorten', async () => {
      setLast(await api.post<Shortened>('/shorten', { url: target, ttlSeconds }))
    })

  // n resolves in a row; only the last one goes to the trace panel to keep it readable
  const click = (code: string, times = 1) =>
    run(times > 1 ? 'hot' : `click-${code}`, async () => {
      let r: Resolved | undefined
      for (let i = 1; i <= times; i++) r = await api.get<Resolved>(`/resolve/${encodeURIComponent(code)}`, { silent: i < times })
      if (r) setClicked((prev) => ({ ...prev, [code]: r }))
    })

  const bulk = () =>
    run('bulk', async () => {
      for (let i = 1; i <= 20; i++) await api.post('/shorten', { url: randomUrl() }, { silent: i < 20 })
    })

  const list = links.data?.links
  const now = links.data?.fetchedAt ?? 0
  const hot = list?.at(-1) // oldest link plays the "viral" one

  return (
    <div className="stack">
      <form
        className="stack-sm"
        onSubmit={(e) => {
          e.preventDefault()
          if (url.trim()) shorten(url.trim(), ttl ? Number(ttl) : undefined)
        }}
      >
        <div className="row wrap">
          <label className="field" style={{ flex: '1 1 16rem' }}>
            <span>Long URL</span>
            <input type="text" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </label>
          <label className="field" style={{ flex: '0 1 8rem' }}>
            <span>TTL seconds (optional)</span>
            <input type="number" min={1} max={86400} value={ttl} onChange={(e) => setTtl(e.target.value)} />
          </label>
        </div>
        <div className="row wrap">
          <button className="btn" type="submit" disabled={!!busy || !url.trim()}>{busy === 'shorten' ? 'Shortening…' : 'Shorten'}</button>
          <button className="btn btn-ghost" type="button" disabled={!!busy} onClick={() => { setUrl(LONG_URL); shorten(LONG_URL) }}>Long URL</button>
          <button className="btn btn-ghost" type="button" disabled={!!busy} onClick={() => shorten(LONG_URL)}>Same URL again</button>
          <button className="btn btn-ghost" type="button" disabled={!!busy} onClick={() => shorten('javascript:alert(1)')}>javascript:alert(1)</button>
          <button className="btn btn-ghost" type="button" disabled={!!busy} onClick={() => shorten(randomUrl(), 5)}>Link expiring in 5s</button>
          <button className="btn btn-ghost" type="button" disabled={!!busy} onClick={bulk}>{busy === 'bulk' ? 'Shortening 20…' : 'Shorten 20 random URLs'}</button>
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
        {last && (
          <p aria-live="polite">
            <strong>{last.shortUrl}</strong>{' '}
            <span className={`badge ${last.existed ? 'badge-read' : 'badge-write'}`}>{last.existed ? 'existing code' : 'new code'}</span>
          </p>
        )}
      </form>

      <div>
        <div className="row wrap between">
          <h3>Links</h3>
          <button className="btn btn-ghost btn-sm" disabled={!!busy || !hot} onClick={() => hot && click(hot.code, 50)}>
            {busy === 'hot' ? 'Clicking…' : `Click hot link 50×${hot ? ` (${hot.code})` : ''}`}
          </button>
        </div>
        {links.error && <p className="error-text" role="alert">{links.error}</p>}
        {links.loading ? (
          <p className="muted">Loading links…</p>
        ) : !list?.length ? (
          !links.error && <p className="muted">No links yet. Shorten a URL above.</p>
        ) : (
          <ul className="list">
            {list.map((l) => (
              <li key={l.code} className="list-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div>
                    <code>{l.code}</code> <span className="muted">· {l.clicks} clicks · {timeAgo(l.createdAt, now)}</span>
                    {l.expiresAt !== undefined && (
                      <span className="muted"> · {l.expiresAt < now ? 'expired' : `expires in ${Math.ceil((l.expiresAt - now) / 1000)}s`}</span>
                    )}
                  </div>
                  <div className="muted" style={{ overflowWrap: 'anywhere' }}>{l.url}</div>
                  {clicked[l.code] && (
                    <div style={{ overflowWrap: 'anywhere' }}>
                      <span className={`badge ${clicked[l.code].redirect < 400 ? 'badge-read' : 'badge-write'}`}>{redirectLabel(clicked[l.code])}</span>
                    </div>
                  )}
                </div>
                <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => click(l.code)} aria-label={`Click short link ${l.code}`}>
                  {busy === `click-${l.code}` ? '…' : 'Click'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
