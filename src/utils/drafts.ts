import axios from 'axios'
import type { DraftSummary, PostDraft } from '@/types'

const prefix = 'liushao:react:post-draft:1:'
export const isDraftId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
export function newDraftId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 15) | 64; bytes[8] = (bytes[8]! & 63) | 128
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
export const httpStatus = (error: unknown) => axios.isAxiosError(error) ? error.response?.status : undefined
export const draftError = (error: unknown) => axios.isAxiosError<{ message: string }>(error) ? error.response?.data?.message || '暂时无法同步草稿，请重试' : '暂时无法同步草稿，请重试'
export interface DraftRecovery { draft: PostDraft; dirty: boolean }
const key = (owner: number, id: string) => `${prefix}${owner}:${id}`

function valid(value: unknown): value is DraftRecovery {
  if (!value || typeof value !== 'object' || !('draft' in value) || !('dirty' in value)) return false
  const { draft, dirty } = value as DraftRecovery
  return typeof dirty === 'boolean' && !!draft && isDraftId(draft.id)
    && typeof draft.title === 'string' && draft.title.length <= 160
    && typeof draft.content === 'string' && draft.content.length <= 20000
    && Array.isArray(draft.tags) && draft.tags.length <= 5 && draft.tags.every(tag => typeof tag === 'string' && tag.length <= 20000)
    && Number.isSafeInteger(draft.version) && draft.version >= 0
    && (draft.postId === null || (Number.isSafeInteger(draft.postId) && draft.postId > 0))
    && (draft.postVersion === null || (Number.isSafeInteger(draft.postVersion) && draft.postVersion >= 0))
    && typeof draft.updatedAt === 'string' && Number.isFinite(Date.parse(draft.updatedAt))
}
export function readRecovery(owner: number, id: string): DraftRecovery | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(owner, id)) || 'null')
    return valid(value) && value.draft.id === id ? value : undefined
  } catch { return undefined }
}
export function writeRecovery(owner: number, draft: PostDraft, dirty: boolean): boolean {
  try { localStorage.setItem(key(owner, draft.id), JSON.stringify({ draft, dirty })); return true }
  catch { return false }
}
export function removeRecovery(owner: number, id: string) {
  try { localStorage.removeItem(key(owner, id)) } catch { /* The server copy remains authoritative. */ }
}
export function localDrafts(owner: number): DraftSummary[] {
  const result: DraftSummary[] = []
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const name = localStorage.key(index)
      if (!name?.startsWith(`${prefix}${owner}:`)) continue
      const saved = readRecovery(owner, name.slice(`${prefix}${owner}:`.length))
      if (!saved?.dirty) continue
      const draft = saved.draft
      result.push({ id: draft.id, postId: draft.postId, title: draft.title, excerpt: draft.content.slice(0, 160), version: draft.version, updatedAt: draft.updatedAt, localOnly: true })
    }
  } catch { /* A storage restriction must not hide server drafts. */ }
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
export const draftLocation = (draft: Pick<PostDraft, 'id' | 'postId'>) => `${draft.postId ? `/post/${draft.postId}/edit` : '/post/create'}?draft=${encodeURIComponent(draft.id)}`
