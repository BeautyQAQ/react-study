const { test, expect, observeContext } = require('../fixtures.cjs')
const {
  communityURL, unique, api, registerUser, loginCommunityUI, adminLogin, reviewPost, emailCode, tinyPng, assertNoOverflow, draftPublishPath,
} = require('../support.cjs')

const url = path => `${communityURL}/#${path}`
const matches = (response, path, method) =>
  new URL(response.url()).pathname === path && response.request().method() === method

// Observe the real request caused by a browser action, so failed mutations cannot
// pass merely because an old success message or an optimistic UI is visible.
async function mutate(page, path, action, method = 'POST') {
  const pending = page.waitForResponse(response => matches(response, path, method))
  await action()
  const response = await pending
  expect(response.status(), `${method} ${path}`).toBe(200)
  const result = await response.json()
  expect(result.code).toBe(200)
  return result.data
}

async function signIn(page, user) {
  return loginCommunityUI(page, user)
}

async function publish(page, title, content) {
  await page.goto(url('/post/create'))
  await page.getByLabel('标题', { exact: true }).fill(title)
  await page.getByLabel('内容', { exact: true }).fill(content)
  const post = await mutate(page, draftPublishPath(page), () => page.getByRole('button', { name: '提交审核', exact: true }).click())
  await expect(page).toHaveURL(new RegExp(`#/me/posts/${post.id}$`))
  expect(post.status).toBe('PENDING')
  await api(communityURL, `/api/post/${post.id}`, { expected: 404 })
  const reviewed = await reviewPost(post.id, await adminLogin())
  await page.goto(url(`/post/${post.id}`))
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  return reviewed
}

async function revealNavigation(page) {
  const toggle = page.getByRole('button', { name: '展开导航', exact: true })
  if (await toggle.isVisible()) await toggle.click()
}

