import { type FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Meta, PlaygroundProps } from '../labs'
import { ApiError, errorMessage, type Api } from '../lib/api'
import { timeAgo } from '../lib/format'
import { usePoll } from '../lib/hooks'
import './ChatApp.css'

type Message = { id: number; convId: string; seq: number; from: string; to: string; text: string; clientMsgId: string; createdAt: number }
type Presence = { user: string; online: boolean; gateway?: string | null }
type Status = 'connecting' | 'connected' | 'polling' | 'reconnecting' | 'offline'
type Counters = { retries: number; duplicates: number; heldBack: number; polls: number; emptyPolls: number }

const GROUP = 'group:team'
const DM = 'dm:alice:bob'
const MAX_RETRIES = 3

export default function ChatApp({ api, meta, resetKey }: PlaygroundProps) {
  const realtime = (meta as Meta & { realtime?: 'poll' | 'sse' }).realtime ?? 'sse'
  const [conv, setConv] = useState(DM)
  const presence = usePoll(() => api.get<{ presence: Presence[] }>('/presence', { silent: true }), 2000, api.base)
  const key = `${api.base}:${resetKey}` // fresh clients after level change or reset

  return (
    <div className="stack">
      <fieldset className="row wrap chat-convs">
        <legend className="muted">Conversation</legend>
        <label className="toggle">
          <input type="radio" name="conv" checked={conv === DM} onChange={() => setConv(DM)} />
          <span>Direct: alice ↔ bob</span>
        </label>
        <label className="toggle">
          <input type="radio" name="conv" checked={conv === GROUP} onChange={() => setConv(GROUP)} />
          <span>Group #team (alice, bob, carol)</span>
        </label>
      </fieldset>
      <p className="muted">
        {realtime === 'poll'
          ? 'This level has no push: each client polls every 2s.'
          : 'Messages are pushed over Server-Sent Events. Untick "Online" to go offline, send messages, then come back to see the sync.'}
      </p>
      {presence.error && <p className="error-text" role="alert">{presence.error}</p>}
      <div className="chat-panes">
        {['alice', 'bob', 'carol'].map((u) => (
          <UserPane
            key={`${key}:${u}`}
            api={api}
            user={u}
            realtime={realtime}
            conv={conv}
            hidden={conv === DM && u === 'carol'}
            presence={presence.data?.presence.find((p) => p.user === u)}
          />
        ))}
      </div>
    </div>
  )
}

type PaneProps = { api: Api; user: string; realtime: 'poll' | 'sse'; conv: string; hidden: boolean; presence?: Presence }

