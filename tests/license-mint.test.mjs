import { describe, expect, it } from 'vitest'
import { mintCodes, parseMintRequest } from '../src/main/license-mint.mjs'
import { verifySignedCode } from '../src/main/license-core.mjs'
import { TIER_FEATURES } from '../src/main/license.js'
import { allowanceFor } from '../src/main/credits.js'

describe('offline license mint arguments', () => {
  it('rejects impossible calendar dates instead of minting unusable codes', () => {
    expect(parseMintRequest(['pro', '1', '2026-02-31'])).toMatchObject({
      ok: false,
      error: expect.stringContaining('valid calendar date')
    })
  })

  it('normalizes bounded integer counts and valid expiry dates', () => {
    expect(parseMintRequest(['max', '2.9', '2026-12-31'])).toEqual({
      ok: true,
      tier: 'max',
      count: 2,
      expiry: '20261231'
    })
    expect(parseMintRequest(['pro', '999'])).toMatchObject({ ok: true, count: 100 })
  })

  it('mints Dev codes that the app verifies', () => {
    const request = parseMintRequest(['dev', '1'])
    expect(request).toMatchObject({ ok: true, tier: 'dev', count: 1, expiry: null })
    const [code] = mintCodes(request, () => Buffer.from([8, 7, 6, 5, 4, 3, 2, 1]))
    expect(code).toMatch(/^SUSH-DEV-[0-9A-Z]{8}-[0-9A-Z]{10}$/)
    expect(verifySignedCode(code)).toMatchObject({ ok: true, tier: 'dev' })
  })

  it('reserves developer workflows for Dev, Max, and Enterprise', () => {
    expect(TIER_FEATURES.dev).toMatchObject({ slots: 5, gridCap: 10, developerWorkflows: true })
    expect(allowanceFor('dev')).toBe(90 * 60)
    for (const tier of ['free', 'plus', 'pro', 'ultra']) {
      expect(TIER_FEATURES[tier].developerWorkflows).toBe(false)
    }
    for (const tier of ['dev', 'max', 'enterprise']) {
      expect(TIER_FEATURES[tier].developerWorkflows).toBe(true)
    }
  })
})
