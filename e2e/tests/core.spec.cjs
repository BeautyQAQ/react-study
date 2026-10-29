const { randomUUID } = require('node:crypto')
const { test, expect } = require('../fixtures.cjs')
const {
  communityURL, adminURL, api, unique, registerUser, adminLogin, reviewPost,
  loginCommunityUI, loginAdminUI, assertNoOverflow,
} = require('../support.cjs')

const url = path => `${communityURL}/#${path}`
const draftInput = (title, tags = []) => ({ title, content: '并发保存与提交审核 🌊', tags, postId: null, postVersion: null, version: 0 })

test('不同作者并发新建草稿和使用同一新标签提交都成功且计数准确', async () => {
  const authors = [await registerUser(), await registerUser()]
  const admin = await adminLogin()
  for (let round = 0; round < 6; round++) {
    const ids = authors.map(() => randomUUID())
    const tag = unique('concurrent')
    const drafts = await Promise.all(authors.map(async (author, index) => (
      await api(communityURL, `/api/me/drafts/${ids[index]}`, {
        method: 'PUT', token: author.token, data: draftInput(`${tag}_${index}`, [tag]),
      })
    ).data))
    const posts = await Promise.all(authors.map(async (author, index) => (
      await api(communityURL, `/api/me/drafts/${ids[index]}/publish`, {
        method: 'POST', token: author.token, data: { version: drafts[index].version },
      })
    ).data))
    expect(new Set(posts.map(post => post.id)).size).toBe(2)
    for (const [index, post] of posts.entries()) {
      expect(post.status).toBe('PENDING')
      await api(communityURL, `/api/me/drafts/${ids[index]}`, { token: authors[index].token, expected: 404 })
      await api(communityURL, `/api/post/${post.id}`, { expected: 404 })
    }
    const tags = (await api(adminURL, `/api/community/tags?query=${tag}`, { token: admin })).data
    expect(tags.totalElements).toBe(1)
    expect(tags.content[0].topicCount).toBe(2)
    expect((await api(communityURL, `/api/post/list?tag=${tag}`)).data.totalElements).toBe(0)
    await Promise.all(posts.map(post => reviewPost(post.id, admin)))
    expect((await api(communityURL, `/api/post/list?tag=${tag}`)).data.totalElements).toBe(2)
  }
})

