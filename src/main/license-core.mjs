import { sign } from './license-secret.mjs'

const PAID_TIERS = new Set(['plus', 'pro', 'ultra', 'max'])

function freeLicense() {
  return { tier: 'free' }
}

function normalizedCode(raw) {
  return String(raw || '').trim().toUpperCase()
}

function validCalendarDate(value) {
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6))
  const day = Number(value.slice(6, 8))
  const date = new Date(Date.UTC(year, month - 1, day, 23, 59, 59))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null
  return date
}

// Pure verifier used by both the Electron-backed license store and unit tests.
// `now` is injectable so expiry behavior is deterministic in tests.
export function verifySignedCode(raw, now = Date.now()) {
  const code = normalizedCode(raw)
  const plain = code.match(/^SUSH-(PLUS|PRO|ULTRA|MAX)-([0-9A-Z]{8})-([0-9A-Z]{10})$/)
  const dated = code.match(/^SUSH-(PLUS|PRO|ULTRA|MAX)-(\d{8})-([0-9A-Z]{8})-([0-9A-Z]{10})$/)
  let tier, nonce, signature, expiry = null
  if (plain) { ;[, tier, nonce, signature] = plain }
  else if (dated) { ;[, tier, expiry, nonce, signature] = dated }
  else return { ok: false, error: 'That code doesn’t look right.' }

  tier = tier.toLowerCase()
  if (!PAID_TIERS.has(tier) || signature !== sign(tier, nonce, expiry)) {
    return { ok: false, error: 'That code isn’t valid.' }
  }
  if (expiry) {
    const expiryDate = validCalendarDate(expiry)
    if (!expiryDate) return { ok: false, error: 'That code has an invalid expiry date.' }
    if (Number(now) > expiryDate.getTime()) return { ok: false, error: 'This code has expired.' }
  }
  return { ok: true, tier, expiry, code }
}

// Resolve an untrusted JSON record from disk. Tier and expiry are always derived
// from a verified code; fields such as { tier: 'max' } can never grant access.
export function resolveStoredLicense(data, now = Date.now()) {
  if (!data || typeof data !== 'object') return freeLicense()

  const current = verifySignedCode(data.code, now)
  if (current.ok) {
    const resolved = { tier: current.tier, code: current.code }
    if (current.expiry) resolved.expiry = current.expiry
    if (Number.isFinite(data.redeemedAt)) resolved.redeemedAt = data.redeemedAt

    // Preserve a valid permanent fallback for an active trial, but never trust
    // or surface an unverified previous code.
    if (current.expiry) {
      const previous = verifySignedCode(data.previousCode, now)
      if (previous.ok && !previous.expiry) resolved.previousCode = previous.code
    }
    return resolved
  }

  const previous = verifySignedCode(data.previousCode, now)
  if (previous.ok && !previous.expiry) {
    return { tier: previous.tier, code: previous.code }
  }
  return freeLicense()
}
