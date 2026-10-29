import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getTags } from '@/api/post'
import { getOwnPost } from '@/api/social'
import { saveDraft } from '@/api/drafts'
import { useAuth } from '@/state/Auth'
import { useNotice } from '@/state/Notice'
import { usePostDraft } from '@/hooks/usePostDraft'
import { useResource } from '@/hooks/useAsync'
import { draftLocation, newDraftId, removeRecovery, writeRecovery } from '@/utils/drafts'
import { errorMessage } from '@/utils/request'
import type { PostDraft } from '@/types'
import { Empty, ErrorNotice, Field, Loading, Panel } from '@/components/common'
import MarkdownContent from '@/components/MarkdownContent'
import ImageUploader from '@/components/ImageUploader'

export default function Editor() {
  const { user } = useAuth(), { id: parameter } = useParams(), [params] = useSearchParams()
  const postId = parameter ? Number(parameter) : null, id = params.get('draft')
  if (postId !== null && (!Number.isSafeInteger(postId) || postId < 1)) return <Panel title="帖子地址不正确"><Link to="/me/posts">返回我的帖子</Link></Panel>
  return id ? <DraftEditor key={`${user!.id}:${postId}:${id}`} owner={user!.id} id={id} postId={postId} /> : <StartDraft owner={user!.id} postId={postId} />
}

function StartDraft({ owner, postId }: { owner: number; postId: number | null }) {
  const [id] = useState(newDraftId), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), navigate = useNavigate()
  const pending = useRef<Promise<PostDraft> | undefined>(undefined)
  useEffect(() => {
    let active = true
    pending.current ??= (async () => {
      const original = postId ? (await getOwnPost(postId)).data : undefined
      const draft: PostDraft = { id, postId, title: original?.title || '', content: original?.content || '', tags: original?.tags.map(tag => tag.name) || [], version: 0, postVersion: original?.version ?? null, updatedAt: new Date().toISOString() }
      if (!writeRecovery(owner, draft, false)) {
        const { id: _id, updatedAt: _updatedAt, ...input } = draft
        return (await saveDraft(id, input)).data
      }
      return draft
    })()
    void pending.current.then(draft => { if (active) void navigate(draftLocation(draft), { replace: true }) }).catch(failure => { if (active) setError(errorMessage(failure)) })
    return () => { active = false }
  }, [owner, postId, id, attempt, navigate])
  return <Panel title={postId ? '编辑帖子' : '发表想法'}>
    {error ? <ErrorNotice error={error} retry={() => { pending.current = undefined; setError(''); setAttempt(attempt + 1) }} /> : <Loading text="正在打开草稿…" />}
  </Panel>
}

