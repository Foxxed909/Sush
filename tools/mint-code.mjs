#!/usr/bin/env node
// Offline unlock-code minter. Run with plain node — it imports the SAME secret
// and signing function the app uses (src/main/license-secret.mjs), so codes it
// prints will verify in the app and the two can never drift.
//
//   node tools/mint-code.mjs plus            → one Plus code
//   node tools/mint-code.mjs pro 5           → five Pro codes
//   node tools/mint-code.mjs plus 3 2026-12-31  → three Plus trial codes that
//                                                 stop working after that date
import { randomBytes } from 'crypto'
import { sign, rand32, TIERS } from '../src/main/license-secret.mjs'

const tier = (process.argv[2] || '').toLowerCase()
const count = Math.max(1, Math.min(100, Number(process.argv[3]) || 1))
const expiresArg = process.argv[4] // optional YYYY-MM-DD

if (!TIERS.includes(tier)) {
  console.error('usage: node tools/mint-code.mjs <plus|pro> [count] [expires YYYY-MM-DD]')
  process.exit(1)
}

let expiry = null
if (expiresArg) {
  const m = expiresArg.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) { console.error(`bad date "${expiresArg}" — use YYYY-MM-DD`); process.exit(1) }
  expiry = m[1] + m[2] + m[3] // YYYYMMDD, the form folded into the signature
}

for (let i = 0; i < count; i++) {
  const nonce = rand32(8, randomBytes)
  const s = sign(tier, nonce, expiry)
  const code = expiry
    ? `SUSH-${tier.toUpperCase()}-${expiry}-${nonce}-${s}`
    : `SUSH-${tier.toUpperCase()}-${nonce}-${s}`
  console.log(code)
}
