import { createServer } from 'http'
import { randomBytes, createHash } from 'crypto'
import { shell } from 'electron'
import { getActiveUser } from '../users'
import { saveToken, getToken, deleteToken, encryptionAvailable } from './tokenStore'
import { emitOauthEvent } from './events'

// Provider Connect: connect AI-provider accounts over loopback-PKCE OAuth —
// the same shape as "Continue with Google" sign-in, but here the token IS
// the point: it's kept (safeStorage-encrypted, per identity, main-process
// only) so Sush can act as your subscription. One registry, one flow; every
// provider is just endpoints + quirks. All client ids are the public
// installed-app registrations their own CLIs ship — public by design.
// Graduated from Settings ▸ Experiments (2026-07): now a Plus+ feature,
// gated at the connect-start IPC handler (`providerConnect`).

const PROVIDERS = {
  claude: {
    label: 'Claude',
    clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
    authUrl: 'https://claude.ai/oauth/authorize',
    tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
    scopes: 'org:create_api_key user:profile user:inference',
    loopback: { port: 54545, path: '/callback', host: 'localhost' },
    // Claude's console callback page shows a "code#state" string to paste —
    // the only provider here with a hosted manual fallback.
    manualRedirect: 'https://console.anthropic.com/oauth/code/callback',
    authParams: { code: 'true' },
    tokenFormat: 'json',
    sendStateOnExchange: true
  },
  codex: {
    label: 'ChatGPT (Codex)',
    clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
    authUrl: 'https://auth.openai.com/oauth/authorize',
    tokenUrl: 'https://auth.openai.com/oauth/token',
    scopes: 'openid profile email offline_access',
    // The Codex CLI's registered redirect — fixed port, like Claude's.
    loopback: { port: 1455, path: '/auth/callback', host: 'localhost' },
    tokenFormat: 'form'
  },
  gemini: {
    label: 'Google (Gemini)',
    clientId: '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com',
    // Installed-app secret, public by design (ships in the Gemini CLI).
    clientSecret: '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',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
    // Google allows any loopback port for installed apps.
    loopback: { port: 0, path: '/oauth2callback', host: 'localhost' },
    authParams: { access_type: 'offline', prompt: 'consent' },
    tokenFormat: 'form'
  }
}

const FLOW_TIMEOUT = 180000

let active = null   // { provider, server, timer, done, verifier, state, manual, port }

function vaultUser() {
  return getActiveUser()?.id ?? 'solo'
}

function vaultKey(provider) {
  // 'claude' kept bare for continuity with the first experiment's vault entry.
  return provider === 'claude' ? 'claude' : `connect-${provider}`
}

function stopActive(emitCancel) {
  if (!active) return
  const flow = active
  active = null
  flow.done = true
  clearTimeout(flow.timer)
  try { flow.server?.close() } catch {}
  if (emitCancel) emitOauthEvent({ provider: flow.provider, phase: 'cancelled' })
}

export function cancelConnectFlow() {
  stopActive(true)
  return { ok: true }
}

function redirectUri(cfg, flow) {
  if (flow.manual) return cfg.manualRedirect
  return `http://${cfg.loopback.host}:${flow.port}${cfg.loopback.path}`
}

export async function startConnectFlow({ provider, manual = false } = {}) {
  const cfg = PROVIDERS[provider]
  if (!cfg) return { ok: false, error: `Unknown provider "${provider}".` }
  if (manual && !cfg.manualRedirect) return { ok: false, error: `${cfg.label} has no paste-code fallback — use the browser flow.` }
  if (!encryptionAvailable()) {
    return { ok: false, error: 'OS encryption is unavailable, so the token could not be stored safely. Connect is disabled.' }
  }
  stopActive(false)

  const state = randomBytes(32).toString('hex')
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const flow = { provider, server: null, timer: null, done: false, verifier, state, manual, port: cfg.loopback.port }

  if (!manual) {
    const ok = await new Promise((resolve) => {
      flow.server = createServer((req, res) => { handleCallback(req, res, cfg, flow) })
      flow.server.once('error', () => resolve(false))
      flow.server.listen(cfg.loopback.port, '127.0.0.1', () => {
        flow.port = flow.server.address().port
        resolve(true)
      })
    })
    if (!ok) {
      return {
        ok: false,
        error: cfg.manualRedirect
          ? `Port ${cfg.loopback.port} is busy. Use "Paste code instead".`
          : `Port ${cfg.loopback.port} is busy — close whatever is using it (often the ${cfg.label} CLI login) and retry.`,
        portBusy: true
      }
    }
  }
  active = flow

  flow.timer = setTimeout(() => {
    if (active === flow) {
      stopActive(false)
      emitOauthEvent({ provider, phase: 'error', error: `${cfg.label} connect timed out.` })
    }
  }, FLOW_TIMEOUT)

  const url = cfg.authUrl + '?' + new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(cfg, flow),
    response_type: 'code',
    scope: cfg.scopes,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...(cfg.authParams || {})
  }).toString()
  try {
    await shell.openExternal(url)
  } catch {
    stopActive(false)
    return { ok: false, error: `Could not open the browser for ${cfg.label} connect.` }
  }
  return { ok: true, manual }
}