function DraftEditor({ owner, id, postId }: { owner: number; id: string; postId: number | null }) {
  const { session, state } = usePostDraft(owner, id, postId), navigate = useNavigate(), notify = useNotice()
  const tags = useResource(getTags, []), [tab, setTab] = useState('write'), [tagInput, setTagInput] = useState(''), [validation, setValidation] = useState(''), [uploading, setUploading] = useState(false)
  const draft = state.draft
  function addTag() {
    const tag = tagInput.trim()
    if (!tag) return
    if (tag.length > 32 || (draft.tags.length >= 5 && !draft.tags.includes(tag))) { setValidation('标签需为 1 至 32 个字符，最多 5 个'); return }
    if (!draft.tags.includes(tag)) session.change({ tags: [...draft.tags, tag] })
    setTagInput(''); setValidation('')
  }
  async function publish(event: FormEvent) {
    event.preventDefault()
    if (uploading || state.publishing || state.conflict) return
    if (tagInput.trim()) {
      const tag = tagInput.trim()
      if (tag.length > 32 || (draft.tags.length >= 5 && !draft.tags.includes(tag))) { setValidation('标签需为 1 至 32 个字符，最多 5 个'); return }
      if (!draft.tags.includes(tag)) session.change({ tags: [...draft.tags, tag] })
      setTagInput('')
    }
    if (!draft.title.trim() || !draft.content.trim()) { setValidation('请输入标题和正文'); return }
    setValidation('')
    const post = await session.publish()
    if (post) {
      notify(post.status && post.status !== 'PUBLISHED' ? '内容已提交，等待审核' : '内容已发布')
      void navigate(post.status && post.status !== 'PUBLISHED' ? `/me/posts/${post.id}` : `/post/${post.id}`, { replace: true })
    }
  }
  function copy() {
    try { void navigate(session.copyAsNew()) } catch (failure) { setValidation(errorMessage(failure)) }
  }
  function reopen() {
    if (!window.confirm('重新打开会载入服务端的最新草稿。当前未同步的内容将被替换，可先复制为新主题保留。')) return
    removeRecovery(owner, id); window.location.reload()
  }
  async function save() { if (await session.flush()) notify('草稿已保存') }
  return <Panel title={postId ? '编辑帖子' : '发表想法'} actions={<Link to="/me/drafts">草稿箱</Link>}>
    {state.loading && <Loading text="正在加载草稿…" />}
    <ErrorNotice error={state.loadError || validation} />
    {state.ready && state.error && <div className="alert warning" role="alert"><p>{session.statusText}</p><button type="button" onClick={() => state.conflict ? reopen() : void save()}>{state.conflict ? '重新打开草稿' : '重试保存'}</button></div>}
    {(state.conflict || state.loadError) && session.hasRecovery && <button type="button" onClick={copy}>将当前内容复制为新主题</button>}
    {state.ready && <form onSubmit={event => void publish(event)}><fieldset disabled={state.publishing}>
      <p className="muted">新帖和修改后的内容审核通过后才会公开展示。</p>
      <Field label="标题"><input value={draft.title} maxLength={160} required placeholder="用一句话描述你的主题" onChange={event => session.change({ title: event.target.value })} /></Field>
      <Field label="标签" hint="输入标签后按回车，最多 5 个，每个不超过 32 字符"><input list="community-tag-options" value={tagInput} maxLength={32} placeholder="输入或选择标签" onChange={event => setTagInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addTag() } }} /></Field>
      <datalist id="community-tag-options">{tags.data?.map(tag => <option key={tag.id} value={tag.name} />)}</datalist>
      <div className="tags editor-tags">{draft.tags.map(tag => <span className="tag" key={tag}>#{tag}<button type="button" className="tag-remove" aria-label={`移除标签 ${tag}`} onClick={() => session.change({ tags: draft.tags.filter(value => value !== tag) })}>×</button></span>)}<button type="button" onClick={addTag} disabled={!tagInput.trim()}>添加标签</button></div>
      <div className="tabs" role="tablist" aria-label="正文编辑模式"><button type="button" role="tab" aria-selected={tab === 'write'} onClick={() => setTab('write')}>正文</button><button type="button" role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')}>预览</button></div>
      {tab === 'write' ? <div>
        <ImageUploader disabled={state.publishing} onUploading={setUploading} onUploaded={url => {
          const image = `\n\n![图片](${url})\n`
          const content = session.getSnapshot().draft.content
          if (content.length + image.length > 20000) { setValidation('正文已达到长度限制，请删减后插入图片'); return }
          session.change({ content: content + image })
        }} />
        <Field label="内容"><textarea rows={16} maxLength={20000} value={draft.content} onChange={event => session.change({ content: event.target.value })} placeholder="支持 Markdown。写下你的经验、问题或想法。" /></Field>
      </div> : <section className="editor-preview" aria-label="正文预览"><MarkdownContent content={draft.content} /></section>}
      <p className="draft-status muted" role="status">{session.statusText}</p>
      <div className="actions"><button type="submit" className="primary" disabled={state.publishing || uploading || state.conflict}>{state.publishing ? '正在提交…' : postId ? '提交修改' : '提交审核'}</button><button type="button" disabled={state.publishing || state.syncing || state.conflict} onClick={() => void save()}>{state.syncing ? '正在保存…' : '保存草稿'}</button><Link className="button" to="/me/drafts">返回草稿箱</Link></div>
    </fieldset></form>}
    {!state.loading && !state.ready && <Empty action={<><button type="button" onClick={() => window.location.reload()}>重新加载</button><Link to="/me/drafts">返回草稿箱</Link></>}>暂时无法打开编辑器</Empty>}
  </Panel>
}
