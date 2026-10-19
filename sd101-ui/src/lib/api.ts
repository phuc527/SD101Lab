// Fetch wrapper bound to one lab backend (/api/<topic>/<level>).
// Every non-silent call is recorded in traceStore so the UI can show what the backend did.
export type TraceEntry = {
  id: number
  base: string
  method: string
  path: string
  status: number
  ms: number
  trace: string[]
  error?: string
}

type Listener = () => void
let entries: TraceEntry[] = []
let seq = 0
const listeners = new Set<Listener>()
const emit = () => listeners.forEach((l) => l())

export const traceStore = {
  subscribe(l: Listener) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
  get: () => entries,
  push(e: Omit<TraceEntry, 'id'>) {
    entries = [{ ...e, id: ++seq }, ...entries].slice(0, 60)
    emit()
  },
  clear() {
    entries = []
    emit()
  },
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Opts = { silent?: boolean }
export type Api = {
  base: string
  get<T>(path: string, opts?: Opts): Promise<T>
  post<T>(path: string, body?: unknown, opts?: Opts): Promise<T>
}

export function createApi(base: string): Api {
  async function call<T>(method: string, path: string, body: unknown, silent = false): Promise<T> {
    const t0 = performance.now()
    let res: Response
    try {
      res = await fetch(base + path, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      const msg = 'Backend unreachable. Is `npm run dev` running?'
      if (!silent) traceStore.push({ base, method, path, status: 0, ms: 0, trace: [], error: msg })
      throw new ApiError(0, msg)
    }
    const data = await res.json().catch(() => ({}))
    if (!silent) {
      traceStore.push({
        base,
        method,
        path,
        status: res.status,
        ms: data.ms ?? Math.round(performance.now() - t0),
        trace: data.trace ?? [],
        error: data.error,
      })
    }
    if (!res.ok) throw new ApiError(res.status, data.error ?? (res.status === 502 || res.status === 504 ? 'Backend unreachable. Is `npm run dev` running?' : res.statusText))
    return data as T
  }
  return {
    base,
    get<T>(path: string, opts?: Opts) {
      return call<T>('GET', path, undefined, opts?.silent)
    },
    post<T>(path: string, body?: unknown, opts?: Opts) {
      return call<T>('POST', path, body ?? {}, opts?.silent)
    },
  }
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))
