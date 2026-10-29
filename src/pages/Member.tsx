import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import * as api from '@/api/auth/auth'
import { getRelationship, setFollow } from '@/api/social'
import { useAuth } from '@/state/Auth'
import { useAction, useCooldown, useResource } from '@/hooks/useAsync'
import { formatDate, passwordHint, validPassword } from '@/utils/format'
import { Avatar, Empty, ErrorNotice, Field, Loading, Panel } from '@/components/common'
import ImageUploader from '@/components/ImageUploader'
import PostList from '@/components/PostList'

export function Profile() {
  const { username = '' } = useParams(), auth = useAuth(), navigate = useNavigate(), location = useLocation(), action = useAction()
  const profile = useResource(() => api.getProfile(username), [username])
  const relationship = useResource(() => getRelationship(username), [username, auth.user?.id], Boolean(profile.data && auth.user))
  const isMe = auth.user?.id === profile.data?.id
  async function follow() {
    if (!auth.user) { void navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`); return }
    const confirmed = relationship.error || !relationship.data ? await relationship.reload() : relationship.data
    if (!confirmed || isMe) return
    const result = await action.run(() => setFollow(username, !confirmed.following), confirmed.following ? '已取消关注' : '已关注，可在我的关注查看')
    if (result) relationship.setData(result.data)
  }
  return <>
    <Panel>
      {profile.loading && <Loading text="正在加载用户…" />}
      <ErrorNotice error={profile.error} retry={profile.reload} />
      {!profile.loading && !profile.data && <Empty>用户不存在或暂时无法加载</Empty>}
      {profile.data && <>
        <div className="profile-heading"><Avatar avatar={profile.data.avatar} name={profile.data.alias || username} size={64} />
          <div className="row-body"><h1>{profile.data.alias || username}</h1><p className="meta">@{username} · 加入于 {formatDate(profile.data.createTime)}</p></div>
          {isMe ? <Link className="button" to={`/member/${username}/setting`}>编辑资料</Link> : <div className="actions">
            <button type="button" className={relationship.data?.following ? '' : 'primary'} disabled={action.busy || relationship.loading} onClick={() => void follow()}>{relationship.data?.following ? '已关注 · 取消' : '关注'}</button>
            <Link className="button" to={`/messages/${username}`}>发私信</Link>
          </div>}
        </div>
        <p className="plain-content">{profile.data.bio || '这个人还没有填写简介。'}</p>
        {relationship.data && <div className="actions profile-stats">
          {isMe ? <Link to="/me/following">关注 {relationship.data.followingCount}</Link> : <span>关注 {relationship.data.followingCount}</span>}
          {isMe ? <Link to="/me/followers">粉丝 {relationship.data.followers}</Link> : <span>粉丝 {relationship.data.followers}</span>}
          {isMe && <Link to="/me/posts">我的全部帖子（含待审核）</Link>}
        </div>}
        <ErrorNotice error={action.error || relationship.error} retry={relationship.error ? relationship.reload : undefined} />
      </>}
    </Panel>
    {profile.data && <><h2 className="page-title">发布的主题</h2><PostList key={username} author={username} /></>}
  </>
}

export function Settings() {
  const auth = useAuth(), { username } = useParams()
  const user = auth.user!
  const [profile, setProfile] = useState({ alias: user.alias || '', bio: user.bio || '' })
  const [password, setPassword] = useState({ currentPass: '', password: '', checkPass: '' })
  const [code, setCode] = useState('')
  const saveAction = useAction(), avatarAction = useAction(), sendAction = useAction(), verifyAction = useAction(), passwordAction = useAction(), cooldown = useCooldown()
  if (username !== user.username) return <Navigate replace to="/" />
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!profile.alias.trim()) { saveAction.setError('请输入昵称'); return }
    const result = await saveAction.run(() => api.saveProfile(profile), '资料已更新')
    if (result) auth.update(result.data)
  }
  async function saveAvatar(url: string) {
    const result = await avatarAction.run(() => api.saveAvatar(url), '头像已更新')
    if (result) auth.update(result.data)
  }
  async function sendCode() {
    if (cooldown.seconds) return
    const result = await sendAction.run(api.sendEmailCode, '验证邮件已请求发送，请检查收件箱')
    if (result) cooldown.start()
  }
  async function verify(event: FormEvent) {
    event.preventDefault()
    await verifyAction.run(async () => { await api.verifyEmail(code); await auth.refresh(); setCode('') }, '邮箱已验证')
  }
  async function changePassword(event: FormEvent) {
    event.preventDefault()
    if (!validPassword(password.password)) { passwordAction.setError(passwordHint); return }
    if (password.password !== password.checkPass) { passwordAction.setError('两次输入的密码不一致'); return }
    await passwordAction.run(async () => {
      await api.changePassword(password); auth.reset('/login')
    }, '密码已更新，请重新登录')
  }
  return <Panel title="个人设置" className="settings">
    <div className="avatar-editor"><Avatar key={user.avatar} avatar={user.avatar} name={user.alias || user.username} size={72} /><ImageUploader label="更换头像" disabled={avatarAction.busy} onUploaded={saveAvatar} /></div>
    <ErrorNotice error={avatarAction.error || saveAction.error} />
    <form onSubmit={event => void save(event)}><fieldset disabled={saveAction.busy}>
      <Field label="昵称"><input value={profile.alias} maxLength={64} required onChange={event => setProfile({ ...profile, alias: event.target.value })} /></Field>
      <Field label="简介"><textarea value={profile.bio} rows={3} maxLength={255} onChange={event => setProfile({ ...profile, bio: event.target.value })} /></Field>
      <button type="submit" className="primary">{saveAction.busy ? '正在保存…' : '保存资料'}</button>
    </fieldset></form>
    <hr /><h2>邮箱验证</h2><p>{user.email} <span className={`badge ${user.active ? 'success' : 'warning'}`}>{user.active ? '已验证' : '未验证'}</span></p>
    {!user.active && <>
      <p className="muted">验证码发送到注册邮箱，10 分钟内有效。</p>
      <ErrorNotice error={sendAction.error || verifyAction.error} />
      <button type="button" disabled={sendAction.busy || cooldown.seconds > 0} onClick={() => void sendCode()}>{cooldown.seconds ? `${cooldown.seconds} 秒后可重发` : sendAction.busy ? '正在发送…' : '发送验证邮件'}</button>
      <form onSubmit={event => void verify(event)}><Field label="邮箱验证码"><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required value={code} onChange={event => setCode(event.target.value)} /></Field>
        <button className="primary" type="submit" disabled={verifyAction.busy || !/^[0-9]{6}$/.test(code)}>{verifyAction.busy ? '正在验证…' : '验证邮箱'}</button>
      </form>
    </>}
    <hr /><h2>修改密码</h2><ErrorNotice error={passwordAction.error} />
    <form onSubmit={event => void changePassword(event)}><fieldset disabled={passwordAction.busy}>
      <Field label="当前密码"><input type="password" autoComplete="current-password" required value={password.currentPass} onChange={event => setPassword({ ...password, currentPass: event.target.value })} /></Field>
      <Field label="新密码" hint={passwordHint}><input type="password" autoComplete="new-password" required value={password.password} onChange={event => setPassword({ ...password, password: event.target.value })} /></Field>
      <Field label="确认新密码"><input type="password" autoComplete="new-password" required value={password.checkPass} onChange={event => setPassword({ ...password, checkPass: event.target.value })} /></Field>
      <button type="submit">{passwordAction.busy ? '正在更新…' : '更新密码'}</button>
    </fieldset></form>
  </Panel>
}
