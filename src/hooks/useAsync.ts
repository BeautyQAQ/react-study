import { useCallback, useEffect, useRef, useState, type DependencyList, type SetStateAction } from 'react'
import type { Page } from '@/types'
import { errorMessage, type ApiResult } from '@/utils/request'
import { useNotice } from '@/state/Notice'

export function useResource<T>(loader: () => Promise<ApiResult<T>>, dependencies: DependencyList, enabled = true) {
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const revision = useRef(0), mounted = useRef(true)
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: string }>({ data: undefined, loading: enabled, error: '' })
  const reload = useCallback(async () => {
    if (!mounted.current) return
    const ticket = ++revision.current
    setState(previous => ({ ...previous, loading: true, error: '' }))
    try {
      const { data } = await loaderRef.current()
      if (mounted.current && ticket === revision.current) setState({ data, loading: false, error: '' })
      return data
    } catch (error) {
      if (mounted.current && ticket === revision.current) setState(previous => ({ ...previous, loading: false, error: errorMessage(error) }))
    }
  }, [])
  const setData = useCallback((update: SetStateAction<T | undefined>) => {
    if (mounted.current) setState(previous => ({ ...previous, data: typeof update === 'function'
      ? (update as (value: T | undefined) => T | undefined)(previous.data) : update }))
  }, [])
  useEffect(() => {
    mounted.current = true
    if (enabled) void reload()
    else { revision.current++; setState({ data: undefined, loading: false, error: '' }) }
    return () => { mounted.current = false; revision.current++ }
  }, [...dependencies, enabled, reload])
  return { ...state, reload, setData }
}

export function usePage<T>(loader: (page: number, size: number) => Promise<ApiResult<Page<T>>>, dependencies: DependencyList = [], initialSize = 10) {
  const [current, setCurrent] = useState(1), [size, setSize] = useState(initialSize)
  const resource = useResource(() => loader(current, size), [...dependencies, current, size])
  const total = resource.data?.totalElements || 0
  const records = resource.data?.content || []
  useEffect(() => {
    if (resource.data && !resource.loading && !resource.error && current > 1 && !resource.data.content.length) {
      setCurrent(Math.max(1, Math.ceil(resource.data.totalElements / size)))
    }
  }, [resource.data, resource.loading, resource.error, current, size])
  return {
    ...resource, records, total, current, size, setCurrent,
    setSize: (value: number) => { setCurrent(1); setSize(value) },
    reset: () => { if (current === 1) void resource.reload(); else setCurrent(1) },
  }
}

export function useAction() {
  const notify = useNotice(), lock = useRef(false), mounted = useRef(true)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const run = useCallback(async <T,>(operation: () => Promise<T>, success?: string): Promise<T | undefined> => {
    if (lock.current) return
    lock.current = true
    setBusy(true); setError('')
    try {
      const result = await operation()
      if (success) notify(success)
      return result
    } catch (failure) { if (mounted.current) setError(errorMessage(failure)) }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }, [notify])
  return { busy, error, run, setError }
}

export function usePoll(callback: () => Promise<unknown>, enabled = true, delay = 30000) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  useEffect(() => {
    if (!enabled) return
    let active = true, pending = false
    async function refresh() {
      if (!active || pending || document.visibilityState === 'hidden') return
      pending = true
      try { await callbackRef.current() } catch { /* The next visible refresh retries. */ }
      finally { pending = false }
    }
    const timer = setInterval(() => void refresh(), delay)
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', visible)
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [enabled, delay])
}

export function useCooldown() {
  const [deadline, setDeadline] = useState(0), [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!deadline) return
    const update = () => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    update()
    const timer = setInterval(update, 250)
    return () => clearInterval(timer)
  }, [deadline])
  return { seconds, start: () => { setSeconds(60); setDeadline(Date.now() + 60000) } }
}
