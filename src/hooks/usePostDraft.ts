import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { PostDraftSession } from '@/state/PostDraft'
import { useAuth } from '@/state/Auth'

export function usePostDraft(owner: number, id: string, postId: number | null) {
  const auth = useAuth(), ownerRef = useRef(auth.user?.id), navigate = useNavigate()
  ownerRef.current = auth.user?.id
  const session = useMemo(() => new PostDraftSession(owner, id, postId, () => ownerRef.current === owner), [owner, id, postId])
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const blocker = useBlocker(() => session.shouldBlock)
  useEffect(() => {
    session.start()
    const online = () => { if (session.getSnapshot().ready && session.dirty) void session.flush() }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (session.shouldBlock && !session.getSnapshot().localSaved) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('online', online)
    window.addEventListener('beforeunload', beforeUnload)
    return () => { session.stop(); window.removeEventListener('online', online); window.removeEventListener('beforeunload', beforeUnload) }
  }, [session])
  useEffect(() => { if (state.redirect) void navigate(state.redirect, { replace: true }) }, [state.redirect, navigate])
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (session.getSnapshot().publishing) { blocker.reset(); return }
    let active = true
    void session.flush().then(ok => {
      if (!active) return
      if (session.getSnapshot().publishing) { blocker.reset(); return }
      if (ok || session.getSnapshot().localSaved || window.confirm('草稿尚未保存成功，离开可能丢失内容，确定离开？')) blocker.proceed()
      else blocker.reset()
    })
    return () => { active = false }
  }, [blocker, session])
  return { session, state }
}