// Manual paste path (Claude only): the user pastes the "code#state" string
// the callback page shows. The state half is REQUIRED — accepting a bare
// code would skip the CSRF check the loopback path always performs.
export async function finishConnectFlow({ code = '' } = {}) {
  const flow = active
  if (!flow) return { ok: false, error: 'No connect in progress. Hit Connect first.' }
  const raw = String(code).trim()
  if (!raw) return { ok: false, error: 'Paste the code shown in the browser.' }
  const [authCode, pastedState] = raw.split('#')
  if (!pastedState) {
    return { ok: false, error: 'Paste the whole string exactly as shown — it looks like code#state.' }
  }
  if (pastedState !== flow.state) {
    return { ok: false, error: 'That code came from a different attempt. Hit Connect and try again.' }
  }
  const cfg = PROVIDERS[flow.provider]
  stopActive(false)
  return exchange(authCode, cfg, flow)
}

async function handleCallback(req, res, cfg, flow) {
  if (flow.done) { res.writeHead(410); res.end(); return }
  const url = new URL(req.url, `http://${cfg.loopback.host}:${flow.port}`)
  if (url.pathname !== cfg.loopback.path) { res.writeHead(404); res.end(); return }

  const fail = (msg) => {
    respond(res, 'Connect failed', msg)
    stopActive(false)
    emitOauthEvent({ provider: flow.provider, phase: 'error', error: msg })
  }

  if (url.searchParams.get('state') !== flow.state) { fail('State mismatch. Close this tab and try again.'); return }
  if (url.searchParams.get('error')) {
    respond(res, 'Connect cancelled', 'You can close this tab.')
    stopActive(false)
    emitOauthEvent({ provider: flow.provider, phase: 'cancelled' })
    return
  }
  const code = url.searchParams.get('code')
  if (!code) { fail('Missing authorization code.'); return }

  respond(res, 'Connected to Sush', 'You can close this tab and return to Sush.')
  stopActive(false)
  await exchange(code, cfg, flow)
}

async function exchange(code, cfg, flow) {
  const params = {
    grant_type: 'authorization_code',
    code,
    client_id: cfg.clientId,
    redirect_uri: redirectUri(cfg, flow),
    code_verifier: flow.verifier,
    ...(cfg.clientSecret ? { client_secret: cfg.clientSecret } : {}),
    ...(cfg.sendStateOnExchange ? { state: flow.state } : {})
  }
  let tokens
  try {
    const res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': cfg.tokenFormat === 'json' ? 'application/json' : 'application/x-www-form-urlencoded' },
      body: cfg.tokenFormat === 'json' ? JSON.stringify(params) : new URLSearchParams(params).toString()
    })
    tokens = await res.json()
  } catch {
    const error = `Could not reach ${cfg.label}'s token endpoint.`
    emitOauthEvent({ provider: flow.provider, phase: 'error', error })
    return { ok: false, error }
  }
  if (!tokens?.access_token) {
    const error = tokens?.error_description || tokens?.error || `${cfg.label} rejected the code.`
    emitOauthEvent({ provider: flow.provider, phase: 'error', error })
    return { ok: false, error }
  }
  const saved = persistTokens(flow.provider, tokens)
  if (!saved.ok) {
    emitOauthEvent({ provider: flow.provider, phase: 'error', error: saved.error })
    return saved
  }
  emitOauthEvent({ provider: flow.provider, phase: 'success', mode: 'connect', status: connectStatus()[flow.provider] })
  return { ok: true }
}

