import { ok, err, ansi } from './_helpers'
import { redeemCode, licensePublic } from '../license'

// `plan` — show the current tier and what it unlocks.
export const plan = {
  name: 'plan',
  description: 'Show your current plan and what it unlocks',
  usage: 'plan',
  aliases: ['tier'],
  async run() {
    const { tier, features, expiry } = licensePublic()
    const label = tier.charAt(0).toUpperCase() + tier.slice(1)
    const lines = [
      ansi.bold(ansi.pink(`PLAN — ${label}${expiry ? ' (trial)' : ''}`)),
      ansi.dim('─'.repeat(34)),
      `${ansi.cyan('Accounts/CLI')}  ${features.slots}`,
      `${ansi.cyan('Grid sessions')} ${features.gridCap}`,
      `${ansi.cyan('Custom agents')} ${features.customAgents ? ansi.green('yes') : ansi.dim('—')}`,
      `${ansi.cyan('Cloud voices')}  ${features.cloudTts ? ansi.green('yes') : ansi.dim('—')}`,
      '',
      tier === 'pro'
        ? ansi.dim('You’re on the top tier.')
        : ansi.dim('Have a code? Run:  unlock SUSH-…')
    ]
    return ok(lines.join('\r\n'))
  }
}

// `unlock <code>` — redeem an unlock code from the terminal. Redemption emits a
// license-changed broadcast (see license.js), so the UI updates live.
export const unlock = {
  name: 'unlock',
  description: 'Redeem an unlock code to raise your plan tier',
  usage: 'unlock <SUSH-CODE>',
  aliases: ['redeem'],
  async run(args) {
    const code = (args || []).join(' ').trim()
    if (!code) return err('unlock: paste your code — e.g. unlock SUSH-PLUS-XXXXXXXX-XXXXXXXXXX')
    const r = redeemCode(code)
    if (!r.ok) return err(`unlock: ${r.error || 'could not redeem that code.'}`)
    const label = r.tier.charAt(0).toUpperCase() + r.tier.slice(1)
    return ok(ansi.green(`✓ Unlocked ${ansi.bold(label)}. ${r.features.slots} accounts/CLI, grid up to ${r.features.gridCap}, custom agents${r.features.cloudTts ? ' + cloud voices' : ''}.`))
  }
}
