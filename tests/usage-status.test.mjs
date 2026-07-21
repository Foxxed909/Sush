import { describe, expect, it } from 'vitest'
import { activeProviderUsage, claudeLimitStatus, providerNeedsNetwork } from '../src/renderer/src/lib/usageStatus.js'

describe('usage status snapshots', () => {
  it('unwraps the Claude limits payload instead of rendering its IPC wrapper', () => {
    const limits = { status: 'allowed', resetsAt: 1773441600000 }
    const snapshot = { claude: { limits: { ok: true, limits } } }

    expect(claudeLimitStatus(snapshot)).toEqual(limits)
    expect(claudeLimitStatus(snapshot)?.status).toBe('allowed')
  })

  it('prefers a per-account check and exposes health checks for every provider', () => {
    const checked = { kind: 'health', status: 'CLI ready', healthy: true }
    const snapshot = { codex: { account: { usage: checked } } }

    expect(activeProviderUsage(snapshot, 'codex')).toEqual(checked)
    expect(providerNeedsNetwork('claude')).toBe(true)
    expect(providerNeedsNetwork('codex')).toBe(true)
    expect(providerNeedsNetwork('gemini')).toBe(false)
    expect(providerNeedsNetwork('opencode')).toBe(false)
  })
})
