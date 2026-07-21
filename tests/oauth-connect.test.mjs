import { afterEach, describe, expect, it, vi } from 'vitest'
import { get } from 'http'

const state = vi.hoisted(() => ({ openedUrls: [], events: [] }))

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(async (url) => { state.openedUrls.push(url) })
  }
}))

vi.mock('../src/main/users.js', () => ({
  getActiveUser: () => ({ id: 'oauth-test-user' })
}))

vi.mock('../src/main/oauth/tokenStore.js', () => ({
  encryptionAvailable: () => true,
  saveToken: vi.fn(),
  getToken: vi.fn(() => null),
  deleteToken: vi.fn()
}))

vi.mock('../src/main/oauth/events.js', () => ({
  emitOauthEvent: (event) => { state.events.push(event) }
}))

import { cancelConnectFlow, startConnectFlow } from '../src/main/oauth/connect.js'

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
