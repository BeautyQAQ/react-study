const { expect } = require('@playwright/test')
const { randomBytes } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')

const listing = process.argv.includes('--list')
if (!listing && (process.env.E2E_ISOLATED !== '1' || !process.env.E2E_ENV_FILE || !process.env.E2E_PROJECT?.startsWith('liushao-e2e-'))) {
  throw new Error('Run this suite with python3 react-study/e2e/run.py from the workspace; it creates a disposable isolated environment.')
}

function loopback(name) {
  const value = process.env[name] || (listing ? 'http://127.0.0.1:1' : undefined)
  const url = new URL(value)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error(`${name} must use a generated loopback URL`)
  return url.origin
}

const communityURL = loopback('E2E_COMMUNITY_URL')
const adminURL = loopback('E2E_ADMIN_URL')
const smtpURL = loopback('E2E_SMTP_URL')
const config = listing ? {} : Object.fromEntries(readFileSync(process.env.E2E_ENV_FILE, 'utf8')
  .split('\n').filter(line => line && !line.startsWith('#')).map(line => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1)]
  }))
if (!listing && config.COMPOSE_PROJECT_NAME !== process.env.E2E_PROJECT) throw new Error('Isolated project identity mismatch')

const unique = (prefix = 'e2e') => `${prefix.slice(0, 12)}_${randomBytes(6).toString('hex')}`
const credentials = { username: config.ADMIN_USERNAME, password: config.ADMIN_PASSWORD }

async function api(base, pathname, { method = 'GET', data, token, expected = 200, form = false } = {}) {
  if (![communityURL, adminURL].includes(base) || !pathname.startsWith('/api/')) throw new Error('API requests must target the isolated app proxy')
  const headers = {}
  if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`
  if (data !== undefined) headers['Content-Type'] = form ? 'application/x-www-form-urlencoded' : 'application/json'
  const request = () => fetch(base + pathname, {
      method, headers,
      body: data === undefined ? undefined : form ? new URLSearchParams(data).toString() : JSON.stringify(data),
      signal: AbortSignal.timeout(15_000)
    })
  let response = await request()
  if (expected === 200 && response.status === 429) {
    // Only rejected, rate-limited requests may be repeated. Do not retry an
    // accepted mutation after a transport error or any other HTTP failure.
    let transportError
    await expect.poll(async () => {
      await response.body?.cancel()
      try { response = await request() }
      catch (error) { transportError = error; return -1 }
      return response.status
    }, { timeout: 70_000, intervals: [1000, 2000, 5000] }).not.toBe(429)
    if (transportError) throw transportError
  }
  expect(response.status, `${method} ${pathname.split('?')[0]} HTTP status`).toBe(expected)
  const body = await response.json()
  if (expected === 200) expect(body.code, `${method} ${pathname.split('?')[0]} application status`).toBe(200)
  return body
}

async function registerUser(overrides = {}) {
  const username = overrides.username || unique('member')
  const password = overrides.password || `E2e_${randomBytes(12).toString('hex')}!`
  const email = overrides.email || `${username}@example.test`
  const result = await api(communityURL, '/api/ums/user/register', {
    method: 'POST', data: { name: username, pass: password, checkPass: password, email }
  })
  const login = await api(communityURL, '/api/ums/user/login', {
    method: 'POST', data: { username, password, rememberMe: false }
  })
  return { id: result.data.id, username, password, email, token: login.data.token }
}

async function loginCommunityUI(page, user) {
  await page.goto(`${communityURL}/#/login`)
  await expect(page.getByRole('heading', { name: '用户登录', exact: true })).toBeVisible()
  await page.getByLabel('账号', { exact: true }).fill(user.username)
  await page.getByLabel('密码', { exact: true }).fill(user.password)
  let response, loginData
  const attempt = async () => {
    const pending = page.waitForResponse(r => r.url().endsWith('/api/ums/user/login') && r.request().method() === 'POST')
      .then(async response => ({ response, data: await response.json() }))
    await page.getByRole('button', { name: '登录', exact: true }).click()
    const received = await pending
    response = received.response
    loginData = received.data
    return response.status()
  }
  const status = await attempt()
  if (status === 429) await expect.poll(attempt, { timeout: 70_000, intervals: [1000, 2000, 5000] }).not.toBe(429)
  expect(response.status(), 'Community browser login succeeds').toBe(200)
  await expect(page).not.toHaveURL(/#\/login/)
  return loginData.data
}

function redis(command, key) {
  if (!/^liushao:admin:captcha:[0-9a-f-]{36}$/.test(key) || !['GET', 'TTL', 'EXISTS'].includes(command)) {
    throw new Error('Only read-only CAPTCHA checks are permitted')
  }
  return execFileSync('docker', [
    'compose', '--project-directory', `${process.env.E2E_ROOT}/liushao_community_backend/deploy`,
    '--env-file', process.env.E2E_ENV_FILE, '-p', process.env.E2E_PROJECT,
    '-f', `${process.env.E2E_ROOT}/liushao_community_backend/deploy/compose.yaml`, '-f', `${process.env.E2E_ROOT}/react-study/e2e/compose.yaml`,
    'exec', '-T', 'redis', 'sh', '-c',
    'export REDISCLI_AUTH="$REDIS_PASSWORD"; exec redis-cli --raw -n 12 "$@"',
    'captcha-check', command, key
  ], { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function captchaValue(id) {
  const key = `liushao:admin:captcha:${id}`
  const ttl = Number(redis('TTL', key))
  expect(ttl, 'CAPTCHA retains its real Redis expiry').toBeGreaterThan(0)
  expect(ttl).toBeLessThanOrEqual(120)
  const code = redis('GET', key)
  expect(code.length, 'Generated CAPTCHA length').toBe(5)
  return { key, code }
}

async function adminLogin(user = credentials) {
  const captcha = (await api(adminURL, '/api/captcha')).data
  const { code, key } = captchaValue(captcha.token)
  const result = await api(adminURL, '/api/login', {
    method: 'POST', form: true,
    data: { username: user.username, password: user.password, token: captcha.token, code }
  })
  expect(redis('EXISTS', key), 'CAPTCHA is consumed after login').toBe('0')
  return result.data.token
}

async function reviewPost(id, token, { status = 'PUBLISHED', top, essence, reason = '浏览器验收内容审核' } = {}) {
  const current = (await api(adminURL, `/api/community/posts/${id}`, { token })).data
  return (await api(adminURL, `/api/community/posts/${id}/moderation`, {
    method: 'PUT', token,
    data: { status, top: top ?? current.top, essence: essence ?? current.essence, reason, version: current.version }
  })).data
}

async function loginAdminUI(page, user = credentials) {
  let login, loginData, key
  const attempt = async () => {
    await page.goto(`${adminURL}/login`)
    // A preceding 401 may already be redirecting this page to /login. Finish
    // navigation before observing a fresh UI refresh, so an old document's
    // CAPTCHA response cannot be mistaken for the current form's response.
    const refresh = page.getByRole('button', { name: '刷新验证码', exact: true })
    await expect(page.locator('.captcha img')).toBeVisible()
    await expect(refresh).toBeEnabled()
    const captchaResponse = page.waitForResponse(r => r.url().endsWith('/api/captcha') && r.status() === 200)
      .then(response => response.json())
    await refresh.click()
    const captcha = (await captchaResponse).data
    const value = captchaValue(captcha.token)
    key = value.key
    await page.getByLabel('用户名', { exact: true }).fill(user.username)
    await page.getByLabel('密码', { exact: true }).fill(user.password)
    await page.getByLabel('验证码', { exact: true }).fill(value.code)
    const response = page.waitForResponse(r => r.url().endsWith('/api/login') && r.request().method() === 'POST')
      .then(async response => ({ response, data: await response.json() }))
    await page.getByRole('button', { name: '登录', exact: true }).click()
    const received = await response
    login = received.response
    loginData = received.data
    return login.status()
  }
  const status = await attempt()
  if (status === 429) await expect.poll(attempt, { timeout: 70_000, intervals: [1000, 2000, 5000] }).not.toBe(429)
  expect(login.status(), 'Admin browser login succeeds').toBe(200)
  await expect(page).toHaveURL(/\/index$/)
  expect(redis('EXISTS', key), 'Browser login consumes the CAPTCHA once').toBe('0')
  return loginData.data.token
}

function decodeMail(raw) {
  const split = raw.indexOf('\r\n\r\n')
  const headers = raw.slice(0, split).replace(/\r\n[ \t]+/g, ' ')
  let body = raw.slice(split + 4)
  if (/Content-Transfer-Encoding:\s*base64/i.test(headers)) body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8')
  else if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(headers)) {
    body = Buffer.from(body.replace(/=\r\n/g, '').replace(/=([a-f0-9]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))), 'binary').toString('utf8')
  }
  const decodedHeaders = headers.replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_, encoded) => Buffer.from(encoded, 'base64').toString('utf8'))
  return `${decodedHeaders}\n${body}`
}

