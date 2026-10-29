import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { getProfile } from '@/api/auth/auth'
import * as api from '@/api/social'
import type { Notification } from '@/types'
import { useAuth } from '@/state/Auth'
import { useAction, usePage, usePoll, useResource } from '@/hooks/useAsync'
import { Avatar, Empty, ErrorNotice, Field, Loading, Pagination, Panel } from '@/components/common'
import { formatDate } from '@/utils/format'

export function Notifications() {
  const auth = useAuth(), page = usePage(api.getNotifications), action = useAction(), navigate = useNavigate()
  const labels: Record<string, string> = { COMMENT: '评论', REPLY: '回复', LIKE: '点赞', FOLLOW: '关注', MODERATION: '审核' }
  async function refresh() { await Promise.all([page.reload(), auth.refreshInbox()]) }
  usePoll(refresh)
  async function read(item: Notification, open = false) {
    if (!item.read) {
      const result = await action.run(() => api.markNotificationRead(item.id))
      if (!result) return
      page.setData(previous => previous ? { ...previous, content: previous.content.map(row => row.id === item.id ? { ...row, read: true } : row) } : previous)
      void auth.refreshInbox()
    }
    if (open) {
      if (item.postId) void navigate(`${item.type === 'MODERATION' ? '/me/posts/' : '/post/'}${item.postId}`)
      else if (item.actorUsername) void navigate(`/member/${item.actorUsername}/home`)
    }
  }
  async function readAll() {
    const result = await action.run(api.markAllNotificationsRead, '通知已全部标为已读')
    if (result) await refresh()
  }
  return <Panel title={<h1>通知中心 {auth.notifications > 0 && <span className="badge warning">{auth.notifications} 条未读</span>}</h1>} actions={<><button type="button" disabled={page.loading} onClick={() => void refresh()}>刷新</button><button type="button" disabled={action.busy || !auth.notifications} onClick={() => void readAll()}>全部标为已读</button></>}>
    <ErrorNotice error={action.error || page.error} retry={page.error ? page.reload : undefined} />
    {page.loading && <Loading />}
    {!page.loading && !page.error && !page.records.length && <Empty>暂时没有通知</Empty>}
    {page.records.map(item => <article className={`notification-row${item.read ? '' : ' unread'}`} key={item.id}>
      <div className="actions"><span className="badge">{labels[item.type] || '通知'}</span><strong>{item.actorAlias || item.actorUsername || '社区管理'}</strong>{!item.read && <span className="unread-dot" aria-label="未读" />}</div>
      <p className="plain-content">{item.content}</p>
      <div className="section-heading"><small className="muted">{formatDate(item.createdAt)}</small><div className="actions">
        {(item.postId || item.actorUsername) && <button type="button" className="subtle" disabled={action.busy} onClick={() => void read(item, true)}>{item.postId ? '查看帖子' : '查看用户'}</button>}
        {!item.read && <button type="button" disabled={action.busy} onClick={() => void read(item)}>标为已读</button>}
      </div></div>
    </article>)}
    <Pagination current={page.current} size={page.size} total={page.total} loading={page.loading} onChange={page.setCurrent} />
  </Panel>
}

export function Messages() {
  const auth = useAuth(), navigate = useNavigate(), page = usePage(api.getConversations)
  const [username, setUsername] = useState(''), [error, setError] = useState('')
  async function refresh() { await Promise.all([page.reload(), auth.refreshInbox()]) }
  usePoll(refresh)
  function start(event: FormEvent) {
    event.preventDefault()
    const target = username.trim().toLowerCase()
    if (!/^[a-z0-9_]{2,32}$/.test(target)) { setError('请输入 2 至 32 位字母、数字或下划线账号'); return }
    if (target === auth.user?.username) { setError('请选择其他用户'); return }
    void navigate(`/messages/${target}`)
  }
  return <Panel title={<h1>私信 {auth.messages > 0 && <span className="badge warning">{auth.messages} 条未读</span>}</h1>} actions={<button type="button" disabled={page.loading} onClick={() => void refresh()}>刷新</button>}>
    <form className="start-conversation" onSubmit={start}><input aria-label="私信接收者账号" maxLength={32} value={username} onChange={event => setUsername(event.target.value)} placeholder="输入对方账号，开始私信" required /><button type="submit" className="primary" disabled={!username.trim()}>发私信</button></form>
    <ErrorNotice error={error || page.error} retry={page.error ? page.reload : undefined} />
    {page.loading && <Loading />}
    {!page.loading && !page.error && !page.records.length && <Empty>暂时没有私信会话</Empty>}
    {page.records.map(item => <Link className="conversation" to={`/messages/${item.username}`} key={item.username}>
      <Avatar avatar={item.avatar} name={item.alias || item.username} size={48} />
      <div className="row-body"><div className="section-heading"><strong>{item.alias || item.username}</strong><small className="muted">{formatDate(item.createdAt, true)}</small></div><p className="conversation-preview">{item.lastContent}</p></div>
      {item.unread > 0 && <span className="unread-count">{item.unread}</span>}
    </Link>)}
    <Pagination current={page.current} size={page.size} total={page.total} loading={page.loading} onChange={page.setCurrent} />
  </Panel>
}

