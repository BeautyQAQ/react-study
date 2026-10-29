import { useEffect } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { deletePost, getPost } from '@/api/post'
import { getInteraction, getOwnPost, setBookmark, setLike } from '@/api/social'
import { useAction, useResource } from '@/hooks/useAsync'
import { useAuth } from '@/state/Auth'
import { formatDate } from '@/utils/format'
import { Empty, ErrorNotice, Loading, MemberLink, Panel } from '@/components/common'
import MarkdownContent from '@/components/MarkdownContent'
import PostComments from '@/components/PostComments'

export default function PostDetail({ own = false }: { own?: boolean }) {
  const { id = '' } = useParams(), auth = useAuth(), navigate = useNavigate(), location = useLocation()
  const action = useAction(), post = useResource(() => own ? getOwnPost(id) : getPost(id), [id, own])
  const published = !post.data?.status || post.data.status === 'PUBLISHED'
  const interaction = useResource(() => getInteraction(Number(id)), [id, auth.user?.id], Boolean(auth.user && post.data && published))
  const counts = interaction.data || { liked: false, bookmarked: false, likes: post.data?.likes || 0, bookmarks: post.data?.collects || 0, comments: post.data?.comments || 0 }
  const isAuthor = Boolean(auth.user && auth.user.id === post.data?.userId)
  useEffect(() => { if (post.data) document.title = `${post.data.title} - 流沙社区` }, [post.data])
  async function toggle(kind: 'like' | 'bookmark') {
    if (!auth.user) { void navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`); return }
    let confirmed = interaction.data
    if (interaction.error || !confirmed) confirmed = await interaction.reload()
    if (!confirmed) return
    const value = kind === 'like' ? !confirmed.liked : !confirmed.bookmarked
    const result = await action.run(() => kind === 'like' ? setLike(Number(id), value) : setBookmark(Number(id), value),
      kind === 'like' ? (value ? '已点赞' : '已取消点赞') : (value ? '已收藏，可在我的收藏查看' : '已取消收藏'))
    if (result) interaction.setData(result.data)
  }
  async function remove() {
    if (!isAuthor || !window.confirm('删除后无法恢复，确定删除这篇帖子？')) return
    const result = await action.run(() => deletePost(id), '帖子已删除')
    if (result) void navigate('/me/posts', { replace: true })
  }
  return <>
    <Panel>
      {post.loading && <Loading text="正在加载帖子…" />}
      <ErrorNotice error={post.error} retry={post.reload} />
      {!post.loading && !post.data && <Empty action={<Link to="/">返回首页</Link>}>帖子不存在、已下架或暂时无法加载</Empty>}
      {post.data && <>
        {!published && <div className="alert warning"><strong>{post.data.status === 'PENDING' ? '帖子正在等待审核，仅自己可见' : '帖子暂不可公开访问，仅自己可见'}</strong><p>{post.data.moderationReason || '你可以编辑内容后重新提交审核。'}</p></div>}
        <div className="section-heading"><div>
          <div className="tags">{post.data.top && <span className="badge">置顶</span>}{post.data.essence && <span className="badge warning">精华</span>}</div>
          <h1 className="post-detail-title">{post.data.title}</h1>
        </div>{isAuthor && <div className="actions"><Link className="button" to={`/post/${id}/edit`}>编辑</Link><button type="button" className="danger" disabled={action.busy} onClick={() => void remove()}>删除</button></div>}</div>
        <p className="meta"><MemberLink username={post.data.username} alias={post.data.alias} /> · {formatDate(post.data.createTime)} · 浏览 {post.data.view}</p>
        <div className="tags">{post.data.tags.map(tag => <Link key={tag.id} className="tag" to={`/tag/${encodeURIComponent(tag.name)}`}>#{tag.name}</Link>)}</div>
        <hr /><MarkdownContent content={post.data.content} />
        <ErrorNotice error={action.error} />
        {published && <div className="interaction-bar">
          <button type="button" className={counts.liked ? 'primary' : ''} aria-pressed={counts.liked} disabled={action.busy || interaction.loading} onClick={() => void toggle('like')}>{counts.liked ? '已点赞' : '点赞'} {counts.likes}</button>
          <button type="button" className={counts.bookmarked ? 'primary' : ''} aria-pressed={counts.bookmarked} disabled={action.busy || interaction.loading} onClick={() => void toggle('bookmark')}>{counts.bookmarked ? '已收藏' : '收藏'} {counts.bookmarks}</button>
          <span className="muted">{counts.comments} 条评论</span>
          <ErrorNotice error={interaction.error} retry={interaction.reload} />
        </div>}
      </>}
    </Panel>
    {post.data && published && <PostComments postId={post.data.id} onChanged={interaction.reload} />}
  </>
}
