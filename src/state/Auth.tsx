import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import * as api from '@/api/auth/auth'
import { getMessageUnread, getNotificationUnread } from '@/api/social'
import { getToken, removeToken, setToken } from '@/utils/auth'
import { errorMessage } from '@/utils/request'
import { usePoll } from '@/hooks/useAsync'
import type { LoginForm, User } from '@/types'

interface AuthState {
  user: User | null; loading: boolean; error: string
  login: (form: LoginForm) => Promise<void>; logout: () => Promise<void>
  refresh: () => Promise<void>; reset: (destination?: string | null) => void; update: (user: User) => void
  destination: string | null; clearDestination: () => void
  notifications: number; messages: number; refreshInbox: () => Promise<void>
}
const AuthContext = createContext<AuthState | null>(null)
export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('AuthProvider is required')
  return auth
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const userRef = useRef(user)
  userRef.current = user
  const [loading, setLoading] = useState(Boolean(getToken())), [error, setError] = useState('')
  const [counts, setCounts] = useState({ notifications: 0, messages: 0 })
  const [destination, setDestination] = useState<string | null>(null)
  const revision = useRef(0), inboxRevision = useRef(0)
  const clearDestination = useCallback(() => setDestination(null), [])
  const reset = useCallback((next: string | null = null) => {
    revision.current++; inboxRevision.current++
    removeToken(); setUser(null); setError(''); setLoading(false)
    setCounts({ notifications: 0, messages: 0 })
    setDestination(next)
  }, [])
  const refresh = useCallback(async () => {
    const token = getToken(), ticket = ++revision.current
    if (!token) { setUser(null); setLoading(false); setError(''); return }
    setLoading(!userRef.current); setError('')
    try {
      const { data } = await api.getUserInfo()
      if (!data) throw new Error('登录状态已失效')
      if (ticket === revision.current && token === getToken()) setUser(data)
    } catch (failure) {
      if (ticket === revision.current) setError(errorMessage(failure))
      throw failure
    } finally { if (ticket === revision.current) setLoading(false) }
  }, [])
  useEffect(() => {
    void refresh().catch(() => {})
    const unauthorized = () => reset()
    window.addEventListener('community:unauthorized', unauthorized)
    return () => { revision.current++; inboxRevision.current++; window.removeEventListener('community:unauthorized', unauthorized) }
  }, [refresh, reset])
  const refreshInbox = useCallback(async () => {
    const ticket = ++inboxRevision.current, token = getToken()
    if (!user || !token) { setCounts({ notifications: 0, messages: 0 }); return }
    const results = await Promise.allSettled([getNotificationUnread(), getMessageUnread()])
    if (ticket !== inboxRevision.current || token !== getToken()) return
    setCounts(previous => ({
      notifications: results[0].status === 'fulfilled' ? results[0].value.data.count : previous.notifications,
      messages: results[1].status === 'fulfilled' ? results[1].value.data.count : previous.messages,
    }))
  }, [user?.id])
  useEffect(() => { void refreshInbox(); return () => { inboxRevision.current++ } }, [refreshInbox])
  usePoll(refreshInbox, Boolean(user))
  const login = async (form: LoginForm) => {
    const { data } = await api.login({ username: form.name.trim(), password: form.pass, rememberMe: form.rememberMe })
    setToken(data.token, form.rememberMe)
    await refresh()
  }
  const logout = async () => { try { await api.logout() } finally { reset('/') } }
  return <AuthContext.Provider value={{ user, loading, error, login, logout, refresh, reset, destination, clearDestination, update: setUser, ...counts, refreshInbox }}>
    {children}
  </AuthContext.Provider>
}
