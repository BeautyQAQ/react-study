import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useMatches, useNavigate } from 'react-router-dom'
import { useAuth } from '@/state/Auth'
import { useAction } from '@/hooks/useAsync'
import { getDarkMode, setDarkMode } from '@/utils/auth'
import { ErrorNotice, Loading } from './common'

export function ProtectedRoute() {
  const auth = useAuth(), location = useLocation()
  if (auth.loading) return <Loading text="正在恢复登录状态…" />
  if (auth.error) return <section className="panel"><ErrorNotice error={auth.error} retry={auth.refresh} /></section>
  if (!auth.user && auth.destination) return null
  return auth.user ? <Outlet /> : <Navigate replace to={`/login?redirect=${encodeURIComponent(location.pathname + location.search + location.hash)}`} />
}

export default function Layout() {
  const auth = useAuth(), location = useLocation(), navigate = useNavigate(), matches = useMatches()
  const action = useAction(), [query, setQuery] = useState(''), [menuOpen, setMenuOpen] = useState(false)
  const [dark, setDark] = useState(getDarkMode)
  const header = useRef<HTMLElement>(null), menuButton = useRef<HTMLButtonElement>(null), account = useRef<HTMLDetailsElement>(null)
  const title = (matches.at(-1)?.handle as { title?: string } | undefined)?.title || '首页'
  useEffect(() => {
    if (auth.destination === location.pathname) auth.clearDestination()
  }, [auth.destination, auth.clearDestination, location.pathname])
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; setDarkMode(dark) }, [dark])
  useEffect(() => {
    setMenuOpen(false)
    if (account.current) account.current.open = false
    document.title = `${title} - 流沙社区`
    window.scrollTo({ top: 0, behavior: 'instant' })
    if (auth.user) void auth.refreshInbox()
  }, [location.pathname, location.search, title])
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) {
        setMenuOpen(false)
        if (account.current) account.current.open = false
      }
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])
  function search(event: FormEvent) {
    event.preventDefault()
    if (query.trim()) void navigate(`/search?key=${encodeURIComponent(query.trim())}`)
  }
  function closeMenus() {
    if (account.current?.open) { account.current.open = false; account.current.querySelector('summary')?.focus() }
    if (menuOpen) { setMenuOpen(false); menuButton.current?.focus() }
  }
  async function logout() {
    await action.run(auth.logout, '退出登录成功')
  }
  return <>
    {auth.destination && auth.destination !== location.pathname && <Navigate replace to={auth.destination} />}
    <a className="skip-link" href="#main-content" onClick={event => {
      event.preventDefault()
      document.getElementById('main-content')?.focus()
      document.getElementById('main-content')?.scrollIntoView()
    }}>跳到主要内容</a>
    <header className="site-header" ref={header} onKeyDown={event => { if (event.key === 'Escape') closeMenus() }}>
      <nav className="container site-navigation" aria-label="社区导航">
        <Link to="/" className="brand"><span className="brand-mark" aria-hidden="true">流</span>流沙社区</Link>
        <button type="button" ref={menuButton} className="menu-toggle" aria-expanded={menuOpen} aria-controls="community-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? '收起导航' : '展开导航'}</button>
        <div id="community-navigation" className={`navigation-panel${menuOpen ? ' is-open' : ''}`}>
          <NavLink to="/" end className="nav-link">主页</NavLink>
          <NavLink to="/games/tic-tac-toe" className="nav-link">井字棋</NavLink>
          <form role="search" className="site-search" onSubmit={search}>
            <label htmlFor="community-search" className="sr-only">搜索标题、正文、标签或作者</label>
            <input id="community-search" type="search" maxLength={100} placeholder="搜索社区内容" value={query} onChange={event => setQuery(event.target.value)} required />
            <button type="submit">搜索</button>
          </form>
          <button type="button" aria-pressed={dark} onClick={() => setDark(!dark)}>{dark ? '浅色模式' : '深色模式'}</button>
          {auth.loading ? <span className="muted">正在恢复登录…</span> : auth.user ? <>
            <NavLink to="/notifications" className="nav-link">通知{auth.notifications > 0 && <span className="unread-count" aria-label={`${auth.notifications} 条未读`}>{Math.min(auth.notifications, 99)}{auth.notifications > 99 ? '+' : ''}</span>}</NavLink>
            <NavLink to="/messages" className="nav-link">私信{auth.messages > 0 && <span className="unread-count" aria-label={`${auth.messages} 条未读`}>{Math.min(auth.messages, 99)}{auth.messages > 99 ? '+' : ''}</span>}</NavLink>
            <details className="account-menu" ref={account}>
              <summary>{auth.user.alias || auth.user.username}</summary>
              <div className="account-links">
                <Link to={`/member/${auth.user.username}/home`}>个人中心</Link>
                <Link to="/post/create">发布主题</Link><Link to="/me/posts">我的帖子</Link><Link to="/me/drafts">草稿箱</Link>
                <Link to="/me/bookmarks">我的收藏</Link><Link to="/me/following">我的关注</Link><Link to="/me/followers">我的粉丝</Link>
                <Link to={`/member/${auth.user.username}/setting`}>设置中心</Link>
                <button type="button" disabled={action.busy} onClick={() => void logout()}>{action.busy ? '正在退出…' : '退出登录'}</button>
              </div>
            </details>
          </> : <><Link to="/register" className="nav-link">注册</Link><Link to="/login" className="nav-link">登录</Link></>}
        </div>
      </nav>
    </header>
    <main id="main-content" className="container site-main" tabIndex={-1}>
      <ErrorNotice error={action.error} />
      {auth.error && <ErrorNotice error={`登录状态暂时无法恢复：${auth.error}`} retry={auth.refresh} />}
      <Suspense fallback={<Loading />}><div key={location.pathname}><Outlet /></div></Suspense>
    </main>
    <footer className="site-footer"><div className="container"><span>流沙社区 · 分享经验，记录想法</span><Link to="/games/tic-tac-toe">休息一下，来盘井字棋</Link></div></footer>
    <button type="button" className="back-top" aria-label="返回顶部" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>↑</button>
  </>
}
