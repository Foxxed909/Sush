import { randomBytes } from 'crypto'
import { rand32, sign, TIERS } from './license-secret.mjs'

function validDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function parseMintRequest(args = []) {
  const tier = String(args[0] || '').toLowerCase()
  if (!TIERS.includes(tier)) {
    return { ok: false, error: `usage: node tools/mint-code.mjs <${TIERS.join('|')}> [count] [expires YYYY-MM-DD]` }
  }

  const requested = Number(args[1] ?? 1)
  const count = Math.max(1, Math.min(100, Number.isFinite(requested) ? Math.floor(requested) : 1))
  const expiresArg = args[2]
  let expiry = null
  if (expiresArg) {
    const match = String(expiresArg).match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return { ok: false, error: `bad date "${expiresArg}" - use YYYY-MM-DD` }
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    if (!validDateParts(year, month, day)) {
      return { ok: false, error: `bad date "${expiresArg}" - use a valid calendar date` }
    }
    expiry = match[1] + match[2] + match[3]
  }
  return { ok: true, tier, count, expiry }
}

export function mintCodes(request, random = randomBytes) {
  if (!request?.ok) return []
  const codes = []
  for (let i = 0; i < request.count; i++) {
    const nonce = rand32(8, random)
    const signature = sign(request.tier, nonce, request.expiry)
    codes.push(request.expiry
      ? `SUSH-${request.tier.toUpperCase()}-${request.expiry}-${nonce}-${signature}`
      : `SUSH-${request.tier.toUpperCase()}-${nonce}-${signature}`)
  }
  return codes
}
