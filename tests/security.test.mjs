import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sign } from '../src/main/license-secret.mjs'
import { resolveStoredLicense, verifySignedCode } from '../src/main/license-core.mjs'
import { loadSushrc } from '../src/main/shell/sushrc.js'
import { ScrollbackStore } from '../src/main/shell/scrollback.js'

function codeFor(tier, nonce = 'ABCDEFGH', expiry = null) {
  const signature = sign(tier, nonce, expiry)
  return expiry
    ? `SUSH-${tier.toUpperCase()}-${expiry}-${nonce}-${signature}`
    : `SUSH-${tier.toUpperCase()}-${nonce}-${signature}`
}

describe('signed license resolution', () => {
  it('does not trust a tier-only record', () => {
    expect(resolveStoredLicense({ tier: 'max' })).toEqual({ tier: 'free' })
  })

  it('derives the tier from the code instead of a mismatched stored field', () => {
    const plus = codeFor('plus')
    expect(resolveStoredLicense({ tier: 'max', code: plus })).toMatchObject({ tier: 'plus', code: plus })
  })

  it('falls back only to a verified permanent previous code', () => {
    const pro = codeFor('pro', 'BCDEFGHJ')
    expect(resolveStoredLicense({ tier: 'max', code: 'broken', previousCode: pro })).toEqual({ tier: 'pro', code: pro })
    expect(resolveStoredLicense({ tier: 'max', code: 'broken', previousCode: 'also-broken' })).toEqual({ tier: 'free' })
  })

  it('rejects impossible calendar dates instead of normalizing them', () => {
    const invalid = codeFor('plus', 'CDEFGHJK', '20260231')
    expect(verifySignedCode(invalid, Date.UTC(2026, 0, 1)).ok).toBe(false)
  })
})

describe('project .sushrc trust', () => {
  it('ignores project aliases, env, and startup unless the host opts in', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sush-project-rc-'))
    try {
      writeFileSync(join(dir, '.sushrc'), '[alias]\npwn = bad\n[env]\nEVIL = yes\n[startup]\necho owned\n')
      const base = loadSushrc()
      const ignored = loadSushrc(dir, { trustProject: false })
      expect(ignored.alias).toEqual(base.alias)
      expect(ignored.env).toEqual(base.env)
      expect(ignored.startup).toEqual(base.startup)
      expect(ignored.projectApplied).not.toBe(true)

      const trusted = loadSushrc(dir, { trustProject: true })
      expect(trusted.projectApplied).toBe(true)
      expect(trusted.alias.pwn).toBe('bad')
      expect(trusted.env.EVIL).toBe('yes')
      expect(trusted.startup).toContain('echo owned')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('scrollback identity isolation', () => {
  it('filters saved and keyed live results by restore-key prefix', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sush-scrollback-scope-'))
    try {
      const store = new ScrollbackStore(dir)
      store.attach('a-saved', 'u:alice:shell:/repo')
      store.append('a-saved', 'shared-marker alice secret')
      store.persist('a-saved')
      store.attach('b-saved', 'u:bob:shell:/repo')
      store.append('b-saved', 'shared-marker bob secret')
      store.persist('b-saved')
      store.attach('b-live', 'u:bob:shell:/live')
      store.append('b-live', 'shared-marker bob live')

      const results = store.search('shared-marker', { savedKeyPrefix: 'u:alice:' })
      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({ key: 'u:alice:shell:/repo', saved: true })
      expect(results[0].lines[0].text).toContain('alice secret')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps a volatile tail for lock/unlock without writing it as saved history', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sush-scrollback-volatile-'))
    try {
      const store = new ScrollbackStore(dir)
      store.attach('volatile', 'u:alice:shell:/private', { persist: false })
      store.append('volatile', 'visible after unlock')
      expect(store.tail('volatile')).toContain('visible after unlock')
      store.persist('volatile')
      expect(store.tail('volatile')).toBe('')
      expect(store.saved.has('u:alice:shell:/private')).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
