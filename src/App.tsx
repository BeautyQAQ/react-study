import { lazy } from 'react'
import { createHashRouter, Link, RouterProvider } from 'react-router-dom'
import Layout, { ProtectedRoute } from '@/components/Layout'
import { AuthProvider } from '@/state/Auth'
import { NoticeProvider } from '@/state/Notice'

const Home = lazy(() => import('@/pages/Home').then(module => ({ default: module.Home })))
const Browse = lazy(() => import('@/pages/Home').then(module => ({ default: module.Browse })))
const Login = lazy(() => import('@/pages/Auth').then(module => ({ default: module.Login })))
const Register = lazy(() => import('@/pages/Auth').then(module => ({ default: module.Register })))
const Recover = lazy(() => import('@/pages/Auth').then(module => ({ default: module.Recover })))
const PostDetail = lazy(() => import('@/pages/Post'))
const Editor = lazy(() => import('@/pages/Editor'))
const Profile = lazy(() => import('@/pages/Member').then(module => ({ default: module.Profile })))
const Settings = lazy(() => import('@/pages/Member').then(module => ({ default: module.Settings })))
const SavedPosts = lazy(() => import('@/pages/Collections').then(module => ({ default: module.SavedPosts })))
const Connections = lazy(() => import('@/pages/Collections').then(module => ({ default: module.Connections })))
const Drafts = lazy(() => import('@/pages/Collections').then(module => ({ default: module.Drafts })))
const Notifications = lazy(() => import('@/pages/Inbox').then(module => ({ default: module.Notifications })))
const Messages = lazy(() => import('@/pages/Inbox').then(module => ({ default: module.Messages })))
const Chat = lazy(() => import('@/pages/Inbox').then(module => ({ default: module.Chat })))
const Game = lazy(() => import('./Game.jsx'))

function NotFound() {
  return <section className="panel empty"><h1>页面不存在</h1><p>你访问的页面不存在或已被移除。</p><Link className="button primary" to="/">返回首页</Link></section>
}
function RouteError() {
  return <section className="panel empty"><h1>页面暂时无法打开</h1><p>请检查网络后重试。</p><button type="button" onClick={() => window.location.reload()}>重新加载</button></section>
}

export const routes = [{
  element: <Layout />, errorElement: <RouteError />, children: [
    { index: true, element: <Home />, handle: { title: '首页' } },
    { path: 'login', element: <Login />, handle: { title: '登录' } },
    { path: 'register', element: <Register />, handle: { title: '注册' } },
    { path: 'password/forgot', element: <Recover />, handle: { title: '找回密码' } },
    { path: 'search', element: <Browse />, handle: { title: '搜索' } },
    { path: 'tag/:name', element: <Browse />, handle: { title: '标签主题' } },
    { path: 'post/:id', element: <PostDetail />, handle: { title: '帖子详情' } },
    { path: 'member/:username/home', element: <Profile />, handle: { title: '用户主页' } },
    { path: 'games/tic-tac-toe', element: <Game />, handle: { title: '井字棋小游戏' } },
    { element: <ProtectedRoute />, children: [
      { path: 'post/create', element: <Editor />, handle: { title: '发布主题' } },
      { path: 'post/:id/edit', element: <Editor />, handle: { title: '编辑帖子' } },
      { path: 'me/posts', element: <SavedPosts own />, handle: { title: '我的帖子' } },
      { path: 'me/posts/:id', element: <PostDetail own />, handle: { title: '我的帖子' } },
      { path: 'me/drafts', element: <Drafts />, handle: { title: '草稿箱' } },
      { path: 'me/bookmarks', element: <SavedPosts />, handle: { title: '我的收藏' } },
      { path: 'me/following', element: <Connections following />, handle: { title: '我的关注' } },
      { path: 'me/followers', element: <Connections />, handle: { title: '我的粉丝' } },
      { path: 'notifications', element: <Notifications />, handle: { title: '通知中心' } },
      { path: 'messages', element: <Messages />, handle: { title: '私信' } },
      { path: 'messages/:username', element: <Chat />, handle: { title: '私信会话' } },
      { path: 'member/:username/setting', element: <Settings />, handle: { title: '个人设置' } },
    ] },
    { path: '*', element: <NotFound />, handle: { title: '页面不存在' } },
  ],
}]
const router = createHashRouter(routes)
export default function App() {
  return <NoticeProvider><AuthProvider><RouterProvider router={router} /></AuthProvider></NoticeProvider>
}
