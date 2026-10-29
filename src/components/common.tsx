import { cloneElement, useId, useState, type ReactNode, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { mediaUrl } from '@/utils/media'

export function Loading({ text = '正在加载…' }: { text?: string }) {
  return <p className="loading" role="status"><span className="spinner" aria-hidden="true" />{text}</p>
}
export function ErrorNotice({ error, retry }: { error?: string; retry?: () => unknown }) {
  return error ? <div className="alert error" role="alert"><span>{error}</span>{retry && <button type="button" onClick={() => { void Promise.resolve(retry()).catch(() => {}) }}>重试</button>}</div> : null
}
export function Empty({ children = '暂无内容', action }: { children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><p>{children}</p>{action}</div>
}
export function Panel({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>
    {(title || actions) && <div className="section-heading">{typeof title === 'string' ? <h1>{title}</h1> : title}<div className="actions">{actions}</div></div>}
    {children}
  </section>
}
export function Field({ label, children, hint }: { label: string; children: ReactElement<{ id?: string; 'aria-describedby'?: string }>; hint?: string }) {
  const generated = useId(), id = children.props.id || generated
  return <div className="field"><label htmlFor={id}>{label}</label>{cloneElement(children, { id, ...(hint ? { 'aria-describedby': `${id}-hint` } : {}) })}{hint && <small id={`${id}-hint`} className="muted">{hint}</small>}</div>
}
export function Avatar({ avatar, name, size = 40 }: { avatar?: string; name: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  return <span className="avatar" style={{ width: size, height: size }} aria-hidden="true">
    {avatar && !broken ? <img src={mediaUrl(avatar)} alt="" onError={() => setBroken(true)} /> : name.slice(0, 1).toUpperCase()}
  </span>
}
export function Pagination({ current, size, total, onChange, onSize, loading = false }: {
  current: number; size: number; total: number; onChange: (page: number) => void; onSize?: (size: number) => void; loading?: boolean
}) {
  const id = useId(), pages = Math.max(1, Math.ceil(total / size))
  if (!total) return null
  return <nav className="pagination" aria-label="分页">
    <span>共 {total} 条 · 第 {current} / {pages} 页</span>
    <div className="actions">
      <button type="button" disabled={loading || current <= 1} onClick={() => onChange(current - 1)}>上一页</button>
      <button type="button" disabled={loading || current >= pages} onClick={() => onChange(current + 1)}>下一页</button>
      {onSize && <><label htmlFor={id} className="sr-only">每页条数</label><select id={id} value={size} disabled={loading} onChange={event => onSize(Number(event.target.value))}>
        {[10, 20, 50].map(value => <option key={value} value={value}>{value} 条 / 页</option>)}
      </select></>}
    </div>
  </nav>
}
export function StatusTag({ status }: { status?: string }) {
  return <span className={`badge ${status === 'PUBLISHED' ? 'success' : 'warning'}`}>{status === 'PENDING' ? '待审核' : status === 'HIDDEN' ? '已隐藏' : '已发布'}</span>
}
export function MemberLink({ username, alias }: { username: string; alias?: string }) {
  return <Link to={`/member/${encodeURIComponent(username)}/home`}>{alias || username}</Link>
}
