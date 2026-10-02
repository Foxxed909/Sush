import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'http'

const state = vi.hoisted(() => ({ openedUrls: [], events: [], userId: 'oauth-test-user' }))

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(async (url) => { state.openedUrls.push(url) })
  }
}))

vi.mock('../src/main/users.js', () => ({
  getActiveUser: () => state.userId ? ({ id: state.userId }) : null
}))

vi.mock('../src/main/oauth/tokenStore.js', () => ({
  encryptionAvailable: () => true,
  saveToken: vi.fn(() => ({ ok: true })),
  getToken: vi.fn(() => null),
  deleteToken: vi.fn()
}))

vi.mock('../src/main/oauth/events.js', () => ({
  emitOauthEvent: (event) => { state.events.push(event) }
}))

import { saveToken, getToken } from '../src/main/oauth/tokenStore.js'
import { cancelConnectFlow, startConnectFlow, finishConnectFlow, testProvider, disconnectProvider } from '../src/main/oauth/connect.js'

function requestLoopbackCallback(port, path) {
  return new Promise((resolve, reject) => {
    const req = get({ hostname: '127.0.0.1', port, path }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.setTimeout(750, () => req.destroy(new Error('OAuth callback timed out')))
    req.on('error', reject)
  })
}

describe('provider-connect callback', () => {
  beforeEach(() => { state.userId = 'oauth-test-user'; vi.clearAllMocks() })
  afterEach(() => {
    cancelConnectFlow()
    state.openedUrls.length = 0
    state.events.length = 0
    vi.unstubAllGlobals()
  })

  it('answers the successful loopback callback instead of rejecting the HTTP handler', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ error: 'test token rejection' }) })))

    expect(await startConnectFlow({ provider: 'gemini' })).toEqual({ ok: true, manual: false })
    const authorization = new URL(state.openedUrls[0])
    const redirect = new URL(authorization.searchParams.get('redirect_uri'))
    const callback = await requestLoopbackCallback(
      Number(redirect.port),
      `${redirect.pathname}?state=${authorization.searchParams.get('state')}&code=test-code`
    )

    expect(callback.status).toBe(200)
    expect(callback.body).toContain('Connected to Sush')
    expect(state.events.at(-1)).toMatchObject({ provider: 'gemini', phase: 'error' })
  })
})


function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}

describe('provider request ownership', () => {
  beforeEach(() => { state.userId = 'oauth-test-user'; vi.clearAllMocks() })
  afterEach(() => { cancelConnectFlow(); state.openedUrls.length = 0; state.events.length = 0; vi.unstubAllGlobals() })

  it.each(['switch', 'cancel'])('does not store an exchange result after %s', async action => {
    const pending = deferred()
    vi.stubGlobal('fetch', vi.fn(() => pending.promise))
    await startConnectFlow({ provider: 'claude', manual: true })
    const stateValue = new URL(state.openedUrls.at(-1)).searchParams.get('state')
    const result = finishConnectFlow({ code: `test-code#${stateValue}` })
    if (action === 'switch') state.userId = 'other-user'
    else cancelConnectFlow()
    pending.resolve({ json: async () => ({ access_token: 'test-token' }) })
    expect(await result).toMatchObject({ ok: false })
    expect(saveToken).not.toHaveBeenCalled()
    expect(state.events.some(e => e.phase === 'success')).toBe(false)
  })

  it('stores successful exchanges for the identity that started them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ access_token: 'test-token' }) })))
    await startConnectFlow({ provider: 'claude', manual: true })
    const stateValue = new URL(state.openedUrls.at(-1)).searchParams.get('state')
    expect(await finishConnectFlow({ code: `test-code#${stateValue}` })).toEqual({ ok: true })
    expect(saveToken.mock.calls[0][0]).toBe('oauth-test-user')
  })

  it.each(['switch', 'disconnect'])('does not store an expired-token refresh after %s', async action => {
    const pending = deferred()
    getToken.mockReturnValueOnce(JSON.stringify({ access_token: 'old', refresh_token: 'refresh', expires_at: 1 }))
    vi.stubGlobal('fetch', vi.fn(() => pending.promise))
    const result = testProvider({ provider: 'codex' })
    if (action === 'switch') state.userId = 'other-user'
    else disconnectProvider({ provider: 'codex' })
    pending.resolve({ json: async () => ({ access_token: 'fresh' }) })
    expect(await result).toMatchObject({ ok: false })
    expect(saveToken).not.toHaveBeenCalled()
  })
})
