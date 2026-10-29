import { afterEach, describe, expect, test, vi } from 'vitest'
import { PostDraftSession } from './PostDraft'
import { localDrafts, newDraftId, readRecovery, writeRecovery } from '@/utils/drafts'
import type { DraftInput, PostDetail, PostDraft } from '@/types'
import type { ApiResult } from '@/utils/request'

const ok = <T,>(data: T): ApiResult<T> => ({ code: 200, message: '', data })
const httpError = (status: number, message: string) => Object.assign(new Error(message), { isAxiosError: true, response: { status, data: { message } } })
const sessions: PostDraftSession[] = []
const owner = 42
const basePost: PostDetail = { id: 7, userId: owner, username: 'author', alias: '作者', avatar: '', title: '主题', content: '正文', view: 0, createTime: '2026-10-29T10:00:00Z', modifyTime: '2026-10-29T10:00:00Z', tags: [], top: false, essence: false, version: 1, status: 'PENDING' }

function backend(id: string, initial?: PostDraft) {
  let remote = initial
  const api = {
    getDraft: vi.fn(async (_id: string) => {
      if (!remote) throw httpError(404, '草稿不存在')
      return ok({ ...remote, tags: [...remote.tags] })
    }),
    getOwnPost: vi.fn(async (_id: string | number) => ok(basePost)),
    saveDraft: vi.fn(async (_id: string, input: DraftInput) => {
      if (input.version !== (remote?.version ?? 0)) throw httpError(409, '草稿已在其他页面更新')
      remote = { ...input, tags: [...input.tags], id, version: input.version + 1, updatedAt: new Date().toISOString() }
      return ok({ ...remote })
    }),
    publishDraft: vi.fn(async (_id: string, version: number) => {
      if (!remote || version !== remote.version) throw httpError(409, '草稿版本已改变')
      const post = { ...basePost, title: remote.title, content: remote.content }
      remote = undefined
      return ok(post)
    }),
  }
  return { api, get: () => remote, set: (draft: PostDraft) => { remote = draft } }
}
async function open({ id = newDraftId(), initial, owns = () => true, service }: { id?: string; initial?: PostDraft; owns?: () => boolean; service?: ReturnType<typeof backend> } = {}) {
  if (!readRecovery(owner, id) && !initial) {
    writeRecovery(owner, { id, title: '', content: '', tags: [], postId: null, postVersion: null, version: 0, updatedAt: new Date().toISOString() }, false)
  }
  const server = service || backend(id, initial)
  const session = new PostDraftSession(owner, id, null, owns, server.api)
  sessions.push(session); session.start()
  await vi.waitFor(() => expect(session.getSnapshot().loading).toBe(false))
  return { session, server, id }
}
afterEach(() => { sessions.splice(0).forEach(session => session.stop()); localStorage.clear(); vi.restoreAllMocks() })

