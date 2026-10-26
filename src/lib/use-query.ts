import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { friendlyError } from './supabase'

export interface QueryState<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  reload: () => void
  setData: (updater: T | ((prev: T | undefined) => T)) => void
}

/**
 * Minimal data-fetching hook: runs `fn` when deps change, ignores stale
 * responses, and exposes reload(). Keeps the dependency footprint small.
 */
export function useQuery<T>(fn: () => Promise<T>, deps: DependencyList): QueryState<T> {
  const [data, setDataState] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const request = useRef(0)

  useEffect(() => {
    const id = ++request.current
    setLoading(true)
    setError(null)
    fn()
      .then((result) => {
        if (id === request.current) setDataState(result)
      })
      .catch((e: unknown) => {
        if (id === request.current) setError(friendlyError(e))
      })
      .finally(() => {
        if (id === request.current) setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  const setData = useCallback((u: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) => (typeof u === 'function' ? (u as (p: T | undefined) => T)(prev) : u))
  }, [])

  return { data, error, loading, reload, setData }
}

/** Throw Supabase errors so callers can use try/catch + friendlyError. */
export function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}
