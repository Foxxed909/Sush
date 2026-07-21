import { getOauthConfig } from './config'
import { linkProvider, activateUserViaProvider, userHomeDir } from '../users'
import { saveToken } from './tokenStore'
import { syncGitHubCliToken } from './github-cli-auth'
import { GITHUB_DEVICE_SCOPES } from './github-scopes'
import { createTicket } from './tickets'
import { emitOauthEvent } from './events'

// GitHub Device Flow (no client secret — the user registers an OAuth App
// once and pastes its client id into Settings). One flow at a time; the
// renderer shows the user code, the browser does the approving, and we poll
// until GitHub hands over a token. Progress goes out over 'sush:oauth-event'.

const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const TOKEN_URL = 'https://github.com/login/oauth/access_token'
const SCOPES = GITHUB_DEVICE_SCOPES

let active = null

async function persistGitHubLogin(userId, token, profile) {
  const stored = saveToken(userId, 'github', token, { login: profile.login, scopes: SCOPES })
  const cli = await syncGitHubCliToken({ token, configDir: `${userHomeDir(userId)}/.gh` })
  const warnings = [stored.ok ? '' : stored.error, cli.ok ? '' : `GitHub CLI was not signed in: ${cli.error}`].filter(Boolean)
  return warnings.length ? warnings.join(' ') : undefined
}

function stopActive(emitCancel) {
  if (!active) return
  active.cancelled = true
  clearTimeout(active.timer)
  active = null
  if (emitCancel) emitOauthEvent({ provider: 'github', phase: 'cancelled' })
}

export function cancelGitHubFlow() {
  stopActive(true)
  return { ok: true }
}

export async function startGitHubFlow({ mode = 'link', userId } = {}) {
  const clientId = getOauthConfig().github.clientId.trim()
  if (!clientId) {
    return { ok: false, error: 'GitHub sign-in is not set up yet. Paste an OAuth App client id in Settings > Accounts.' }
  }
  stopActive(false)

  let data
  try {
    const res = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, scope: SCOPES })
    })
    data = await res.json()
  } catch {
    return { ok: false, error: 'Could not reach GitHub. Are you online?' }
  }
  if (!data?.device_code) {
    return { ok: false, error: data?.error_description || 'GitHub rejected the request. Is the client id right and Device Flow enabled on the OAuth App?' }
  }

  const expiresIn = Number(data.expires_in) || 900
  const flow = {
    cancelled: false,
    timer: null,
    deviceCode: data.device_code,
    interval: Math.max(5, Number(data.interval) || 5),
    expiresAt: Date.now() + expiresIn * 1000
  }
  active = flow
  schedulePoll(flow, { mode, userId, clientId })
  emitOauthEvent({
    provider: 'github', phase: 'device-code',
    userCode: data.user_code, verificationUri: data.verification_uri, expiresIn
  })
  return { ok: true, userCode: data.user_code, verificationUri: data.verification_uri, expiresIn }
}

function schedulePoll(flow, ctx) {
  flow.timer = setTimeout(() => { pollOnce(flow, ctx) }, flow.interval * 1000)
}

async function pollOnce(flow, ctx) {
  if (flow.cancelled) return
  if (Date.now() > flow.expiresAt) {
    finish(flow, { provider: 'github', phase: 'error', error: 'The code expired. Try again.' })
    return
  }
  let data
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: ctx.clientId,
        device_code: flow.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    })
    data = await res.json()
  } catch {
    // Transient network blip — keep polling until the code expires.
    if (!flow.cancelled) schedulePoll(flow, ctx)
    return
  }
  if (flow.cancelled) return
  if (data.error === 'authorization_pending') { schedulePoll(flow, ctx); return }
  if (data.error === 'slow_down') { flow.interval += 5; schedulePoll(flow, ctx); return }
  if (data.error === 'expired_token') { finish(flow, { provider: 'github', phase: 'error', error: 'The code expired. Try again.' }); return }
  if (data.error === 'access_denied') { finish(flow, { provider: 'github', phase: 'cancelled' }); return }
  if (!data.access_token) { finish(flow, { provider: 'github', phase: 'error', error: data.error_description || 'GitHub sign-in failed.' }); return }
  await complete(flow, ctx, data.access_token)
}

async function complete(flow, ctx, token) {
  let me
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Sush-Terminal'
      }
    })
    me = await res.json()
  } catch {
    finish(flow, { provider: 'github', phase: 'error', error: 'Signed in, but could not read your GitHub profile.' })
    return
  }
  if (flow.cancelled) return
  if (!me?.id) {
    finish(flow, { provider: 'github', phase: 'error', error: 'GitHub profile came back empty.' })
    return
  }
  const profile = { id: String(me.id), login: me.login || '', name: me.name || '', avatarUrl: me.avatar_url || '' }

  if (ctx.mode === 'link') {
    const linked = linkProvider({ id: ctx.userId, provider: 'github', profile })
    if (!linked.ok) {
      finish(flow, { provider: 'github', phase: 'error', error: linked.error })
      return
    }
    const warning = await persistGitHubLogin(ctx.userId, token, profile)
    finish(flow, { provider: 'github', phase: 'success', mode: 'link', user: linked.user, warning })
    return
  }

  // signin: match an identity by GitHub account id; otherwise park a ticket
  // so the create form can claim the profile (and token) atomically.
  const activated = activateUserViaProvider({ provider: 'github', subject: profile.id })
  if (activated.ok) {
    const warning = await persistGitHubLogin(activated.user.id, token, profile)
    finish(flow, { provider: 'github', phase: 'success', mode: 'signin', user: activated.user, warning })
  } else {
    const ticket = createTicket({ provider: 'github', profile, token })
    finish(flow, { provider: 'github', phase: 'success', mode: 'signin', user: null, ticket, profile })
  }
}

function finish(flow, event) {
  if (flow.cancelled) return
  flow.cancelled = true
  clearTimeout(flow.timer)
  if (active === flow) active = null
  emitOauthEvent(event)
}