test.describe('社区真实业务闭环', () => {
  test.setTimeout(180_000)

  test('浏览器注册、登录、Markdown 图片发布、编辑与搜索', async ({ page }) => {
    const username = unique('publish')
    const user = { username, password: `Publish_${unique()}_9a`, email: `${username}@example.test` }
    await page.goto(url('/register'))
    await page.getByLabel('账号', { exact: true }).fill(user.username)
    await page.getByLabel('密码', { exact: true }).fill(user.password)
    await page.getByLabel('确认密码', { exact: true }).fill(user.password)
    await page.getByLabel('邮箱', { exact: true }).fill(user.email)
    const registered = await mutate(page, '/api/ums/user/register', () => page.getByRole('button', { name: '立即注册', exact: true }).click())
    expect(registered.username).toBe(user.username)
    await expect(page).toHaveURL(/#\/login$/)
    const session = await signIn(page, user)

    const title = `发布验收 ${unique('topic')}`
    const tag = unique('tag')
    const heading = `正文标题 ${unique('markdown')}`
    await page.goto(url('/post/create'))
    await page.getByLabel('标题', { exact: true }).fill(title)
    await page.getByRole('combobox').fill(tag)
    await page.getByRole('combobox').press('Enter')
    await page.getByLabel('内容', { exact: true }).fill(
      `# ${heading}\n\n**加粗内容** 与中文 emoji 🌊\n\n<script>window.__e2eUnsafe = true</script>\n<a href="javascript:window.__e2eUnsafe=true">安全清理检查</a>`,
    )
    const image = await mutate(page, '/api/uploads/image', () => page.locator('input[type="file"]').setInputFiles({ name: 'post.png', mimeType: 'image/png', buffer: tinyPng }))
    expect(image.url).toMatch(/^\/uploads\/[\da-f-]+\.png$/)
    await expect(page.getByLabel('内容', { exact: true })).toHaveValue(new RegExp(image.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    await page.getByRole('tab', { name: '预览', exact: true }).click()
    await expect(page.locator('.markdown-content').getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await expect(page.locator('.markdown-content strong')).toHaveText('加粗内容')
    await expect(page.locator('.markdown-content script, .markdown-content [href^="javascript:"]')).toHaveCount(0)
    expect(await page.evaluate(() => window.__e2eUnsafe)).toBeUndefined()
    const previewImage = page.locator('.markdown-content img')
    await expect(previewImage).toBeVisible()
    await previewImage.scrollIntoViewIfNeeded()
    await expect.poll(() => previewImage.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true)

    const post = await mutate(page, draftPublishPath(page), () => page.getByRole('button', { name: '提交审核', exact: true }).click())
    await expect(page).toHaveURL(new RegExp(`#/me/posts/${post.id}$`))
    expect(post.status).toBe('PENDING')
    await api(communityURL, `/api/post/${post.id}`, { expected: 404 })
    expect((await api(communityURL, `/api/post/list?query=${encodeURIComponent(title)}`)).data.totalElements).toBe(0)
    const admin = await adminLogin()
    await reviewPost(post.id, admin)
    await page.goto(url(`/post/${post.id}`))
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(page.locator('.markdown-content img')).toHaveAttribute('src', `/api${image.url}`)
    await expect(page.locator('.markdown-content script, .markdown-content [href^="javascript:"]')).toHaveCount(0)
    await assertNoOverflow(page)

    await page.getByRole('link', { name: '编辑', exact: true }).click()
    const editedTitle = `${title} 已编辑`
    await page.getByLabel('标题', { exact: true }).fill(editedTitle)
    const draft = await page.getByLabel('内容', { exact: true }).inputValue()
    await page.getByLabel('内容', { exact: true }).fill(`${draft}\n\n编辑后保留图片与标签。`)
    const updated = await mutate(page, draftPublishPath(page), () => page.getByRole('button', { name: '提交修改', exact: true }).click())
    await expect(page).toHaveURL(new RegExp(`#/me/posts/${post.id}$`))
    expect(updated.status).toBe('PENDING')
    await api(communityURL, `/api/post/${post.id}`, { expected: 404 })
    await expect(page.getByRole('heading', { name: editedTitle, exact: true })).toBeVisible()
    expect(updated.version).toBeGreaterThan(post.version)
    await api(communityURL, `/api/post/${post.id}`, { method: 'PUT', token: session.token, data: { title, content: draft, tags: [tag], version: post.version }, expected: 409 })
    await api(communityURL, '/api/post/add', { method: 'POST', data: { title: '未登录发帖', content: '拒绝未登录写入', tags: [] }, expected: 401 })
    await reviewPost(post.id, admin)
    await page.goto(url(`/post/${post.id}`))

    await revealNavigation(page)
    const search = page.getByRole('searchbox', { name: '搜索标题、正文、标签或作者' })
    await search.fill(editedTitle)
    await search.press('Enter')
    await expect(page.getByRole('link', { name: editedTitle, exact: true })).toBeVisible()
    await assertNoOverflow(page)
    await page.getByRole('link', { name: editedTitle, exact: true }).click()
    await page.getByRole('link', { name: `#${tag}`, exact: true }).click()
    await expect(page.getByRole('heading', { name: `标签：${tag}`, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: editedTitle, exact: true })).toBeVisible()
    const stored = await api(communityURL, `/api/post/${post.id}`, {})
    expect(stored.data.tags.map(item => item.name)).toContain(tag)
    expect(stored.data.content).toContain(image.url)
  })

  test('头像归属、两用户互动、关注通知及私信隔离', async ({ page, browser }) => {
    const author = await registerUser()
    const reader = await registerUser()
    const observer = await registerUser()
    const otherContext = await browser.newContext({ viewport: page.viewportSize(), locale: 'zh-CN' })
    const assertOtherHealthy = observeContext(otherContext)
    const other = await otherContext.newPage()
    try {
      await signIn(page, author)
      await page.goto(url(`/member/${author.username}/setting`))
      const avatarSaved = page.waitForResponse(response => matches(response, '/api/ums/user/avatar', 'POST'))
      const uploaded = await mutate(page, '/api/uploads/image', () => page.locator('input[type="file"]').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: tinyPng }))
      expect((await avatarSaved).status()).toBe(200)
      await expect(page.locator('.avatar-editor img')).toHaveAttribute('src', `/api${uploaded.url}`)
      await expect.poll(async () => (await api(communityURL, '/api/ums/user/info', { token: author.token })).data.avatar).toBe(uploaded.url)
      await api(communityURL, '/api/ums/user/avatar', { method: 'POST', token: reader.token, data: { url: uploaded.url }, expected: 403 })
      expect((await api(communityURL, '/api/ums/user/info', { token: reader.token })).data.avatar).not.toBe(uploaded.url)
      await assertNoOverflow(page)

      const post = await publish(page, `互动验收 ${unique('social')}`, '这里是公开主题，欢迎评论与交流。')
      await signIn(other, reader)
      await other.goto(url(`/post/${post.id}`))
      await expect(other.getByRole('link', { name: '编辑', exact: true })).toHaveCount(0)
      await api(communityURL, `/api/post/${post.id}`, { method: 'PUT', token: reader.token, data: { title: '越权修改', content: '不应写入', tags: [], version: post.version }, expected: 403 })
      await api(communityURL, `/api/post/${post.id}`, { method: 'DELETE', token: reader.token, expected: 403 })

      const commentText = `评论 ${unique('comment')} <b>保持纯文本</b>`
      await other.getByRole('textbox', { name: '评论内容' }).fill(commentText)
      const comment = await mutate(other, `/api/post/${post.id}/comments`, () => other.getByRole('button', { name: '发表评论', exact: true }).click())
      const rootComment = other.locator(`#comment-${comment.id}`)
      await expect(rootComment.locator('.plain-content')).toHaveText(commentText)
      await expect(rootComment.locator('.plain-content b')).toHaveCount(0)

      await page.reload()
      await page.locator(`#comment-${comment.id}`).getByRole('button', { name: '回复', exact: true }).click()
      const replyText = `作者回复 ${unique('reply')}`
      await page.getByRole('textbox', { name: '评论内容' }).fill(replyText)
      const reply = await mutate(page, `/api/post/${post.id}/comments`, () => page.getByRole('button', { name: '发布回复', exact: true }).click())
      expect(reply.parentId).toBe(comment.id)
      await expect(page.locator(`#comment-${reply.id}`)).toContainText(replyText)
      await api(communityURL, `/api/comments/${comment.id}`, { method: 'DELETE', token: author.token, expected: 403 })
      await api(communityURL, `/api/comments/${reply.id}`, { method: 'DELETE', token: reader.token, expected: 403 })

      await mutate(other, `/api/post/${post.id}/like`, () => other.getByRole('button', { name: /^点赞\s+0$/ }).click())
      await expect(other.getByRole('button', { name: /^已点赞\s+1$/ })).toBeVisible()
      await mutate(other, `/api/post/${post.id}/bookmark`, () => other.getByRole('button', { name: /^收藏\s+0$/ }).click())
      await expect(other.getByRole('button', { name: /^已收藏\s+1$/ })).toBeVisible()
      const repeatedLike = await api(communityURL, `/api/post/${post.id}/like`, { method: 'POST', token: reader.token })
      const repeatedBookmark = await api(communityURL, `/api/post/${post.id}/bookmark`, { method: 'POST', token: reader.token })
      expect(repeatedLike.data.likes).toBe(1)
      expect(repeatedBookmark.data.bookmarks).toBe(1)
      expect(repeatedBookmark.data.comments).toBe(2)
      await other.goto(url('/me/bookmarks'))
      await expect(other.getByRole('link', { name: post.title, exact: true })).toBeVisible()

      await other.goto(url(`/member/${author.username}/home`))
      await mutate(other, `/api/users/${author.username}/follow`, () => other.getByRole('button', { name: '关注', exact: true }).click())
      await expect(other.getByRole('button', { name: '已关注 · 取消', exact: true })).toBeVisible()
      expect((await api(communityURL, `/api/users/${author.username}/follow`, { method: 'POST', token: reader.token })).data.followers).toBe(1)
      await api(communityURL, `/api/users/${reader.username}/follow`, { method: 'POST', token: reader.token, expected: 400 })
      await other.goto(url('/me/following'))
      await expect(other.locator('.member-row').filter({ hasText: `@${author.username}` })).toBeVisible()
      await page.goto(url('/me/followers'))
      await expect(page.locator('.member-row').filter({ hasText: `@${reader.username}` })).toBeVisible()

      await page.goto(url('/notifications'))
      await expect(page.getByRole('heading', { name: /通知中心/ })).toBeVisible()
      const notifications = (await api(communityURL, '/api/notifications', { token: author.token })).data.content
      expect(notifications.map(item => item.type)).toEqual(expect.arrayContaining(['COMMENT', 'LIKE', 'FOLLOW']))
      expect(notifications.filter(item => item.type === 'LIKE')).toHaveLength(1)
      await api(communityURL, `/api/notifications/${notifications[0].id}/read`, { method: 'POST', token: reader.token, expected: 404 })
      await mutate(page, `/api/notifications/${notifications[0].id}/read`, () => page.locator('.notification-row').first().getByRole('button', { name: '标为已读', exact: true }).click())
      await mutate(page, '/api/notifications/read-all', () => page.getByRole('button', { name: '全部标为已读', exact: true }).click())
      await expect.poll(async () => (await api(communityURL, '/api/notifications/unread', { token: author.token })).data.count).toBe(0)
      await assertNoOverflow(page)

      await other.goto(url(`/member/${author.username}/home`))
      await other.getByRole('link', { name: '发私信', exact: true }).click()
      const secret = `私信 ${unique('private')} <b>纯文本</b>`
      await other.getByRole('textbox', { name: '私信内容' }).fill(secret)
      await mutate(other, '/api/messages', () => other.getByRole('button', { name: '发送私信', exact: true }).click())
      await expect(other.locator('.bubble p')).toHaveText(secret)
      await expect(other.locator('.bubble b')).toHaveCount(0)
      expect((await api(communityURL, '/api/messages/unread', { token: author.token })).data.count).toBe(1)
      await api(communityURL, `/api/messages?username=${author.username}`, { expected: 401 })
      const foreignHistory = await api(communityURL, `/api/messages?username=${author.username}`, { token: observer.token })
      expect(foreignHistory.data.content).toEqual([])
      expect((await api(communityURL, '/api/messages/conversations', { token: observer.token })).data.content).toEqual([])
      await api(communityURL, '/api/messages/read', { method: 'POST', token: observer.token, data: { username: reader.username } })
      expect((await api(communityURL, '/api/messages/unread', { token: author.token })).data.count).toBe(1)

      await page.bringToFront()
      await page.goto(url('/messages'))
      const conversation = page.locator('a.conversation').filter({ hasText: secret })
      await expect(conversation).toBeVisible()
      await conversation.click()
      await expect(page.locator('.bubble p')).toHaveText(secret)
      await expect.poll(async () => (await api(communityURL, '/api/messages/unread', { token: author.token })).data.count).toBe(0)
      const answer = `回复私信 ${unique('answer')}`
      await page.getByRole('textbox', { name: '私信内容' }).fill(answer)
      await mutate(page, '/api/messages', () => page.getByRole('button', { name: '发送私信', exact: true }).click())
      await other.bringToFront()
      await other.reload()
      await expect(other.locator('.bubble p').filter({ hasText: answer })).toBeVisible()
      await expect.poll(async () => (await api(communityURL, '/api/messages/unread', { token: reader.token })).data.count).toBe(0)
      await assertNoOverflow(page)
      await assertNoOverflow(other)

      // The owner can delete the root comment, including its associated reply.
      await other.goto(url(`/post/${post.id}`))
      other.once('dialog', dialog => dialog.accept())
      await mutate(other, `/api/comments/${comment.id}`, () => other.locator(`#comment-${comment.id}`).getByRole('button', { name: '删除', exact: true }).click(), 'DELETE')
      await expect(other.locator(`#comment-${comment.id}, #comment-${reply.id}`)).toHaveCount(0)
      expect((await api(communityURL, `/api/post/${post.id}/interaction`, { token: reader.token })).data.comments).toBe(0)
    } finally {
      await otherContext.close()
      assertOtherHealthy()
    }
  })

  test('真实邮件验证与找回密码、一次性验证码和旧会话失效', async ({ page }) => {
    const user = await registerUser()
    const session = await signIn(page, user)
    await page.goto(url(`/member/${user.username}/setting`))
    await mutate(page, '/api/ums/user/email/send', () => page.getByRole('button', { name: '发送验证邮件', exact: true }).click())
    const verification = await emailCode(user.email, 'verify')
    await page.getByLabel('邮箱验证码', { exact: true }).fill(verification)
    await mutate(page, '/api/ums/user/email/verify', () => page.getByRole('button', { name: '验证邮箱', exact: true }).click())
    await expect(page.getByText('已验证', { exact: true })).toBeVisible()
    expect((await api(communityURL, '/api/ums/user/info', { token: session.token })).data.active).toBe(true)
    await api(communityURL, '/api/ums/user/email/verify', { method: 'POST', token: session.token, data: { code: verification }, expected: 400 })

    await page.goto(url('/password/forgot'))
    await page.getByLabel('注册邮箱', { exact: true }).fill(user.email)
    const knownRequest = page.waitForResponse(response => matches(response, '/api/ums/user/password/forgot', 'POST'))
    await mutate(page, '/api/ums/user/password/forgot', () => page.getByRole('button', { name: '发送验证码', exact: true }).click())
    await expect(page.getByText('如果该邮箱对应可用账号，验证码将发送到邮箱，请检查收件箱。', { exact: true })).toBeVisible()
    const unknownResponse = await api(communityURL, '/api/ums/user/password/forgot', { method: 'POST', data: { email: `${unique('unknown')}@example.test` } })
    expect(unknownResponse).toEqual(await (await knownRequest).json())
    const resetCode = await emailCode(user.email, 'reset')
    const newPassword = `Reset_${unique()}_8b`
    await page.getByLabel('邮箱验证码', { exact: true }).fill(resetCode)
    await page.getByLabel('新密码', { exact: true }).fill(newPassword)
    await page.getByLabel('确认新密码', { exact: true }).fill(newPassword)
    await mutate(page, '/api/ums/user/password/reset', () => page.getByRole('button', { name: '重置密码', exact: true }).click())
    await expect(page).toHaveURL(/#\/login$/)
    await api(communityURL, '/api/ums/user/info', { token: user.token, expected: 401 })
    await api(communityURL, '/api/ums/user/info', { token: session.token, expected: 401 })
    await api(communityURL, '/api/ums/user/password/reset', { method: 'POST', data: { email: user.email, code: resetCode, password: newPassword, checkPass: newPassword }, expected: 400 })
    await api(communityURL, '/api/ums/user/login', { method: 'POST', data: { username: user.username, password: user.password, rememberMe: false }, expected: 401 })
    const fresh = await signIn(page, { ...user, password: newPassword })
    expect((await api(communityURL, '/api/ums/user/info', { token: fresh.token })).data.username).toBe(user.username)
    await page.goto(url(`/member/${user.username}/setting`))
    await expect(page.getByText('已验证', { exact: true })).toBeVisible()
    await assertNoOverflow(page)
  })
})
