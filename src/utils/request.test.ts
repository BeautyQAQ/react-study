import { afterEach, expect, test, vi } from 'vitest'
import { AxiosError } from 'axios'
import request from './request'
import { removeToken, setToken } from './auth'

afterEach(() => { removeToken(); vi.restoreAllMocks() })

async function rejectUnauthorized(url: string, duringRequest: () => void = () => {}) {
  let rejectResponse: (() => void) | undefined
  const failure = expect(request({ url, adapter: config => new Promise((_resolve, reject) => {
    rejectResponse = () => reject(new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
      status: 401, statusText: 'Unauthorized', data: {}, headers: {}, config,
    }))
  }) })).rejects.toBeInstanceOf(AxiosError)
  await vi.waitFor(() => expect(rejectResponse).toBeDefined())
  duringRequest()
  rejectResponse!()
  await failure
}

test('expires the current session when its protected request returns 401', async () => {
  setToken('current-session')
  const dispatch = vi.spyOn(window, 'dispatchEvent')
  await rejectUnauthorized('/ums/user/info')
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'community:unauthorized' }))
})

test('a delayed response from the old session cannot sign out a new account', async () => {
  setToken('old-session')
  const dispatch = vi.spyOn(window, 'dispatchEvent')
  await rejectUnauthorized('/ums/user/info', () => setToken('new-session'))
  expect(dispatch).not.toHaveBeenCalled()
})

test('ignores a delayed unauthorized response after intentional logout', async () => {
  setToken('old-session')
  const dispatch = vi.spyOn(window, 'dispatchEvent')
  await rejectUnauthorized('/notification/unread', removeToken)
  expect(dispatch).not.toHaveBeenCalled()
})

test('a rejected login reports the form error without expiring the session', async () => {
  setToken('current-session')
  const dispatch = vi.spyOn(window, 'dispatchEvent')
  await rejectUnauthorized('/ums/user/login')
  expect(dispatch).not.toHaveBeenCalled()
})