async function emailCode(email, purpose) {
  if (!['verify', 'reset'].includes(purpose)) throw new Error('Unknown test mail purpose')
  let code
  await expect(async () => {
    const response = await fetch(`${smtpURL}/messages?recipient=${encodeURIComponent(email)}`, { signal: AbortSignal.timeout(5000) })
    expect(response.ok).toBe(true)
    const messages = await response.json()
    for (const mail of [...messages].reverse()) {
      const decoded = decodeMail(mail.raw)
      if (!decoded.includes(purpose === 'verify' ? '验证邮箱' : '重置密码')) continue
      code = decoded.match(/验证码为[：:]\s*(\d{6})/)?.[1]
      if (code) return
    }
    throw new Error('Waiting for real SMTP delivery to the isolated inbox')
  }).toPass({ timeout: 20_000, intervals: [100, 250, 500, 1000] })
  return code
}

// A valid PNG accepted by ImageIO; no external image or network dependency.
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGNQmNDwH4QZYAwASZQIvRIi1qEAAAAASUVORK5CYII=', 'base64')

async function assertNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page fits the viewport').toBe(true)
}

function draftId(page) {
  const query = new URL(page.url()).hash.split('?')[1] || ''
  const id = new URLSearchParams(query).get('draft')
  expect(id, 'Editor has a stable draft identity').toMatch(/^[\da-f-]{36}$/)
  return id
}

const draftPublishPath = page => `/api/me/drafts/${draftId(page)}/publish`

module.exports = {
  communityURL, adminURL, unique, credentials, api, registerUser,
  loginCommunityUI, loginAdminUI, adminLogin, reviewPost, emailCode, tinyPng, assertNoOverflow, draftId, draftPublishPath
}