export function Chat() {
  const { username = '' } = useParams(), { user } = useAuth()
  return username === user?.username ? <Navigate replace to="/messages" /> : <Conversation key={username} username={username} />
}

function Conversation({ username }: { username: string }) {
  const auth = useAuth(), partner = useResource(() => getProfile(username), [username]), action = useAction()
  const page = usePage((current, size) => api.getMessages(username, current, size), [username], 20)
  const [content, setContent] = useState('')
  const blocker = useBlocker(Boolean(content.trim()))
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm('还有未发送的私信，确定离开？')) blocker.proceed()
      else blocker.reset()
    }
  }, [blocker])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (content.trim()) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [content])
  useEffect(() => {
    let active = true
    if (page.records.length && document.visibilityState === 'visible') {
      void api.markMessagesRead(username).then(() => { if (active) void auth.refreshInbox() }).catch(() => {})
    }
    return () => { active = false }
  }, [page.data, username])
  usePoll(async () => { if (page.current === 1 && !page.loading) await page.reload() })
  async function refresh() { await Promise.all([partner.reload(), page.reload()]) }
  async function send(event: FormEvent) {
    event.preventDefault()
    if (!content.trim() || !partner.data) return
    const result = await action.run(() => api.sendMessage(username, content.trim()), '私信已发送')
    if (result) { setContent(''); page.reset(); void auth.refreshInbox() }
  }
  return <Panel title={<div><Link to="/messages">‹ 所有私信</Link><h1>与 {partner.data?.alias || username} 的私信</h1></div>} actions={<><Link to={`/member/${username}/home`}>查看主页</Link><button type="button" onClick={() => void refresh()}>刷新</button></>}>
    <ErrorNotice error={partner.error ? '对方账号不存在、已停用或暂时无法加载，请刷新后重试。' : action.error || page.error} retry={partner.error ? refresh : page.error ? page.reload : undefined} />
    {partner.loading && <Loading text="正在加载对方资料…" />}
    <div className="message-history" aria-label="私信历史" aria-busy={page.loading}>
      {page.loading && <Loading />}
      {!page.loading && !page.error && !page.records.length && <Empty>还没有消息，打个招呼吧</Empty>}
      {[...page.records].reverse().map(item => <article className={`message${item.senderUsername === auth.user?.username ? ' mine' : ''}`} key={item.id}>
        <div className="bubble"><p className="plain-content">{item.content}</p><small>{formatDate(item.createdAt, true)}{item.senderUsername === auth.user?.username && ` · ${item.read ? '已读' : '未读'}`}</small></div>
      </article>)}
    </div>
    {page.total > page.size && <p className="meta">第 1 页为最近消息，翻页可查看更早的历史。</p>}
    <Pagination current={page.current} size={page.size} total={page.total} loading={page.loading} onChange={page.setCurrent} />
    <form className="message-composer" onSubmit={event => void send(event)}>
      <Field label="私信内容"><textarea rows={3} maxLength={2000} value={content} disabled={!partner.data || action.busy} onChange={event => setContent(event.target.value)} placeholder="写下想说的话" /></Field>
      <button type="submit" className="primary" disabled={!partner.data || action.busy || !content.trim()}>{action.busy ? '正在发送…' : '发送私信'}</button>
    </form>
  </Panel>
}
