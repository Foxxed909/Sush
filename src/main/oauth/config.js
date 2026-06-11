import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'

// Global (not per-identity) OAuth client config. It must be readable before
// anyone signs in — the lock screen needs it — so it lives next to
// sush-users.json instead of renderer localStorage (which is per-user
// scoped). Plaintext is fine: a device-flow client id and an installed-app
// Google secret are app registration data, not access-granting credentials.
//
// Sush ships a built-in GitHub OAuth App client id (public by design — same
// model as gh CLI / VS Code) so "Continue with GitHub" works out of the box.
// A value saved in sush-oauth.json overrides it. Google has no built-in:
// loopback clients need a per-install Cloud Console registration.
const DEFAULT_GITHUB_CLIENT_ID = 'Ov23lidlNNPLGTU05JOD'

let stored = null   // exactly what's on disk (no defaults baked in)

function configFile() {
  return join(app.getPath('userData'), 'sush-oauth.json')
}

function loadStored() {
  if (stored) return stored
  stored = { version: 1, github: { clientId: '' }, google: { clientId: '', clientSecret: '' } }
  try {
    if (existsSync(configFile())) {
      const data = JSON.parse(readFileSync(configFile(), 'utf8'))
      stored.github.clientId = String(data?.github?.clientId ?? '')
      stored.google.clientId = String(data?.google?.clientId ?? '')
      stored.google.clientSecret = String(data?.google?.clientSecret ?? '')
    }
  } catch {}
  return stored
}

// Effective config: what the flows should actually use.
export function getOauthConfig() {
  const s = loadStored()
  return {
    github: { clientId: s.github.clientId || DEFAULT_GITHUB_CLIENT_ID },
    google: { clientId: s.google.clientId, clientSecret: s.google.clientSecret }
  }
}

export function setOauthConfig(patch = {}) {
  const s = loadStored()
  if (patch.github && typeof patch.github.clientId === 'string') s.github.clientId = patch.github.clientId.trim()
  if (patch.google) {
    if (typeof patch.google.clientId === 'string') s.google.clientId = patch.google.clientId.trim()
    if (typeof patch.google.clientSecret === 'string') s.google.clientSecret = patch.google.clientSecret.trim()
  }
  try { writeFileSync(configFile(), JSON.stringify(s, null, 2), 'utf8') } catch (e) {
    return { ok: false, error: e.message }
  }
  return { ok: true }
}

// Renderer-safe shape: the secret never crosses the bridge, only its
// presence; github exposes whether the built-in app id is in play.
export function publicOauthConfig() {
  const s = loadStored()
  return {
    github: { clientId: s.github.clientId, usingBuiltIn: !s.github.clientId },
    google: { clientId: s.google.clientId, hasSecret: !!s.google.clientSecret }
  }
}
