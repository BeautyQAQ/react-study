import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getFollowingPosts, getList } from '@/api/post'
import type { Page, Post } from '@/types'
import { useAuth } from '@/state/Auth'
import { usePage } from '@/hooks/useAsync'
import { formatDate } from '@/utils/format'
import { Avatar, Empty, ErrorNotice, Loading, MemberLink, Pagination } from './common'

export default function PostList({ query = '', tag = '', author = '', discovery = false }: { query?: string; tag?: string; author?: string; discovery?: boolean }) {
  const { user } = useAuth(), [params, setParams] = useSearchParams()
  const [localTab, setLocalTab] = useState('latest')
  const options = [['latest', '最新主题'], ['hot', '近七天热门'], ['essence', '精华'], ...(discovery ? [['following', '关注动态']] : [])]
  const candidate = discovery ? params.get('tab') || 'latest' : localTab
  const tab = options.some(([name]) => name === candidate) ? candidate : 'latest'
  const requiresLogin = tab === 'following' && !user
  const page = usePage<Post>((current, size) => {
    if (requiresLogin) return Promise.resolve({ code: 200, message: '', data: { content: [], totalElements: 0, totalPages: 0, number: 0, size } as Page<Post> })
    const filters = { query, tag, author }
    return tab === 'following' ? getFollowingPosts(current, size, filters) : getList(current, size, tab, filters)
  }, [query, tag, author, tab, user?.id])
  function changeTab(value: string) {
    page.setCurrent(1)
    if (discovery) setParams(previous => { const next = new URLSearchParams(previous); next.set('tab', value); return next }, { replace: true })
    else setLocalTab(value)
  }
  const records = requiresLogin ? [] : page.records
  return <section className="panel post-list" aria-label="社区主题" aria-busy={page.loading}>
    <div className="tabs" role="tablist" aria-label="主题栏目">
      {options.map(([name, label]) => <button type="button" role="tab" aria-selected={tab === name} key={name} onClick={() => changeTab(name)}>{label}</button>)}
    </div>
    <ErrorNotice error={page.error} retry={page.reload} />
    {page.loading && <Loading text="正在加载主题…" />}
    {!page.loading && !page.error && !records.length && <Empty action={requiresLogin
      ? <Link className="button primary" to={`/login?redirect=${encodeURIComponent('/?tab=following')}`}>登录查看关注动态</Link>
      : tab === 'following' ? <Link to="/">发现社区主题</Link> : undefined}>
      {requiresLogin ? '登录后查看你关注的作者发布的主题' : tab === 'following' ? '关注的人还没有公开主题，去发现感兴趣的作者吧' : tab === 'essence' ? '暂时没有精华主题' : '暂无主题'}
    </Empty>}
    {records.map(post => <article key={post.id} className="post-row">
      <Link to={`/member/${post.username}/home`} aria-label={`查看 ${post.alias || post.username} 的主页`}><Avatar avatar={post.avatar} name={post.alias || post.username} /></Link>
      <div className="row-body">
        <div className="post-title">{post.top && <span className="badge">置顶</span>}{post.essence && <span className="badge warning">精华</span>}<Link to={`/post/${post.id}`}>{post.title}</Link></div>
        <p className="meta"><MemberLink username={post.username} alias={post.alias} /> · {formatDate(post.createTime)} · 浏览 {post.view}</p>
        <div className="tags">{post.tags.map(item => <Link key={item.id} className="tag" to={`/tag/${encodeURIComponent(item.name)}`}>#{item.name}</Link>)}</div>
      </div>
    </article>)}
    <Pagination current={page.current} size={page.size} total={requiresLogin ? 0 : page.total} loading={page.loading} onChange={page.setCurrent} onSize={page.setSize} />
  </section>
}