/** One chat client: keeps its own connection, dedup/reorder buffer and counters. Stays mounted while hidden. */
function UserPane({ api, user, realtime, conv, hidden, presence }: PaneProps) {
  const [online, setOnline] = useState(true)
  const [sseStatus, setSseStatus] = useState<Status>('connecting')
  const [gateway, setGateway] = useState<string>()
  const [shown, setShown] = useState<Message[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string>()
  const [counters, setCounters] = useState<Counters>({ retries: 0, duplicates: 0, heldBack: 0, polls: 0, emptyPolls: 0 })
  const bump = (k: keyof Counters, n = 1) => setCounters((c) => ({ ...c, [k]: c[k] + n }))

  // client-side delivery state: last contiguous seq per conversation + hold-back buffer
  const lastSeq = useRef(new Map<string, number>())
  const buffer = useRef(new Map<string, Message>()) // `${convId}:${seq}` -> message
  const maxId = useRef(0)
  const gapTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const sync = useRef<(after: number) => Promise<void>>(async () => {})

  const apply = useCallback((m: Message, viaPush: boolean) => {
    const last = lastSeq.current.get(m.convId) ?? 0
    const k = `${m.convId}:${m.seq}`
    if (m.seq <= last || buffer.current.has(k)) {
      if (viaPush) bump('duplicates') // only pushes count: a poll/sync overlap is expected
      return
    }
    buffer.current.set(k, m)
    if (m.seq > last + 1) {
      bump('heldBack') // a gap: hold until the missing seq arrives
      clearTimeout(gapTimer.current)
      gapTimer.current = setTimeout(() => buffer.current.size && sync.current(0), 2000) // still missing -> full resync
      return
    }
    const ready: Message[] = []
    let s = last
    while (buffer.current.has(`${m.convId}:${s + 1}`)) {
      s++
      ready.push(buffer.current.get(`${m.convId}:${s}`)!)
      buffer.current.delete(`${m.convId}:${s}`)
    }
    lastSeq.current.set(m.convId, s)
    for (const r of ready) maxId.current = Math.max(maxId.current, r.id)
    setShown((prev) => [...prev, ...ready])
  }, [])

  useLayoutEffect(() => {
    sync.current = async (after: number) => {
      const { messages } = await api.get<{ messages: Message[] }>(`/messages?user=${user}&after=${after}`, { silent: realtime === 'poll' })
      messages.forEach((m) => apply(m, false))
      if (realtime === 'poll') {
        bump('polls')
        if (!messages.length) bump('emptyPolls')
      }
    }
  })

  // initial history
  useEffect(() => {
    sync.current(0).then(
      () => setLoaded(true),
      (e) => { setError(errorMessage(e)); setLoaded(true) },
    )
    return () => clearTimeout(gapTimer.current)
  }, [])

  // receive: poll or SSE, only while online
  useEffect(() => {
    if (!online) return
    if (realtime === 'poll') {
      const t = setInterval(() => sync.current(maxId.current).catch((e) => setError(errorMessage(e))), 2000)
      return () => clearInterval(t)
    }
    const es = new EventSource(`${api.base}/stream?user=${user}`)
    es.addEventListener('hello', (e) => {
      setGateway(JSON.parse((e as MessageEvent).data).gateway)
      setSseStatus('connected')
      setError(undefined)
      sync.current(maxId.current).catch((err) => setError(errorMessage(err))) // catch up on what was missed
    })
    es.addEventListener('message', (e) => apply(JSON.parse((e as MessageEvent).data), true))
    es.onerror = () => setSseStatus('reconnecting') // EventSource retries by itself
    return () => es.close()
  }, [online, realtime, api, user, apply])

  // presence heartbeat (only the senior backend uses it; others ignore it)
  useEffect(() => {
    if (!online) return
    const beat = () => api.post('/heartbeat', { user }, { silent: true }).catch(() => {})
    beat()
    const t = setInterval(beat, 2000)
    return () => clearInterval(t)
  }, [online, api, user])

  async function send(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setSending(true)
    setError(undefined)
    const body = { from: user, to: conv === GROUP ? GROUP : user === 'alice' ? 'bob' : 'alice', text, clientMsgId: crypto.randomUUID() }
    for (let attempt = 0; ; attempt++) {
      try {
        const { message } = await api.post<{ message: Message }>('/send', body)
        apply(message, false)
        setDraft('')
        break
      } catch (err) {
        const retryable = err instanceof ApiError && (err.status === 504 || err.status === 0)
        if (retryable && attempt < MAX_RETRIES) {
          bump('retries') // same clientMsgId: the server dedups
          continue
        }
        setError(`${errorMessage(err)}${retryable ? ' (gave up after 3 retries; it may still be stored)' : ''}`)
        sync.current(maxId.current).catch(() => {})
        break
      }
    }
    setSending(false)
  }

  const logRef = useRef<HTMLOListElement>(null)
  const visible = shown.filter((m) => m.convId === conv)
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [visible.length])

  const status: Status = !online ? 'offline' : realtime === 'poll' ? 'polling' : sseStatus
  const statusClass = status === 'connected' ? 'badge-read' : status === 'offline' ? 'chat-badge-off' : 'badge-write'
  return (
    <section className="card stack-sm chat-pane" hidden={hidden} aria-label={`${user}'s client`}>
      <div className="row wrap between">
        <h3>
          {user} <span className={`chat-dot${presence?.online ? ' chat-dot-on' : ''}`} title={presence?.online ? 'online' : 'offline'} aria-label={presence?.online ? 'online' : 'offline'} />
        </h3>
        <span className={`badge ${statusClass}`} role="status">{status}{gateway && status === 'connected' ? ` @ ${gateway}` : ''}</span>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={online} onChange={(e) => { setOnline(e.target.checked); setSseStatus('connecting') }} />
        <span>Online</span>
      </label>
      {!loaded ? (
        <p className="muted">Loading history…</p>
      ) : visible.length === 0 ? (
        <p className="muted chat-log">No messages yet.</p>
      ) : (
        <ol className="list chat-log" ref={logRef} aria-live="polite" aria-label={`${user}'s messages`}>
          {visible.map((m) => (
            <li key={m.id} className={`post chat-msg${m.from === user ? ' chat-mine' : ''}`}>
              <div className="row between">
                <strong>{m.from === user ? 'you' : m.from}</strong>
                <span className="muted">seq {m.seq} · {timeAgo(m.createdAt)}</span>
              </div>
              <p>{m.text}</p>
            </li>
          ))}
        </ol>
      )}
      <form className="stack-sm" onSubmit={send}>
        <label className="field">
          <span>Message as {user}</span>
          <input value={draft} maxLength={500} onChange={(e) => setDraft(e.target.value)} placeholder={conv === GROUP ? 'Message #team' : `Message ${user === 'alice' ? 'bob' : 'alice'}`} />
        </label>
        <button className="btn" type="submit" disabled={sending || !draft.trim()}>{sending ? 'Sending…' : 'Send'}</button>
        {error && <p className="error-text" role="alert">{error}</p>}
      </form>
      <dl className="stats">
        <div><dt>send retries</dt><dd>{counters.retries}</dd></div>
        <div><dt>duplicates dropped</dt><dd>{counters.duplicates}</dd></div>
        <div><dt>held back (gap)</dt><dd>{counters.heldBack}</dd></div>
        {realtime === 'poll' && <div><dt>empty polls</dt><dd>{counters.emptyPolls}/{counters.polls}</dd></div>}
      </dl>
    </section>
  )
}