describe('private post drafts', () => {
  test('writes every input immediately to an account-scoped recovery copy', async () => {
    const { session, server, id } = await open()
    session.change({ title: '尚未同步的标题', content: '刷新前刚输入的内容 🌊' })
    expect(readRecovery(owner, id)?.draft.content).toBe('刷新前刚输入的内容 🌊')
    expect(readRecovery(owner, id)?.dirty).toBe(true)
    expect(readRecovery(owner + 1, id)).toBeUndefined()
    expect(localDrafts(owner + 1)).toEqual([])
    expect(server.api.saveDraft).not.toHaveBeenCalled()
  })

  test('serializes saves and flushes typing that arrives during a request', async () => {
    const { session, server } = await open()
    const original = server.api.saveDraft.getMockImplementation()!
    let release!: () => void, first = true
    server.api.saveDraft.mockImplementation(async (id, input) => {
      if (first) { first = false; await new Promise<void>(resolve => { release = resolve }) }
      return original(id, input)
    })
    session.change({ title: '第一批输入' })
    const pending = session.flush()
    expect(server.api.saveDraft).toHaveBeenCalledTimes(1)
    session.change({ content: '请求期间新输入的正文' })
    release()
    expect(await pending).toBe(true)
    expect(server.api.saveDraft).toHaveBeenCalledTimes(2)
    expect(server.api.saveDraft.mock.calls[1][1].version).toBe(1)
    expect(server.get()?.content).toBe('请求期间新输入的正文')
    expect(session.dirty).toBe(false)
  })

  test('keeps local edits on a version conflict and copies them into a new draft', async () => {
    const { session, server, id } = await open()
    session.change({ title: '本页标题', content: '需要保留的本页正文' })
    server.set({ ...session.getSnapshot().draft, content: '另一页面的正文', version: 1 })
    expect(await session.flush()).toBe(false)
    expect(session.getSnapshot().conflict).toBe(true)
    expect(session.getSnapshot().draft.content).toBe('需要保留的本页正文')
    expect(server.get()?.content).toBe('另一页面的正文')
    expect(readRecovery(owner, id)?.draft.content).toBe('需要保留的本页正文')
    const location = session.copyAsNew(), nextId = new URLSearchParams(location.split('?')[1]).get('draft')!
    expect(nextId).not.toBe(id)
    expect(readRecovery(owner, nextId)?.draft).toMatchObject({ title: '本页标题', content: '需要保留的本页正文', version: 0, postId: null, postVersion: null })
  })

  test('recovers unsynced input after a failed save and a reload, then synchronizes it', async () => {
    const first = await open()
    first.server.api.saveDraft.mockRejectedValueOnce(new Error('offline'))
    first.session.change({ content: '断网时的完整正文' })
    expect(await first.session.flush()).toBe(false)
    first.session.stop()
    const next = await open({ id: first.id, service: first.server })
    expect(next.session.getSnapshot().draft.content).toBe('断网时的完整正文')
    expect(await next.session.flush()).toBe(true)
    expect(next.server.get()?.content).toBe('断网时的完整正文')
    expect(readRecovery(owner, first.id)?.dirty).toBe(false)
  })

  test('refuses to mutate or synchronize after the current account changes', async () => {
    let owns = true
    const { session, server, id } = await open({ owns: () => owns })
    session.change({ content: '原账号的输入' })
    owns = false
    session.change({ content: '另一账号的输入' })
    expect(await session.flush()).toBe(false)
    expect(server.api.saveDraft).not.toHaveBeenCalled()
    expect(readRecovery(owner, id)?.draft.content).toBe('原账号的输入')
  })

  test('recognizes a committed save after its response was lost without reporting a false conflict', async () => {
    const { session, server, id } = await open()
    const save = server.api.saveDraft.getMockImplementation()!
    server.api.saveDraft.mockImplementationOnce(async (key, input) => {
      await save(key, input)
      throw new Error('response lost')
    })
    session.change({ content: '服务器已保存但响应丢失的内容' })
    expect(await session.flush()).toBe(false)
    expect(session.getSnapshot().draft.version).toBe(0)
    expect(server.get()?.version).toBe(1)
    expect(await session.flush()).toBe(true)
    expect(session.getSnapshot()).toMatchObject({ conflict: false, error: '', draft: { version: 1 } })
    expect(server.get()?.version).toBe(1)
    expect(readRecovery(owner, id)?.dirty).toBe(false)
  })

  test('publishes once, using the latest saved version, and removes its recovery copy', async () => {
    const { session, server, id } = await open()
    session.change({ title: '提交审核', content: '最新输入的内容' })
    const [first, second] = await Promise.all([session.publish(), session.publish()])
    expect(first).toMatchObject({ title: '提交审核', content: '最新输入的内容', status: 'PENDING' })
    expect(second).toBeUndefined()
    expect(server.api.publishDraft).toHaveBeenCalledExactlyOnceWith(id, 1)
    expect(readRecovery(owner, id)).toBeUndefined()
    expect(await session.publish()).toBeUndefined()
    expect(server.api.publishDraft).toHaveBeenCalledTimes(1)
  })

  test('does not recreate a deleted or published server draft from an old browser copy', async () => {
    const id = newDraftId(), service = backend(id)
    writeRecovery(owner, { id, title: '旧草稿', content: '仍需保留的正文', tags: [], postId: null, postVersion: null, version: 3, updatedAt: new Date().toISOString() }, true)
    const { session } = await open({ id, service })
    expect(session.getSnapshot().ready).toBe(false)
    expect(session.getSnapshot().loadError).toContain('已删除或已发布')
    expect(await session.flush()).toBe(false)
    expect(service.api.saveDraft).not.toHaveBeenCalled()
    expect(session.hasRecovery).toBe(true)
    expect(session.copyAsNew()).toMatch(/^\/post\/create\?draft=/)
  })
})
