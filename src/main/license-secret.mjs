// Shared signing core for Sush unlock codes. Kept PURE (no electron import) and
// as an .mjs so BOTH the main process (via license.js) and the offline minter
// (tools/mint-code.mjs, run with plain `node`) import the exact same secret and
// algorithm — they can never drift out of sync.
//
// CLIENT-SIDE secret: it ships inside the app, so a determined user can extract
// it and mint their own codes. That is an accepted trade-off. This is gentle
// tier *gating*, not DRM or a paywall — there is no server and no payment, just
// a code that flips a feature flag. Don't treat a leaked secret as a breach.
import { createHmac } from 'crypto'

export const SECRET = 'W8HvXmTAt64GyCNKptYrjimZxYIci6J07OFjuwklsV8='
export const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford-ish: no I/L/O/U
export const TIERS = ['plus', 'pro']

// First 10 base32 chars of HMAC-SHA256(SECRET, message). `expiry` (YYYYMMDD) is
// folded into the signed message for dated/trial codes so it can't be edited.
export function sign(tier, nonce, expiry) {
  const msg = expiry ? `${tier}:${expiry}:${nonce}` : `${tier}:${nonce}`
  const h = createHmac('sha256', SECRET).update(msg).digest()
  let out = ''
  for (let i = 0; i < 10; i++) out += B32[h[i] % 32]
  return out
}

// Random base32 string of length n (for nonces in the minter).
export function rand32(n, randomBytes) {
  const b = randomBytes(n)
  let o = ''
  for (let i = 0; i < n; i++) o += B32[b[i] % 32]
  return o
}
