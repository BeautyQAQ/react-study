const { test, expect, observeContext } = require('../fixtures.cjs');
const {
  adminURL,
  communityURL,
  unique,
  api,
  registerUser,
  loginCommunityUI,
  loginAdminUI,
  reviewPost,
  assertNoOverflow,
  draftPublishPath,
} = require('../support.cjs');

// These tests use the production frontends and the isolated runner's real services.
// Requests create independent fixtures; every consequential operator action uses the UI.
test.setTimeout(180_000);

async function successfulAction(page, path, method, action) {
  const responsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === path && response.request().method() === method);
  await action();
  const response = await responsePromise;
  expect(response.status(), `${method} ${path}`).toBe(200);
  const envelope = await response.json();
  expect(envelope.code).toBe(200);
  return envelope.data;
}

async function navigateAdmin(page, group, label, path) {
  const opener = page.getByRole('button', { name: '打开管理导航', exact: true });
  const mobile = await opener.isVisible();
  let navigation;
  if (mobile) {
    await opener.click();
    navigation = page.getByRole('dialog', { name: '管理导航', exact: true });
    await expect(navigation).toBeVisible();
  } else {
    navigation = page.locator('.desktop-navigation');
  }
  const title = navigation.locator('.el-sub-menu__title').filter({ hasText: group });
  await expect(title).toBeVisible();
  if (await title.locator('xpath=..').getAttribute('aria-expanded') !== 'true') {
    await title.click();
  }
  const endpoint = path === '/sys/users' ? '/api/sys/user/list' : `/api${path}`;
  await successfulAction(page, endpoint, 'GET', () =>
    navigation.getByRole('menuitem', { name: label, exact: true }).click());
  await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`));
  if (mobile) {
    await expect(page.getByRole('dialog', { name: '管理导航', exact: true })).toBeHidden();
  }
  await assertNoOverflow(page);
}

async function searchAdmin(page, placeholder, query, endpoint) {
  if (endpoint === '/api/sys/user/list') {
    await expect(page.locator('.el-table__row').first()).toBeVisible();
  }
  await page.getByPlaceholder(placeholder, { exact: true }).fill(query);
  await successfulAction(page, endpoint, 'GET', () =>
    page.getByRole('button', { name: '搜索', exact: true }).click());
}

function tableRow(page, text) {
  return page.locator('.el-table__body tr').filter({ hasText: text });
}

async function moderatePost(page, title, id, status, reason) {
  const row = tableRow(page, title);
  await expect(row).toHaveCount(1);
  await successfulAction(page, `/api/community/posts/${id}`, 'GET', () =>
    row.getByRole('button', { name: '审核', exact: true }).click());
  const dialog = page.getByRole('dialog', { name: '审核帖子', exact: true });
  await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await dialog.locator('label.el-radio').filter({ hasText: status }).click();
  await expect(dialog.getByRole('radio', { name: status, exact: true })).toBeChecked();
  await dialog.getByRole('textbox').fill(reason);
  await assertNoOverflow(page);
  await successfulAction(page, `/api/community/posts/${id}/moderation`, 'PUT', () =>
    dialog.getByRole('button', { name: '确认审核', exact: true }).click());
  await expect(dialog).toBeHidden();
  await expect(row).toContainText(status);
}

async function changeCommunityStatus(page, user, enable, reason) {
  const row = tableRow(page, user.username);
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: enable ? '恢复' : '禁用', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: enable ? '恢复社区账号' : '禁用社区账号', exact: true,
  });
  await dialog.getByRole('textbox').fill(reason);
  await successfulAction(page, `/api/community/users/${user.id}/status`, 'PUT', () =>
    dialog.getByRole('button', { name: enable ? '确认恢复' : '确认禁用', exact: true }).click());
  await expect(dialog).toBeHidden();
  await expect(row).toContainText(enable ? '正常' : '已禁用');
}

test('社区审核、作者重新提交、账号禁用恢复及审计形成真实闭环', async ({ page, context }) => {
  const adminToken = await loginAdminUI(page);
  const actor = (await api(adminURL, '/api/sys/userInfo', { token: adminToken })).data.username;
  const author = await registerUser();
  const title = unique('审核主题');
  const originalContent = '这是需要后台审核的真实社区内容。';
  const post = (await api(communityURL, '/api/post/add', {
    method: 'POST', token: author.token,
    data: { title, content: originalContent, tags: ['e2e'] },
  })).data;
  expect(post.status).toBe('PENDING');
  await api(communityURL, `/api/post/${post.id}`, { expected: 404 });
  await reviewPost(post.id, adminToken);
  const hideReason = unique('下架原因');
  const publishReason = unique('重新公开');
  const disableReason = unique('禁用原因');
  const enableReason = unique('恢复原因');
  const authorPage = await context.newPage();

  await navigateAdmin(page, '社区运营', '帖子审核', '/community/posts');
  await searchAdmin(page, '标题或社区作者', title, '/api/community/posts');
  await moderatePost(page, title, post.id, '已下架', hideReason);
  await api(communityURL, `/api/post/${post.id}`, { expected: 404 });
  const publicList = await api(communityURL,
    `/api/post/list?query=${encodeURIComponent(title)}`);
  expect(publicList.data.content.some(item => item.id === post.id)).toBe(false);

  await loginCommunityUI(authorPage, author);
  await authorPage.goto(`${communityURL}/#/me/posts`);
  await expect(authorPage.getByRole('heading', { name: '我的帖子', exact: true })).toBeVisible();
  const ownPost = authorPage.locator('article.saved-post').filter({ hasText: title });
  await expect(ownPost).toContainText('已隐藏');
  await expect(ownPost).toContainText(hideReason);
  await ownPost.getByRole('link', { name: '编辑', exact: true }).click();
  await expect(authorPage.getByRole('heading', { name: '编辑帖子', exact: true })).toBeVisible();
  const updatedContent = `${originalContent}\n\n作者已经修改内容并重新提交审核。`;
  await authorPage.getByPlaceholder('支持 Markdown。写下你的经验、问题或想法。', { exact: true })
    .fill(updatedContent);
  await successfulAction(authorPage, draftPublishPath(authorPage), 'POST', () =>
    authorPage.getByRole('button', { name: '提交修改', exact: true }).click());
  await expect(authorPage).toHaveURL(new RegExp(`/#/me/posts/${post.id}$`));
  await expect(authorPage.getByText('帖子正在等待审核，仅自己可见', { exact: true })).toBeVisible();
  const pending = await api(communityURL, `/api/me/posts/${post.id}`, { token: author.token });
  expect(pending.data.status).toBe('PENDING');
  expect(pending.data.content).toBe(updatedContent);
  await api(communityURL, `/api/post/${post.id}`, { expected: 404 });
  await assertNoOverflow(authorPage);

  await successfulAction(page, '/api/community/posts', 'GET', () =>
    page.getByRole('button', { name: '刷新', exact: true }).click());
  await expect(tableRow(page, title)).toContainText('待审核');
  await moderatePost(page, title, post.id, '已发布', publishReason);
  const published = await api(communityURL, `/api/post/${post.id}`);
  expect(published.data.status).toBe('PUBLISHED');
  expect(published.data.content).toBe(updatedContent);
  await authorPage.goto(`${communityURL}/#/post/${post.id}`);
  await expect(authorPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(authorPage.getByText('作者已经修改内容并重新提交审核。', { exact: true })).toBeVisible();

  await navigateAdmin(page, '社区运营', '社区账号', '/community/users');
  await searchAdmin(page, '社区用户名、昵称或邮箱', author.username, '/api/community/users');
  await changeCommunityStatus(page, author, false, disableReason);
  await api(communityURL, '/api/ums/user/info', { token: author.token, expected: 401 });
  await api(communityURL, `/api/post/${post.id}`, { expected: 404 });
  await authorPage.goto(`${communityURL}/#/me/posts`);
  await expect(authorPage).toHaveURL(/\/#\/login(?:\?|$)/);
  await changeCommunityStatus(page, author, true, enableReason);
  await api(communityURL, '/api/ums/user/info', { token: author.token, expected: 401 });
  await loginCommunityUI(authorPage, author);
  await authorPage.goto(`${communityURL}/#/post/${post.id}`);
  await expect(authorPage.getByRole('heading', { name: title, exact: true })).toBeVisible();

  await navigateAdmin(page, '社区运营', '运营审计', '/community/audit');
  await searchAdmin(page, '后台操作者、操作或资源', 'post.moderate', '/api/community/audit');
  for (const reason of [hideReason, publishReason]) {
    const row = tableRow(page, reason);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(actor);
    await expect(row).toContainText(String(post.id));
  }
  await tableRow(page, hideReason).getByRole('button', { name: '查看', exact: true }).click();
  const audit = page.getByRole('dialog', { name: '运营记录详情', exact: true });
  await expect(audit).toContainText(hideReason);
  await expect(audit).toContainText(actor);
  await expect(audit).toContainText('post.moderate');
  await assertNoOverflow(page);
  await audit.locator('.el-dialog__headerbtn').click();
  await searchAdmin(page, '后台操作者、操作或资源', 'user', '/api/community/audit');
  await expect(tableRow(page, disableReason)).toContainText('user.disable');
  await expect(tableRow(page, enableReason)).toContainText('user.enable');
  await expect(page.getByRole('button', { name: '删除', exact: true })).toHaveCount(0);
  await authorPage.close();
});

test('后台只读权限、实时撤权、角色变更与密码重置均由服务端执行', async ({ page, browser }) => {
  const adminToken = await loginAdminUI(page);
  const author = await registerUser();
  const postTitle = unique('只读权限主题');
  const post = (await api(communityURL, '/api/post/add', {
    method: 'POST', token: author.token,
    data: { title: postTitle, content: '用于独立验证只读账号的审核与删除权限。', tags: ['e2e'] },
  })).data;
  await reviewPost(post.id, adminToken);
  const roleName = unique('只读角色');
  const reader = { username: unique('reader'), password: 'ReadOnly-Original-123' };
  const menuTree = (await api(adminURL, '/api/sys/menu/list', { token: adminToken })).data;
  const flatten = menus => menus.flatMap(menu => [menu, ...flatten(menu.children || [])]);
  const wanted = new Set(['sys:user:list', 'sys:role:list', 'community:post:list']);
  const menuIds = flatten(menuTree).filter(menu => wanted.has(menu.perms)).map(menu => menu.id);
  expect(menuIds).toHaveLength(wanted.size);
  const roleId = (await api(adminURL, '/api/sys/role/save', {
    method: 'POST', token: adminToken,
    data: { name: roleName, code: unique('readonly'), remark: '浏览器真实只读验收', statu: 1 },
  })).data;
  await api(adminURL, `/api/sys/role/perm/${roleId}`, {
    method: 'POST', token: adminToken, data: menuIds,
  });
  const readerId = (await api(adminURL, '/api/sys/user/save', {
    method: 'POST', token: adminToken,
    data: { ...reader, email: `${reader.username}@example.test`, phone: '', statu: 1 },
  })).data;
  await api(adminURL, `/api/sys/user/role/${readerId}`, {
    method: 'POST', token: adminToken, data: [roleId],
  });
  // Separate storage prevents the reader's login from overwriting the operator's token.
  const readerContext = await browser.newContext({ viewport: page.viewportSize() });
  const assertReaderHealthy = observeContext(readerContext);
  try {
    const readerPage = await readerContext.newPage();
    const readerToken = await loginAdminUI(readerPage, reader);
    await navigateAdmin(readerPage, '系统管理', '用户管理', '/sys/users');
    await searchAdmin(readerPage, '后台用户名', reader.username, '/api/sys/user/list');
    await expect(tableRow(readerPage, reader.username)).toHaveCount(1);
    for (const name of ['新增', '批量删除', '分配角色', '重置密码', '编辑', '删除']) {
      await expect(readerPage.getByRole('button', { name, exact: true })).toHaveCount(0);
    }
    await api(adminURL, '/api/sys/user/save', {
      method: 'POST', token: readerToken,
      data: { username: unique('forbidden'), password: 'MustNotCreate-123', statu: 1 }, expected: 403,
    });
    await navigateAdmin(readerPage, '社区运营', '帖子审核', '/community/posts');
    await searchAdmin(readerPage, '标题或社区作者', postTitle, '/api/community/posts');
    const readOnlyPost = tableRow(readerPage, postTitle);
    await expect(readOnlyPost).toHaveCount(1);
    await api(adminURL, `/api/community/posts/${post.id}/moderation`, {
      method: 'PUT', token: readerToken,
      data: { status: 'HIDDEN', top: false, essence: false, reason: '只读账户禁止审核', version: post.version }, expected: 403,
    });
    await api(adminURL, `/api/community/posts/${post.id}?reason=readonly-forbidden`, {
      method: 'DELETE', token: readerToken, expected: 403,
    });
    expect((await api(communityURL, `/api/post/${post.id}`)).data.status).toBe('PUBLISHED');
    for (const name of ['审核', '删除']) {
      const button = readOnlyPost.getByRole('button', { name, exact: true });
      await expect(button).toHaveCount(1);
      await expect(button).toBeVisible();
      await expect(button).toBeDisabled();
    }

    // Editing a role's permissions takes effect on its next request without a new login.
    await api(adminURL, `/api/sys/role/perm/${roleId}`, {
      method: 'POST', token: adminToken, data: [],
    });
    await api(adminURL, '/api/sys/user/list', { token: readerToken, expected: 403 });
    await api(adminURL, '/api/sys/userInfo', { token: readerToken });
    await api(adminURL, `/api/sys/role/perm/${roleId}`, {
      method: 'POST', token: adminToken, data: menuIds,
    });
    await api(adminURL, '/api/sys/user/list', { token: readerToken });

    // Changing this account's assigned roles revokes the session itself.
    await navigateAdmin(page, '系统管理', '用户管理', '/sys/users');
    await searchAdmin(page, '后台用户名', reader.username, '/api/sys/user/list');
    const row = tableRow(page, reader.username);
    await row.getByRole('button', { name: '分配角色', exact: true }).click();
    const rolesDialog = page.getByRole('dialog', { name: '分配角色', exact: true });
    const roleNode = rolesDialog.getByRole('treeitem').filter({ hasText: roleName });
    await expect(roleNode.getByRole('checkbox')).toBeChecked();
    await roleNode.locator('.el-checkbox').click();
    await expect(roleNode.getByRole('checkbox')).not.toBeChecked();
    await successfulAction(page, `/api/sys/user/role/${readerId}`, 'POST', () =>
      rolesDialog.getByRole('button', { name: '确 定', exact: true }).click());
    await expect(rolesDialog).toBeHidden();
    await api(adminURL, '/api/sys/userInfo', { token: readerToken, expected: 401 });
    await readerPage.reload();
    await expect(readerPage).toHaveURL(/\/login$/);
    expect(await readerPage.evaluate(() => localStorage.getItem('token'))).toBeFalsy();

    await api(adminURL, `/api/sys/user/role/${readerId}`, {
      method: 'POST', token: adminToken, data: [roleId],
    });
    const beforeReset = await loginAdminUI(readerPage, reader);
    await row.getByRole('button', { name: '重置密码', exact: true }).click();
    const resetDialog = page.getByRole('dialog', { name: '重置密码', exact: true });
    const newPassword = 'ReadOnly-Replaced-456';
    await resetDialog.locator('input[type="password"]').fill(newPassword);
    await successfulAction(page, '/api/sys/user/repass', 'POST', () =>
      resetDialog.getByRole('button', { name: '重置', exact: true }).click());
    await expect(resetDialog).toBeHidden();
    await api(adminURL, '/api/sys/userInfo', { token: beforeReset, expected: 401 });
    await readerPage.reload();
    await expect(readerPage).toHaveURL(/\/login$/);
    expect(await readerPage.evaluate(() => localStorage.getItem('token'))).toBeFalsy();
    const afterReset = await loginAdminUI(readerPage, { ...reader, password: newPassword });
    const info = await api(adminURL, '/api/sys/userInfo', { token: afterReset });
    expect(info.data.id).toBe(readerId);
    await assertNoOverflow(page);
    await assertNoOverflow(readerPage);
  } finally {
    await readerContext.close();
    assertReaderHealthy();
  }
});
