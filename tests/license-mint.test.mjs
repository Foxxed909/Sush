import { describe, expect, it } from 'vitest'
import { parseMintRequest } from '../src/main/license-mint.mjs'

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
})
