import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { errorMessage } from './api'

type State<T> = { key: string; data?: T; error?: string }

/** Runs `fn` now and every `ms` (pass ms = 0 to run once). Starts over when `key` changes. */
export function usePoll<T>(fn: () => Promise<T>, ms: number, key: string) {
  const [state, setState] = useState<State<T>>({ key })
  const fnRef = useRef(fn)
  useLayoutEffect(() => {
    fnRef.current = fn
  })

  const refresh = useCallback(async () => {
    try {
      const data = await fnRef.current()
      setState({ key, data })
    } catch (e) {
      setState({ key, error: errorMessage(e) })
    }
  }, [key])

  useEffect(() => {
    refresh()
    if (!ms) return
    const t = setInterval(refresh, ms)
    return () => clearInterval(t)
  }, [ms, refresh])

  // data from a previous key is never shown
  const current = state.key === key ? state : { key }
  return { data: current.data, error: current.error, refresh, loading: current.data === undefined && current.error === undefined }
}
