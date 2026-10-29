import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { forgotPassword, resetPassword, userRegister } from '@/api/auth/auth'
import { useAuth } from '@/state/Auth'
import { useAction, useCooldown } from '@/hooks/useAsync'
import { ErrorNotice, Field, Panel } from '@/components/common'
import { passwordHint, safeRedirect, validPassword } from '@/utils/format'

export function Login() {
  const auth = useAuth(), [params] = useSearchParams(), action = useAction()
  const [form, setForm] = useState({ name: '', pass: '', rememberMe: true })
  const redirect = safeRedirect(params.get('redirect'))
  if (auth.user) return <Navigate replace to={redirect} />
  async function submit(event: FormEvent) {
    event.preventDefault()
    await action.run(() => auth.login(form), '登录成功')
  }
  return <Panel title="用户登录" className="account-panel">
    <p className="muted">欢迎回来，继续与社区分享你的想法。</p>
    <ErrorNotice error={action.error} />
    <form onSubmit={event => void submit(event)} onReset={() => setForm({ name: '', pass: '', rememberMe: true })}>
      <fieldset disabled={action.busy || auth.loading}>
        <Field label="账号"><input autoComplete="username" required maxLength={32} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label="密码"><input type="password" autoComplete="current-password" required maxLength={72} value={form.pass} onChange={event => setForm({ ...form, pass: event.target.value })} /></Field>
        <label className="checkbox"><input type="checkbox" checked={form.rememberMe} onChange={event => setForm({ ...form, rememberMe: event.target.checked })} />记住登录状态（一天）</label>
        <div className="actions"><button type="submit" className="primary">{action.busy ? '正在登录…' : '登录'}</button><button type="reset">重置</button><Link to="/password/forgot">忘记密码？</Link></div>
      </fieldset>
    </form>
    <p className="muted">还没有账号？<Link to={`/register?redirect=${encodeURIComponent(redirect)}`}>注册社区账号</Link></p>
  </Panel>
}

export function Register() {
  const navigate = useNavigate(), [params] = useSearchParams(), action = useAction()
  const [form, setForm] = useState({ name: '', pass: '', checkPass: '', email: '' })
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value }) })
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!validPassword(form.pass)) { action.setError(passwordHint); return }
    if (form.pass !== form.checkPass) { action.setError('两次输入密码不一致'); return }
    await action.run(async () => {
      await userRegister({ ...form, name: form.name.trim(), email: form.email.trim() })
      const redirect = safeRedirect(params.get('redirect'))
      void navigate(redirect === '/' ? '/login' : `/login?redirect=${encodeURIComponent(redirect)}`)
    }, '账号注册成功，请登录')
  }
  return <Panel title="新用户入驻" className="account-panel">
    <p className="muted">创建社区账号，一起交流、创作。</p><ErrorNotice error={action.error} />
    <form onSubmit={event => void submit(event)} onReset={() => setForm({ name: '', pass: '', checkPass: '', email: '' })}><fieldset disabled={action.busy}>
      <Field label="账号" hint="2–32 位字母、数字或下划线"><input autoComplete="username" pattern="[a-zA-Z0-9_]{2,32}" maxLength={32} required {...field('name')} /></Field>
      <Field label="密码" hint={passwordHint}><input type="password" autoComplete="new-password" required {...field('pass')} /></Field>
      <Field label="确认密码"><input type="password" autoComplete="new-password" required {...field('checkPass')} /></Field>
      <Field label="邮箱"><input type="email" autoComplete="email" maxLength={254} required {...field('email')} /></Field>
      <div className="actions"><button className="primary" type="submit">{action.busy ? '正在注册…' : '立即注册'}</button><button type="reset">重置</button><Link to="/login">已有账号，去登录</Link></div>
    </fieldset></form>
  </Panel>
}

export function Recover() {
  const auth = useAuth(), sendAction = useAction(), resetAction = useAction(), cooldown = useCooldown()
  const emailInput = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ email: '', code: '', password: '', checkPass: '' }), [sent, setSent] = useState(false)
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value }) })
  async function send() {
    if (cooldown.seconds || !emailInput.current?.reportValidity()) return
    await sendAction.run(async () => { await forgotPassword(form.email.trim()); setSent(true); cooldown.start() })
  }
  async function reset(event: FormEvent) {
    event.preventDefault()
    if (!validPassword(form.password)) { resetAction.setError(passwordHint); return }
    if (form.password !== form.checkPass) { resetAction.setError('两次输入的密码不一致'); return }
    await resetAction.run(async () => {
      await resetPassword({ ...form, email: form.email.trim() }); auth.reset('/login')
    }, '密码已重置，请使用新密码登录')
  }
  return <Panel title="找回密码" className="account-panel">
    <p className="muted">输入注册邮箱获取验证码，在 10 分钟内设置新密码。</p>
    <ErrorNotice error={sendAction.error || resetAction.error} />
    <form onSubmit={event => void reset(event)}><fieldset disabled={resetAction.busy}>
      <Field label="注册邮箱"><input ref={emailInput} type="email" autoComplete="email" maxLength={254} required {...field('email')} /></Field>
      <button type="button" disabled={sendAction.busy || cooldown.seconds > 0} onClick={() => void send()}>{cooldown.seconds ? `${cooldown.seconds} 秒后可重发` : sendAction.busy ? '正在发送…' : '发送验证码'}</button>
      {sent && <p className="alert success">如果该邮箱对应可用账号，验证码将发送到邮箱，请检查收件箱。</p>}
      <Field label="邮箱验证码"><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required {...field('code')} /></Field>
      <Field label="新密码" hint={passwordHint}><input type="password" autoComplete="new-password" required {...field('password')} /></Field>
      <Field label="确认新密码"><input type="password" autoComplete="new-password" required {...field('checkPass')} /></Field>
      <div className="actions"><button className="primary" type="submit">{resetAction.busy ? '正在重置…' : '重置密码'}</button><Link to="/login">返回登录</Link></div>
    </fieldset></form>
  </Panel>
}
