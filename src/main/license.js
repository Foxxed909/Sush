import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { resolveStoredLicense, verifySignedCode } from './license-core.mjs'
import { TIER_FEATURES } from '../shared/tiers'

// Offline tier gating. The user redeems a code I mint (tools/mint-code.mjs); the
// app verifies it locally — no server, no payment. Verification is HMAC-based,
// so it works fully offline. Gating is GENTLE: locked features show an "unlock"
// hint, they don't fight the user. See license-secret.mjs for why a leaked
// secret isn't a breach here.
//
// The tier table lives in src/shared/tiers.js — shared with the renderer's
// useEntitlements pre-load fallback so the two can never drift again. Main
// reads it directly for the things it owns (account slots, cloud TTS); the
// renderer mirrors it via `license-get` so the UI gates the same way.
export { TIER_FEATURES }
const file = () => join(app.getPath('userData'), 'sush-license.json')

// Set by main so any path that changes the license (IPC redeem OR the `unlock`
// shell command) pushes one consistent `license-changed` broadcast to the UI.
let _emit = null
export function setLicenseChangeSender(fn) { _emit = typeof fn === 'function' ? fn : null }
function emitChange() { try { _emit?.(licensePublic()) } catch {} }

// Parse + verify a code without persisting anything. Accepts a plain code
// (SUSH-TIER-NONCE-SIG) or a dated/trial code (SUSH-TIER-YYYYMMDD-NONCE-SIG)
// that stops working after its date.
export function verifyCode(raw) {
  return verifySignedCode(raw)
}

// Current license, defaulting to free. A stored dated code that has since
// expired falls back to the permanent code redeemed before it (kept as
// `previousCode` — see redeemCode), else to free. Re-verified on each read —
// it's just an in-memory HMAC, cheap.
export function getLicense() {
  try {
    if (existsSync(file())) {
      const d = JSON.parse(readFileSync(file(), 'utf8'))
      return resolveStoredLicense(d)
    }
  } catch {}
  return { tier: 'free' }
}

export function redeemCode(raw) {
  const v = verifyCode(raw)
  if (!v.ok) return v
  const data = { tier: v.tier, code: String(raw).trim().toUpperCase(), redeemedAt: Date.now() }
  if (v.expiry) {
    data.expiry = v.expiry
    // A dated (trial) code must not destroy the tier the user already owns:
    // keep their permanent code alongside so the lapse falls back to it
    // instead of dumping them to free. (Trial-over-trial keeps the original.)
    const current = getLicense()
    const keeper = current.code && !current.expiry && verifyCode(current.code).ok
      ? current.code
      : current.previousCode
    if (keeper) data.previousCode = keeper
  }
  try { writeFileSync(file(), JSON.stringify(data, null, 2), 'utf8') } catch (e) { return { ok: false, error: e.message } }
  emitChange()
  return { ok: true, tier: v.tier, features: TIER_FEATURES[v.tier] }
}

// Revert to free (dev/testing, and a user-facing "remove code").
export function clearLicense() {
  try { if (existsSync(file())) rmSync(file()) } catch {}
  emitChange()
  return { ok: true, tier: 'free', features: TIER_FEATURES.free }
}

export function tierOf() { return getLicense().tier }
export function featuresOf(tier = getLicense().tier) { return TIER_FEATURES[tier] || TIER_FEATURES.free }
export function can(feature) { return !!featuresOf()[feature] }
export function limitOf(feature) { return featuresOf()[feature] }

// What the renderer is allowed to see: the active tier, its resolved features,
// and the whole tier table (so the Plan screen can show what each unlocks).
export function licensePublic() {
  const lic = getLicense()
  return { tier: lic.tier, expiry: lic.expiry || null, features: featuresOf(lic.tier), tiers: TIER_FEATURES }
}
