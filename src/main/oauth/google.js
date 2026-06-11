import { createServer } from 'http'
import { randomBytes, createHash } from 'crypto'
import { shell } from 'electron'
import { getOauthConfig } from './config'
import { linkProvider, activateUserViaProvider } from '../users'
import { createTicket } from './tickets'
import { emitOauthEvent } from './events'

// Google loopback OAuth (PKCE, installed-app client). The system browser
// carries the whole sign-in; we only run a one-shot 127.0.0.1 listener for
// the redirect. Deliberately no access_type=offline: Sush keeps no refresh
// token, so every "Continue with Google" unlock is a live browser-session
// check rather than a stored credential — the lock stays meaningful.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const FLOW_TIMEOUT = 120000

let active = null

function stopActive(emitCancel) {
  if (!active) return
  const flow = active
  active = null
  flow.done = true
  clearTimeout(flow.timer)
  try { flow.server.close() } catch {}
  if (emitCancel) emitOauthEvent({ provider: 'google', phase: 'cancelled' })
}

export function cancelGoogleFlow() {
  stopActive(true)
  return { ok: true }
}

export async function startGoogleFlow({ mode = 'link', userId } = {}) {
  const { clientId, clientSecret } = getOauthConfig().google
  if (!clientId || !clientSecret) {
    return { ok: false, error: 'Google sign-in is not set up yet. Paste a Desktop-app client id and secret in Settings > Accounts.' }
  }
  stopActive(false)

  const state = randomBytes(32).toString('hex')
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const flow = { server: null, timer: null, done: false, port: 0 }
  const ctx = { mode, userId, clientId, clientSecret, state, verifier, flow }

  const port = await new Promise((resolve, reject) => {
    flow.server = createServer((req, res) => { handleCallback(req, res, ctx) })
    flow.server.once('error', reject)
    flow.server.listen(0, '127.0.0.1', () => resolve(flow.server.address().port))
  }).catch(() => null)
  if (port == null) return { ok: false, error: 'Could not open a local port for the sign-in redirect.' }
  flow.port = port
  active = flow

  flow.timer = setTimeout(() => {
    if (active === flow) {
      stopActive(false)
      emitOauthEvent({ provider: 'google', phase: 'error', error: 'Google sign-in timed out.' })
    }
  }, FLOW_TIMEOUT)

  const url = AUTH_URL + '?' + new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(port),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  }).toString()
  try {
    await shell.openExternal(url)
  } catch {
    stopActive(false)
    return { ok: false, error: 'Could not open the browser for Google sign-in.' }
  }
  return { ok: true }
}

function redirectUri(port) {
  return `http://127.0.0.1:${port}/sush-callback`
}

async function handleCallback(req, res, ctx) {
  const flow = ctx.flow
  if (flow.done) { res.writeHead(410); res.end(); return }
  const url = new URL(req.url, `http://127.0.0.1:${flow.port}`)
  if (url.pathname !== '/sush-callback') { res.writeHead(404); res.end(); return }

  const fail = (msg) => {
    respond(res, 'Sign-in failed', msg)
    stopActive(false)
    emitOauthEvent({ provider: 'google', phase: 'error', error: msg })
  }

  if (url.searchParams.get('state') !== ctx.state) { fail('State mismatch. Close this tab and try again.'); return }
  if (url.searchParams.get('error')) {
    respond(res, 'Sign-in cancelled', 'You can close this tab.')
    stopActive(false)
    emitOauthEvent({ provider: 'google', phase: 'cancelled' })
    return
  }
  const code = url.searchParams.get('code')
  if (!code) { fail('Missing authorization code.'); return }

  let tokens
  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: ctx.clientId,
        client_secret: ctx.clientSecret,
        code_verifier: ctx.verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri(flow.port)
      }).toString()
    })
    tokens = await tokenRes.json()
  } catch {
    fail('Could not reach Google to finish sign-in.')
    return
  }
  if (flow.done) return
  if (!tokens?.access_token) { fail(tokens?.error_description || 'Google rejected the sign-in.'); return }

  let info
  try {
    const infoRes = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` } })
    info = await infoRes.json()
  } catch {
    fail('Signed in, but could not read your Google profile.')
    return
  }
  if (flow.done) return
  if (!info?.sub) { fail('Google profile came back empty.'); return }
  // The access token is dropped here on purpose — Sush keeps only the profile.

  const profile = { sub: String(info.sub), email: info.email || '', name: info.name || '', picture: info.picture || '' }
  respond(res, 'Signed in to Sush', 'You can close this tab and return to Sush.')
  stopActive(false)

  if (ctx.mode === 'link') {
    const linked = linkProvider({ id: ctx.userId, provider: 'google', profile })
    if (!linked.ok) {
      emitOauthEvent({ provider: 'google', phase: 'error', error: linked.error })
      return
    }
    emitOauthEvent({ provider: 'google', phase: 'success', mode: 'link', user: linked.user })
    return
  }

  const activated = activateUserViaProvider({ provider: 'google', subject: profile.sub })
  if (activated.ok) {
    emitOauthEvent({ provider: 'google', phase: 'success', mode: 'signin', user: activated.user })
  } else {
    const ticket = createTicket({ provider: 'google', profile })
    emitOauthEvent({ provider: 'google', phase: 'success', mode: 'signin', user: null, ticket, profile })
  }
}

function respond(res, title, body) {
  try {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end([
      '<!doctype html><html><body style="font-family:system-ui;background:#0b0d11;color:#dfe3ea;',
      'display:flex;align-items:center;justify-content:center;height:100vh;margin:0">',
      `<div style="text-align:center"><h2 style="margin:0 0 8px">${title}</h2>`,
      `<p style="opacity:.7;margin:0">${body}</p></div></body></html>`
    ].join(''))
  } catch {}
}
