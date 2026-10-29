import request from '@/utils/request'
import type { DraftInput, DraftSummary, Page, PostDraft, PostDetail } from '@/types'

export const getDrafts = (pageNo: number, size: number) => request<Page<DraftSummary>>({ url: '/me/drafts', params: { pageNo, size } })
export const getDraft = (id: string) => request<PostDraft>({ url: `/me/drafts/${id}`, quiet: true })
export const saveDraft = (id: string, data: DraftInput) => request<PostDraft>({ url: `/me/drafts/${id}`, method: 'put', data, quiet: true })
export const deleteDraft = (id: string, version: number) => request<null>({ url: `/me/drafts/${id}`, method: 'delete', data: { version }, quiet: true })
export const publishDraft = (id: string, version: number) => request<PostDetail>({ url: `/me/drafts/${id}/publish`, method: 'post', data: { version } })