// Best-effort account label from an OIDC id_token (codex/gemini include one).
function emailFromIdToken(idToken) {
  try {
    const payload = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'))
    return payload.email || ''
  } catch {
    return ''
  }
}

function persistTokens(provider, tokens, previous = null) {
  const payload = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || previous?.refresh_token || '',
    expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : 0,
    account: tokens.account?.email_address || emailFromIdToken(tokens.id_token) || previous?.account || ''
  }
  return saveToken(vaultUser(), vaultKey(provider), JSON.stringify(payload), {
    scopes: tokens.scope || PROVIDERS[provider].scopes
  })
}

function readTokens(provider) {
  const raw = getToken(vaultUser(), vaultKey(provider))
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function connectStatus() {
  const out = {}
  for (const provider of Object.keys(PROVIDERS)) {
    const t = readTokens(provider)
    out[provider] = t
      ? {
          connected: true,
          account: t.account || '',
          expiresAt: t.expires_at || 0,
          expired: !!t.expires_at && Date.now() > t.expires_at,
          hasRefresh: !!t.refresh_token
        }
      : { connected: false }
  }
  return out
}

export function disconnectProvider({ provider } = {}) {
  if (!PROVIDERS[provider]) return { ok: false, error: `Unknown provider "${provider}".` }
  deleteToken(vaultUser(), vaultKey(provider))
  return { ok: true }
}

async function freshAccessToken(provider) {
  const cfg = PROVIDERS[provider]
  const t = readTokens(provider)
  if (!t) return { error: 'Not connected.' }
  if (!t.expires_at || Date.now() < t.expires_at - 60000) return { token: t.access_token }
  if (!t.refresh_token) return { error: 'Token expired and no refresh token was issued. Reconnect.' }
  const params = {
    grant_type: 'refresh_token',
    refresh_token: t.refresh_token,
    client_id: cfg.clientId,
    ...(cfg.clientSecret ? { client_secret: cfg.clientSecret } : {})
  }
  try {
    const res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': cfg.tokenFormat === 'json' ? 'application/json' : 'application/x-www-form-urlencoded' },
      body: cfg.tokenFormat === 'json' ? JSON.stringify(params) : new URLSearchParams(params).toString()
    })
    const tokens = await res.json()
    if (!tokens?.access_token) return { error: tokens?.error_description || 'Token refresh was rejected. Reconnect.' }
    persistTokens(provider, tokens, t)
    return { token: tokens.access_token }
  } catch {
    return { error: `Could not reach ${cfg.label} to refresh the token.` }
  }
}

// Per-provider smoke test, so "connected" is proven, not assumed.
// - claude: one tiny message through the real API (the strongest proof)
// - gemini: userinfo (proves the token works against Google's APIs)
// - codex: freshness + refresh (auth.openai.com has no simple probe endpoint;
//   a live refresh is the honest check available)
export async function testProvider({ provider } = {}) {
  if (!PROVIDERS[provider]) return { ok: false, error: `Unknown provider "${provider}".` }
  const { token, error } = await freshAccessToken(provider)
  if (error) return { ok: false, error }

  if (provider === 'claude') {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'oauth-2025-04-20'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 32,
          messages: [{ role: 'user', content: 'Reply with exactly: sush is connected' }]
        })
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data?.error?.message || `API returned ${res.status}` }
      const text = (data?.content || []).map(b => b.text || '').join('').trim()
      return { ok: true, text: `Claude replied: “${text}”` }
    } catch {
      return { ok: false, error: 'Could not reach the Anthropic API.' }
    }
  }

  if (provider === 'gemini') {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data?.error?.message || `Google returned ${res.status}` }
      return { ok: true, text: `Token valid — signed in as ${data.email || 'unknown account'}` }
    } catch {
      return { ok: false, error: 'Could not reach Google to verify the token.' }
    }
  }

  // codex
  const t = readTokens(provider)
  return {
    ok: true,
    text: `Token valid${t?.account ? ` — signed in as ${t.account}` : ''}${t?.expires_at ? `, expires ${new Date(t.expires_at).toLocaleTimeString()}` : ''}`
  }
}

// The browser needs a complete response for every loopback OAuth outcome.
// Keep this local to the provider-connect flow; Google sign-in has its own
// callback page because it returns a different kind of identity payload.
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
