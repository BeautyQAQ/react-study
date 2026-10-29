import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { addComment, deleteComment, getComments } from '@/api/social'
import type { Comment } from '@/types'
import { useAuth } from '@/state/Auth'
import { useAction, usePage } from '@/hooks/useAsync'
import { formatDate } from '@/utils/format'
import { Avatar, Empty, ErrorNotice, Loading, MemberLink, Pagination, Panel } from './common'

export default function PostComments({ postId, onChanged }: { postId: number; onChanged: () => unknown }) {
  const auth = useAuth(), location = useLocation(), navigate = useNavigate(), action = useAction()
  const page = usePage((current, size) => getComments(postId, current, size), [postId], 20)
  const [content, setContent] = useState(''), [replyTo, setReplyTo] = useState<Comment>()
  const input = useRef<HTMLTextAreaElement>(null)
  const loginPath = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`
  function reply(comment: Comment) {
    if (!auth.user) { void navigate(loginPath); return }
    setReplyTo(comment); input.current?.focus()
    input.current?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!content.trim()) return
    const result = await action.run(() => addComment(postId, content.trim(), replyTo?.id), '评论已发布')
    if (result) {
      setContent(''); setReplyTo(undefined)
      const last = Math.floor(page.total / page.size) + 1
      if (last === page.current) void page.reload(); else page.setCurrent(last)
      void onChanged()
    }
  }
  async function remove(comment: Comment) {
    if (!window.confirm(comment.parentId ? '确定删除这条回复？' : '删除评论也会删除其下的回复，确定继续？')) return
    const result = await action.run(() => deleteComment(comment.id), '评论已删除')
    if (result) {
      if (replyTo?.id === comment.id || replyTo?.parentId === comment.id) setReplyTo(undefined)
      void page.reload(); void onChanged()
    }
  }
  return <Panel title={<h2>评论与回复 <span className="muted">{page.total}</span></h2>} className="comments">
    <ErrorNotice error={action.error} />
    {auth.user ? <form onSubmit={event => void submit(event)}>
      {replyTo && <div className="reply-heading">回复 {replyTo.alias || replyTo.username}<button type="button" onClick={() => setReplyTo(undefined)}>取消回复</button></div>}
      <textarea ref={input} aria-label="评论内容" rows={3} maxLength={2000} value={content} disabled={action.busy} onChange={event => setContent(event.target.value)} placeholder={replyTo ? '写下你的回复' : '分享你的观点，友善交流'} />
      <button type="submit" className="primary" disabled={action.busy || !content.trim()}>{action.busy ? '正在发布…' : replyTo ? '发布回复' : '发表评论'}</button>
    </form> : <p><Link to={loginPath}>登录后发表评论</Link></p>}
    <ErrorNotice error={page.error} retry={page.reload} />
    {page.loading && <Loading text="正在加载评论…" />}
    {!page.loading && !page.error && !page.records.length && <Empty>还没有评论，来分享你的观点吧</Empty>}
    <div className="comment-list" aria-busy={page.loading}>
      {page.records.map(comment => <article id={`comment-${comment.id}`} className={`comment${comment.parentId ? ' reply' : ''}`} key={comment.id}>
        <Link to={`/member/${comment.username}/home`} aria-label={`查看 ${comment.alias || comment.username} 的主页`}><Avatar avatar={comment.avatar} name={comment.alias || comment.username} size={32} /></Link>
        <div className="row-body"><strong><MemberLink username={comment.username} alias={comment.alias} /></strong> <small className="muted">{formatDate(comment.createdAt, true)}</small>
          {comment.parentId && <p className="meta">回复评论 #{comment.parentId}</p>}
          <p className="plain-content">{comment.content}</p>
          <div className="actions"><button type="button" className="subtle" onClick={() => reply(comment)}>回复</button>
            {comment.username === auth.user?.username && <button type="button" className="subtle danger" disabled={action.busy} onClick={() => void remove(comment)}>删除</button>}
          </div>
        </div>
      </article>)}
    </div>
    <Pagination current={page.current} size={page.size} total={page.total} loading={page.loading} onChange={page.setCurrent} />
  </Panel>
}