test('审核旧页面拒绝放行新正文，重新查看后才可审核，公开文章修改后再次待审', async ({ page }) => {
  const admin = await loginAdminUI(page)
  const author = await registerUser()
  const title = unique('版本审核')
  const submitted = (await api(communityURL, '/api/post/add', {
    method: 'POST', token: author.token, data: { title, content: '管理员首先看到的正文', tags: [] },
  })).data
  expect(submitted.status).toBe('PENDING')
  await api(communityURL, `/api/post/${submitted.id}`, { expected: 404 })
  await page.goto(`${adminURL}/community/posts`)
  await page.getByPlaceholder('标题或社区作者', { exact: true }).fill(title)
  const searched = page.waitForResponse(response => new URL(response.url()).pathname === '/api/community/posts' && response.request().method() === 'GET')
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  expect((await searched).status()).toBe(200)
  const row = page.locator('.el-table__body tr').filter({ hasText: title })
  await row.getByRole('button', { name: '审核', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '审核帖子', exact: true })
  await expect(dialog).toContainText('管理员首先看到的正文')
  const edited = (await api(communityURL, `/api/post/${submitted.id}`, {
    method: 'PUT', token: author.token,
    data: { title, content: '管理员尚未查看的新正文', tags: [], version: submitted.version },
  })).data
  await dialog.locator('label.el-radio').filter({ hasText: '已发布' }).click()
  await dialog.getByRole('textbox').fill('根据刚才看到的内容审核')
  const stale = page.waitForResponse(response => new URL(response.url()).pathname === `/api/community/posts/${submitted.id}/moderation` && response.request().method() === 'PUT')
  await dialog.getByRole('button', { name: '确认审核', exact: true }).click()
  const rejected = await stale
  expect(rejected.status()).toBe(409)
  expect(rejected.request().postDataJSON().version).toBe(submitted.version)
  await expect(dialog.getByRole('button', { name: '确认审核', exact: true })).toBeDisabled()
  await expect(dialog).toContainText('帖子已被修改')
  await api(communityURL, `/api/post/${submitted.id}`, { expected: 404 })
  await dialog.getByRole('button', { name: '重新载入最新内容', exact: true }).click()
  await expect(dialog).toContainText('管理员尚未查看的新正文')
  await dialog.locator('label.el-radio').filter({ hasText: '已发布' }).click()
  await dialog.getByRole('textbox').fill('已重新查看最新正文并审核')
  const accepted = page.waitForResponse(response => new URL(response.url()).pathname === `/api/community/posts/${submitted.id}/moderation` && response.request().method() === 'PUT')
  await dialog.getByRole('button', { name: '确认审核', exact: true }).click()
  const reviewed = await accepted
  expect(reviewed.status()).toBe(200)
  expect(reviewed.request().postDataJSON().version).toBe(edited.version)
  await expect(dialog).toBeHidden()
  const published = (await api(communityURL, `/api/post/${submitted.id}`)).data
  expect(published.content).toBe('管理员尚未查看的新正文')
  const resubmitted = (await api(communityURL, `/api/post/${submitted.id}`, {
    method: 'PUT', token: author.token,
    data: { title, content: '公开后的再次修改', tags: [], version: published.version },
  })).data
  expect(resubmitted.status).toBe('PENDING')
  await api(communityURL, `/api/post/${submitted.id}`, { expected: 404 })
  expect((await api(communityURL, `/api/post/list?query=${encodeURIComponent(title)}`)).data.totalElements).toBe(0)
  await reviewPost(submitted.id, admin)
  expect((await api(communityURL, `/api/post/${submitted.id}`)).data.content).toBe('公开后的再次修改')
  await assertNoOverflow(page)
})

test('浏览器回复一条回复时保留实际目标，读者收到回复通知且展示仍为一层', async ({ page }) => {
  const author = await registerUser(), reader = await registerUser()
  const submitted = (await api(communityURL, '/api/post/add', {
    method: 'POST', token: author.token, data: { title: unique('回复通知'), content: '核对回复目标', tags: [] },
  })).data
  await reviewPost(submitted.id, await adminLogin())
  const comment = async (user, content, parentId) => (await api(communityURL, `/api/post/${submitted.id}/comments`, {
    method: 'POST', token: user.token, data: { content, parentId },
  })).data
  const root = await comment(author, '作者自己的根评论')
  const reply = await comment(reader, '读者对作者的回复', root.id)
  await loginCommunityUI(page, author)
  await page.goto(url(`/post/${submitted.id}`))
  await page.locator(`#comment-${reply.id}`).getByRole('button', { name: '回复', exact: true }).click()
  const content = unique('给实际读者的回复')
  await page.getByRole('textbox', { name: '评论内容', exact: true }).fill(content)
  const sent = page.waitForResponse(response => new URL(response.url()).pathname === `/api/post/${submitted.id}/comments` && response.request().method() === 'POST')
  await page.getByRole('button', { name: '发布回复', exact: true }).click()
  const response = await sent
  expect(response.status()).toBe(200)
  expect(response.request().postDataJSON().parentId).toBe(reply.id)
  const answer = (await response.json()).data
  expect(answer.parentId).toBe(root.id)
  await expect(page.locator(`#comment-${answer.id}`)).toContainText(content)
  const notifications = (await api(communityURL, '/api/notifications', { token: reader.token })).data.content
  expect(notifications.filter(notice => notice.type === 'REPLY' && notice.commentId === answer.id && notice.content === content)).toHaveLength(1)
  await assertNoOverflow(page)
})
