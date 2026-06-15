import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { sign } from './license-secret.mjs'

// Offline tier gating. The user redeems a code I mint (tools/mint-code.mjs); the
// app verifies it locally — no server, no payment. Verification is HMAC-based,
// so it works fully offline. Gating is GENTLE: locked features show an "unlock"
// hint, they don't fight the user. See license-secret.mjs for why a leaked
// secret isn't a breach here.
//
// One source of truth for what each tier unlocks. Main reads it directly for
// the things it owns (account slots, cloud TTS); the renderer mirrors it via
// `license-get` so the UI gates the same way.
// `themes` is reserved for a future gate (no base/premium flag on themes yet),
// so it's intentionally NOT advertised in the Plan table or enforced — all
// themes are free for now. The four enforced gates are slots/gridCap/
// customAgents/cloudTts.
export const TIER_FEATURES = {
  free: { slots: 1, gridCap: 4,  customAgents: false, cloudTts: false, themes: 'base' },
  plus: { slots: 4, gridCap: 9,  customAgents: true,  cloudTts: true,  themes: 'all'  },
  pro:  { slots: 8, gridCap: 16, customAgents: true,  cloudTts: true,  themes: 'all'  }
}
const RANK = { free: 0, plus: 1, pro: 2 }
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
  const code = String(raw || '').trim().toUpperCase()
  const plain = code.match(/^SUSH-(PLUS|PRO)-([0-9A-Z]{8})-([0-9A-Z]{10})$/)
  const dated = code.match(/^SUSH-(PLUS|PRO)-(\d{8})-([0-9A-Z]{8})-([0-9A-Z]{10})$/)
  let tier, nonce, s, expiry = null
  if (plain) { ;[, tier, nonce, s] = plain }
  else if (dated) { ;[, tier, expiry, nonce, s] = dated }
  else return { ok: false, error: 'That code doesn’t look right.' }
  tier = tier.toLowerCase()
  if (s !== sign(tier, nonce, expiry)) return { ok: false, error: 'That code isn’t valid.' }
  if (expiry) {
    const y = +expiry.slice(0, 4), mo = +expiry.slice(4, 6), d = +expiry.slice(6, 8)
    const exp = Date.UTC(y, mo - 1, d, 23, 59, 59)
    if (Date.now() > exp) return { ok: false, error: 'This code has expired.' }
  }
  return { ok: true, tier, expiry }
}

// Current license, defaulting to free. A stored dated code that has since
// expired silently reverts to free (re-verified on each read — it's just an
// in-memory HMAC, cheap).
export function getLicense() {
  try {
    if (existsSync(file())) {
      const d = JSON.parse(readFileSync(file(), 'utf8'))
      if (d && RANK[d.tier] != null) {
        if (d.code && !verifyCode(d.code).ok) return { tier: 'free' }
        return d
      }
    }
  } catch {}
  return { tier: 'free' }
}

export function redeemCode(raw) {
  const v = verifyCode(raw)
  if (!v.ok) return v
  const data = { tier: v.tier, code: String(raw).trim().toUpperCase(), redeemedAt: Date.now() }
  if (v.expiry) data.expiry = v.expiry
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
