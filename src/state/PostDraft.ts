import { getOwnPost } from '@/api/social'
import { getDraft, publishDraft, saveDraft } from '@/api/drafts'
import { draftError, draftLocation, httpStatus, isDraftId, newDraftId, readRecovery, removeRecovery, writeRecovery } from '@/utils/drafts'
import { formatDate } from '@/utils/format'
import type { DraftInput, PostDraft } from '@/types'

const defaultApi = { getOwnPost, getDraft, publishDraft, saveDraft }
export const fingerprint = (draft: Omit<DraftInput, 'version'>) => JSON.stringify([draft.title, draft.content, draft.tags, draft.postId, draft.postVersion])
export interface DraftState {
  draft: PostDraft; loading: boolean; ready: boolean; syncing: boolean; publishing: boolean
  error: string; loadError: string; conflict: boolean; localSaved: boolean; redirect: string
}

export class PostDraftSession {
  private state: DraftState
  private listeners = new Set<() => void>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private inFlight: Promise<boolean> | undefined
  private savedFingerprint = ''
  private recovery: PostDraft | undefined
  private active = false
  private epoch = 0
  private published = false
  constructor(readonly owner: number, readonly id: string, readonly postId: number | null,
    private ownsAccount: () => boolean, private api = defaultApi) {
    this.state = {
      draft: { id, postId, postVersion: null, title: '', content: '', tags: [], version: 0, updatedAt: new Date().toISOString() },
      loading: true, ready: false, syncing: false, publishing: false, error: '', loadError: '', conflict: false, localSaved: false, redirect: '',
    }
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private patch(change: Partial<DraftState>) { this.state = { ...this.state, ...change }; this.listeners.forEach(listener => listener()) }
  get dirty() { return fingerprint(this.state.draft) !== this.savedFingerprint }
  get shouldBlock() { return this.active && this.ownsAccount() && this.state.ready && !this.published && (this.dirty || this.state.syncing || this.state.publishing) }
  get hasRecovery() {
    const draft = this.state.ready ? this.state.draft : this.recovery
    return Boolean(draft && (draft.title || draft.content || draft.tags.length))
  }
  get statusText() {
    const state = this.state
    if (state.error) return state.error + (state.localSaved ? '；内容已保留在此浏览器' : '；请保留当前页面')
    if (state.syncing) return '正在保存草稿…'
    if (this.dirty && state.localSaved) return '已保存在此浏览器，等待同步'
    return state.draft.version ? `草稿已保存 ${formatDate(state.draft.updatedAt, true)}` : '输入内容后会自动保存草稿'
  }
  private input(): DraftInput {
    const draft = this.state.draft
    return { title: draft.title, content: draft.content, tags: [...draft.tags], postId: draft.postId, postVersion: draft.postVersion, version: draft.version }
  }
  private cache() {
    const draft = { ...this.state.draft, updatedAt: new Date().toISOString() }
    this.patch({ localSaved: writeRecovery(this.owner, draft, this.dirty) })
  }
  private acceptSave(sent: DraftInput, saved: PostDraft) {
    this.savedFingerprint = fingerprint(sent)
    this.patch({ draft: { ...this.state.draft, version: saved.version, updatedAt: saved.updatedAt }, error: '' })
    this.cache()
  }
  start() {
    this.active = true
    if (this.state.ready) { if (this.dirty) this.schedule(); return }
    const ticket = ++this.epoch
    void this.initialize(ticket)
  }
  stop() {
    this.active = false; this.epoch++; clearTimeout(this.timer)
    if (this.state.ready && !this.dirty && this.state.draft.version === 0 && !this.published) removeRecovery(this.owner, this.id)
  }
  private async initialize(ticket: number) {
    const current = () => this.active && ticket === this.epoch && this.ownsAccount()
    try {
      if (!isDraftId(this.id)) { this.patch({ loadError: '草稿地址不正确，请返回草稿箱重新打开' }); return }
      const cached = readRecovery(this.owner, this.id)
      this.recovery = cached?.draft
      let remote: PostDraft | undefined, error = ''
      try { remote = (await this.api.getDraft(this.id)).data }
      catch (failure) {
        if (!current()) return
        if (httpStatus(failure) === 404 && cached?.draft.version !== 0) {
          this.patch({ loadError: '草稿已删除或已发布。你可以将保留的内容复制为新主题' }); return
        }
        if (!cached) { this.patch({ loadError: draftError(failure) }); return }
        if (httpStatus(failure) !== 404) error = draftError(failure)
      }
      if (!current()) return
      const selected = cached && (cached.dirty || !remote) ? cached.draft : remote!
      if (selected.postId !== this.postId) { this.patch({ redirect: draftLocation(selected) }); return }
      if (this.postId) await this.api.getOwnPost(this.postId)
      if (!current()) return
      const conflict = Boolean(remote && cached?.dirty && remote.version !== cached.draft.version && fingerprint(remote) !== fingerprint(cached.draft))
      if (conflict) error = '草稿已在其他页面更新，请重新打开，或将当前内容复制为新主题'
      this.savedFingerprint = remote ? fingerprint(remote) : cached?.dirty ? '' : fingerprint(selected)
      this.patch({
        draft: { ...selected, tags: [...selected.tags], version: conflict ? selected.version : remote?.version ?? selected.version, updatedAt: remote?.updatedAt ?? selected.updatedAt },
        ready: true, conflict, error,
      })
      this.cache()
      if (cached?.dirty && !conflict) this.schedule()
    } catch (failure) { if (current()) this.patch({ loadError: draftError(failure) }) }
    finally { if (current()) this.patch({ loading: false }) }
  }
  change(change: Partial<Pick<PostDraft, 'title' | 'content' | 'tags'>>) {
    if (!this.state.ready || this.state.publishing || !this.active || !this.ownsAccount()) return
    this.patch({ draft: { ...this.state.draft, ...change, tags: change.tags ? [...change.tags] : this.state.draft.tags } })
    this.cache(); this.schedule()
  }
  private schedule() {
    clearTimeout(this.timer)
    if (!this.active || this.state.conflict) return
    this.timer = setTimeout(() => {
      void this.persist().then(ok => { if (ok && this.dirty && this.active) this.schedule() })
    }, 1000)
  }
  async persist(): Promise<boolean> {
    clearTimeout(this.timer)
    if (this.inFlight) return this.inFlight
    if (!this.active || !this.ownsAccount() || !this.state.ready || this.state.conflict) return false
    if (!this.dirty && this.state.draft.version > 0 && !this.state.error) return true
    const sent = this.input()
    this.patch({ syncing: true })
    this.inFlight = (async () => {
      try {
        const { data } = await this.api.saveDraft(this.id, sent)
        this.acceptSave(sent, data)
        return true
      } catch (failure) {
        if (httpStatus(failure) === 409 && this.ownsAccount()) {
          // The server may have committed a save whose response was lost on reload.
          try {
            const { data } = await this.api.getDraft(this.id)
            if (fingerprint(data) === fingerprint(sent)) {
              this.acceptSave(sent, data)
              return true
            }
          } catch { /* Preserve local input and report the original conflict. */ }
        }
        this.patch({ error: draftError(failure), conflict: [404, 409].includes(httpStatus(failure) || 0) })
        this.cache()
        return false
      } finally { this.inFlight = undefined; this.patch({ syncing: false }) }
    })()
    return this.inFlight
  }
  async flush(): Promise<boolean> {
    const ok = await this.persist()
    return ok && this.dirty && this.active && this.ownsAccount() ? this.flush() : ok
  }
  async publish() {
    if (this.state.publishing || this.published || this.state.conflict || !this.ownsAccount()) return
    this.patch({ publishing: true })
    try {
      if (!await this.flush()) return
      const { data } = await this.api.publishDraft(this.id, this.state.draft.version)
      this.published = true
      removeRecovery(this.owner, this.id)
      return this.active && this.ownsAccount() ? data : undefined
    } catch (failure) {
      this.patch({ error: draftError(failure), conflict: [404, 409].includes(httpStatus(failure) || 0) })
      this.cache()
    } finally { this.patch({ publishing: false }) }
  }
  copyAsNew() {
    const source = this.state.ready ? this.state.draft : this.recovery
    if (!source || !this.ownsAccount()) throw new Error('当前没有可复制的内容')
    const fresh: PostDraft = { ...source, tags: [...source.tags], id: newDraftId(), postId: null, postVersion: null, version: 0, updatedAt: new Date().toISOString() }
    if (!writeRecovery(this.owner, fresh, true)) throw new Error('无法保存恢复副本，请先复制正文保留内容')
    return draftLocation(fresh)
  }
}
