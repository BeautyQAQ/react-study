import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBookmarks, getFollowers, getFollowing, getMyPosts, setBookmark, setFollow } from '@/api/social'
import { deleteDraft, getDrafts } from '@/api/drafts'
import { useAction, usePage } from '@/hooks/useAsync'
import { useAuth } from '@/state/Auth'
import { draftLocation, httpStatus, localDrafts, removeRecovery } from '@/utils/drafts'
import { formatDate } from '@/utils/format'
import { Avatar, Empty, ErrorNotice, Loading, MemberLink, Pagination, Panel, StatusTag } from '@/components/common'

export function SavedPosts({ own = false }: { own?: boolean }) {
  const page = usePage((current, size) => own ? getMyPosts(current, size) : getBookmarks(current, size), [own]), action = useAction()
  async function remove(id: number) {
    const result = await action.run(() => setBookmark(id, false), '已取消收藏')
    if (result) void page.reload()
  }
  return <Panel title={own ? '我的帖子' : '我的收藏'} actions={own && <><Link to="/me/drafts">草稿箱</Link><Link className="button primary" to="/post/create">发布新主题</Link></>}>
    <ErrorNotice error={action.error || page.error} retry={page.error ? page.reload : undefined} />
    {page.loading && <Loading />}
    {!page.loading && !page.error && !page.records.length && <Empty action={<Link className="button" to={own ? '/post/create' : '/'}>{own ? '发布帖子' : '浏览社区'}</Link>}>{own ? '还没有发布过帖子' : '还没有收藏的帖子'}</Empty>}
    {page.records.map(post => <article className="saved-post" key={post.id}>
      <div className="row-body"><div className="post-title"><Link to={own ? `/me/posts/${post.id}` : `/post/${post.id}`}>{post.title}</Link>{own && <StatusTag status={post.status} />}</div>
        <p className="meta"><MemberLink username={post.username} alias={post.alias} /> · {formatDate(post.createTime)} · {post.likes || 0} 赞 · {post.comments || 0} 评论</p>
        {own && post.moderationReason && <p className="moderation-reason">审核说明：{post.moderationReason}</p>}
      </div>
      {own ? <Link className="button" to={`/post/${post.id}/edit`}>编辑</Link> : <button type="button" disabled={action.busy} onClick={() => void remove(post.id)}>取消收藏</button>}
    </article>)}
    <Pagination current={page.current} size={page.size} total={page.total} loading={page.loading} onChange={page.setCurrent} />
  </Panel>
}

export function Connections({ following = false }: { following?: boolean }) {
  const page = usePage((current, size) => following ? getFollowing(current, size) : getFollowers(current, size), [following]), action = useAction()
  async function unfollow(username: string) {
    const result = await action.run(() => setFollow(username, false), '已取消关注')
    if (result) void page.reload()
  }
  return <Panel title="我的关注与粉丝">
    <nav className="tabs" aria-label="关注与粉丝"><Link to="/me/following" aria-current={following ? 'page' : undefined}>我的关注</Link><Link to="/me/followers" aria-current={!following ? 'page' : undefined}>我的粉丝</Link></nav>
    <ErrorNotice error={action.error || page.error} retry={page.error ? page.reload : undefined} />
    {page.loading && <Loading />}
    {!page.loading && !page.error && !page.records.length && <Empty action={<Link to="/">发现社区主题</Link>}>{following ? '暂未关注其他用户' : '还没有粉丝'}</Empty>}
    {page.records.map(member => <article key={member.id} className="member-row">
      <Link to={`/member/${member.username}/home`} aria-label={`查看 ${member.alias || member.username} 的主页`}><Avatar avatar={member.avatar} name={member.alias || member.username} size={48} /></Link>
      <div className="row-body"><strong><MemberLink username={member.username} alias={member.alias} /></strong> <span className="muted">@{member.username}</span><p className="meta">{member.bio || '还没有填写简介'}</p></div>
      <div className="actions"><Link className="button" to={`/messages/${member.username}`}>私信</Link>{following && <button type="button" disabled={action.busy} onClick={() => void unfollow(member.username)}>取消关注</button>}</div>
    </article>)}
    <Pagination current={page.current} size={page.size} total={page.total} loading={page.loading} onChange={page.setCurrent} />
  </Panel>
}

export function Drafts() {
  const { user } = useAuth(), owner = user!.id, page = usePage(getDrafts, [owner], 20), action = useAction()
  const [local, setLocal] = useState(() => localDrafts(owner))
  useEffect(() => {
    const refresh = () => setLocal(localDrafts(owner))
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [owner])
  async function refresh() { setLocal(localDrafts(owner)); await page.reload() }
  const merged = new Map(page.records.map(draft => [draft.id, draft]))
  for (const draft of local) merged.set(draft.id, draft)
  const visible = [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  async function remove(draft: typeof visible[number]) {
    if (!window.confirm('删除后无法恢复，确定删除这份草稿？')) return
    await action.run(async () => {
      try { await deleteDraft(draft.id, draft.version) }
      catch (failure) { if (httpStatus(failure) !== 404) throw failure }
      removeRecovery(owner, draft.id)
    }, '草稿已删除')
    await refresh()
  }
  return <Panel title="草稿箱" actions={<><button type="button" onClick={() => void refresh()} disabled={page.loading}>刷新</button><Link className="button primary" to="/post/create">新建草稿</Link></>}>
    <ErrorNotice error={action.error} />
    {page.error && <div className="alert warning">暂时无法加载服务端草稿，仍可继续编辑此浏览器保留的内容。<button type="button" onClick={() => void refresh()}>重试</button></div>}
    {page.loading && <Loading />}
    {!page.loading && !visible.length && <Empty action={<Link className="button" to="/post/create">开始创作</Link>}>{page.error ? '草稿加载失败，请刷新重试' : '还没有草稿，开始记录你的想法吧'}</Empty>}
    {visible.map(draft => <article key={draft.id} className="draft-row">
      <div className="row-body"><div className="post-title"><Link to={draftLocation(draft)}>{draft.title.trim() || '未命名草稿'}</Link><span className={`badge ${draft.localOnly ? 'warning' : ''}`}>{draft.localOnly ? '待同步' : draft.postId ? '编辑草稿' : '新主题'}</span></div>
        <p className="meta">更新于 {formatDate(draft.updatedAt)}</p><p className="draft-excerpt">{draft.excerpt || '还没有填写正文'}</p>
      </div>
      <div className="actions"><Link className="button" to={draftLocation(draft)}>继续编辑</Link><button type="button" className="danger" disabled={action.busy} onClick={() => void remove(draft)}>删除</button></div>
    </article>)}
    <Pagination current={page.current} size={page.size} total={page.total} loading={page.loading} onChange={page.setCurrent} />
  </Panel>
}
