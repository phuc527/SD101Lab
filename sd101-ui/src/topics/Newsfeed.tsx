import { useCallback, useEffect, useState } from 'react'
import type { PlaygroundProps } from '../labs'
import { errorMessage } from '../lib/api'
import { timeAgo } from '../lib/format'
import { usePoll } from '../lib/hooks'

type User = { id: string; followers: number; following: number; celebrity: boolean }
type Post = { id: number; authorId: string; content: string; createdAt: number; score?: number }
type FeedPage = { items: Post[]; nextCursor: number | null; ms: number }

export default function Newsfeed({ api }: PlaygroundProps) {
  const users = usePoll(() => api.get<{ users: User[] }>('/users', { silent: true }), 3000, api.base)
  const [me, setMe] = useState('alice')
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string>()

  const [feed, setFeed] = useState<Post[]>()
  const [cursor, setCursor] = useState<number | null>(null)
  const [feedMs, setFeedMs] = useState<number>()
  const [feedError, setFeedError] = useState<string>()
  const [loadingFeed, setLoadingFeed] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const loadFeed = useCallback(
    async (more = false) => {
      setLoadingFeed(true)
      try {
        const q = new URLSearchParams({ userId: me, limit: '5' })
        if (more && cursor !== null) q.set('cursor', String(cursor))
        const page = await api.get<FeedPage>(`/feed?${q}`)
        setFeed((prev) => (more && prev ? [...prev, ...page.items] : page.items))
        setCursor(page.nextCursor)
        setFeedMs(page.ms)
        setFeedError(undefined)
      } catch (e) {
        setFeedError(errorMessage(e))
      } finally {
        setLoadingFeed(false)
      }
    },
    [api, me, cursor],
  )

  // reload the first page whenever the viewer changes
  useEffect(() => {
    setFeed(undefined)
    setCursor(null)
    loadFeed(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the viewer changes
  }, [me])

  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(() => loadFeed(false), 2000)
    return () => clearInterval(t)
  }, [autoRefresh, loadFeed])

  async function publish(author: string, content: string) {
    setPosting(true)
    setPostError(undefined)
    try {
      await api.post('/posts', { userId: author, content })
      if (author === me) setDraft('')
      users.refresh()
      await loadFeed(false)
    } catch (e) {
      setPostError(errorMessage(e))
    } finally {
      setPosting(false)
    }
  }

  async function follow(followeeId: string) {
    try {
      await api.post('/follow', { userId: me, followeeId })
      users.refresh()
      await loadFeed(false)
    } catch (e) {
      setPostError(errorMessage(e))
    }
  }

  const meUser = users.data?.users.find((u) => u.id === me)

  return (
    <div className="stack">
      <div className="row wrap">
        <label className="field">
          <span>Viewing as</span>
          <select value={me} onChange={(e) => setMe(e.target.value)}>
            {(users.data?.users ?? [{ id: me } as User]).map((u) => <option key={u.id} value={u.id}>{u.id}</option>)}
          </select>
        </label>
        {meUser && <span className="muted">{meUser.followers.toLocaleString()} followers · following {meUser.following}</span>}
      </div>

      <form
        className="stack-sm"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) publish(me, draft)
        }}
      >
        <label className="field">
          <span>New post as {me}</span>
          <textarea rows={2} maxLength={280} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What's happening?" />
        </label>
        <div className="row wrap">
          <button className="btn" type="submit" disabled={posting || !draft.trim()}>{posting ? 'Posting…' : 'Post'}</button>
          <button className="btn btn-ghost" type="button" disabled={posting} onClick={() => publish('taylor', `Taylor update #${Date.now() % 1000}`)}>
            Post as taylor (celebrity, 20k followers)
          </button>
          <button className="btn btn-ghost" type="button" disabled={posting} onClick={() => publish('bob', `Bob says hi #${Date.now() % 1000}`)}>
            Post as bob
          </button>
        </div>
        {postError && <p className="error-text" role="alert">{postError}</p>}
      </form>

      <div>
        <h3>People</h3>
        {users.error && <p className="error-text">{users.error}</p>}
        <ul className="list">
          {users.data?.users.filter((u) => u.id !== me).map((u) => (
            <li key={u.id} className="list-row">
              <span>
                <strong>{u.id}</strong> {u.celebrity && <span className="badge badge-write">celebrity</span>}
                <span className="muted"> · {u.followers.toLocaleString()} followers</span>
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => follow(u.id)}>Follow</button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="row wrap between">
          <h3>{me}'s feed {feedMs !== undefined && <span className="muted">· last load {feedMs} ms</span>}</h3>
          <div className="row">
            <label className="toggle">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              <span>Auto refresh</span>
            </label>
            <button className="btn btn-ghost btn-sm" onClick={() => loadFeed(false)} disabled={loadingFeed}>Refresh</button>
          </div>
        </div>
        {feedError && <p className="error-text" role="alert">{feedError}</p>}
        {!feed ? (
          <p className="muted">Loading feed…</p>
        ) : feed.length === 0 ? (
          <p className="muted">Empty feed. Follow someone or post something.</p>
        ) : (
          <ul className="list">
            {feed.map((p) => (
              <li key={p.id} className="post">
                <div className="row between">
                  <strong>{p.authorId}</strong>
                  <span className="muted">
                    #{p.id} · {timeAgo(p.createdAt)}
                    {p.score !== undefined && ` · score ${p.score}`}
                  </span>
                </div>
                <p>{p.content}</p>
              </li>
            ))}
          </ul>
        )}
        {cursor !== null && feed && (
          <button className="btn btn-ghost" onClick={() => loadFeed(true)} disabled={loadingFeed}>Load more</button>
        )}
      </div>
    </div>
  )
}
