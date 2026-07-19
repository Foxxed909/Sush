import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { atomicWriteJson } from '../secure-storage'

// Global (not per-identity) OAuth client config. It must be readable before
// anyone signs in — the lock screen needs it — so it lives next to
// sush-users.json instead of renderer localStorage (which is per-user
// scoped). Plaintext is fine: a device-flow client id and an installed-app
// Google secret are app registration data, not access-granting credentials.
//
// Sush ships built-in OAuth client registrations (public by design — same
// model as gh CLI / VS Code / gcloud; an installed-app "secret" is not a
// secret) so "Continue with ..." works out of the box. A value saved in
// sush-oauth.json overrides the built-in.
const DEFAULT_GITHUB_CLIENT_ID = 'Ov23lidlNNPLGTU05JOD'
// Google Desktop-app client (loopback PKCE). An installed-app "secret" is
// public by design — Google's docs say loopback clients cannot keep one;
// gcloud ships its own the same way. It grants nothing without the user's
// live browser session.
const DEFAULT_GOOGLE_CLIENT_ID = '1034687780333-b1guo43785imdpl2np1blrv9iqvfe3vu.apps.googleusercontent.com'
const DEFAULT_GOOGLE_CLIENT_SECRET = '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'

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
    google: {
      clientId: s.google.clientId || DEFAULT_GOOGLE_CLIENT_ID,
      clientSecret: s.google.clientSecret || DEFAULT_GOOGLE_CLIENT_SECRET
    }
  }
}

export function setOauthConfig(patch = {}) {
  const s = loadStored()
  if (patch.github && typeof patch.github.clientId === 'string') s.github.clientId = patch.github.clientId.trim()
  if (patch.google) {
    if (typeof patch.google.clientId === 'string') s.google.clientId = patch.google.clientId.trim()
    if (typeof patch.google.clientSecret === 'string') s.google.clientSecret = patch.google.clientSecret.trim()
  }
  try { atomicWriteJson(configFile(), s) } catch (e) {
    return { ok: false, error: e.message }
  }
  return { ok: true }
}

// Renderer-safe shape: the secret never crosses the bridge, only its
// presence; each provider exposes whether the built-in app is in play and
// whether sign-in is ready to use at all.
export function publicOauthConfig() {
  const s = loadStored()
  const eff = getOauthConfig()
  return {
    github: {
      clientId: s.github.clientId,
      usingBuiltIn: !s.github.clientId,
      configured: !!eff.github.clientId
    },
    google: {
      clientId: s.google.clientId,
      hasSecret: !!s.google.clientSecret,
      usingBuiltIn: !s.google.clientId && !s.google.clientSecret,
      configured: !!(eff.google.clientId && eff.google.clientSecret)
    }
  }
}
