#!/usr/bin/env node
// Offline unlock-code minter. Run with plain node — it imports the SAME secret
// and signing function the app uses (src/main/license-secret.mjs), so codes it
// prints will verify in the app and the two can never drift.
//
//   node tools/mint-code.mjs plus            → one Plus code
//   node tools/mint-code.mjs pro 5           → five Pro codes
//   node tools/mint-code.mjs plus 3 2026-12-31  → three Plus trial codes that
//                                                 stop working after that date
import { mintCodes, parseMintRequest } from '../src/main/license-mint.mjs'

const request = parseMintRequest(process.argv.slice(2))
if (!request.ok) {
  console.error(request.error)
  process.exit(1)
}
for (const code of mintCodes(request)) console.log(code)
