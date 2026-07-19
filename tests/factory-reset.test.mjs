import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { resetSushUserData } from '../src/main/factory-reset.js'

describe('factory reset containment', () => {
  it('removes only the declared Sush state and can preserve the license', () => {
    const root = mkdtempSync(join(tmpdir(), 'sush-reset-'))
    try {
      mkdirSync(join(root, 'identities', 'a1b2c3d4'), { recursive: true })
      writeFileSync(join(root, 'identities', 'a1b2c3d4', 'token'), 'private')
      writeFileSync(join(root, 'sush-users.json'), '{"users":[]}', 'utf8')
      writeFileSync(join(root, 'sush-scrollback.json'), '{}', 'utf8')
      writeFileSync(join(root, 'sush-license.json'), '{"tier":"pro"}', 'utf8')
      writeFileSync(join(root, 'unrelated.txt'), 'keep me', 'utf8')

      const result = resetSushUserData({ userData: root, keepLicense: true, confirmation: 'RESET SUSH' })

      expect(result).toMatchObject({ ok: true, identitiesRemoved: 1, keptLicense: true })
      expect(existsSync(join(root, 'identities'))).toBe(false)
      expect(existsSync(join(root, 'sush-users.json'))).toBe(false)
      expect(existsSync(join(root, 'sush-scrollback.json'))).toBe(false)
      expect(readFileSync(join(root, 'sush-license.json'), 'utf8')).toContain('pro')
      expect(readFileSync(join(root, 'unrelated.txt'), 'utf8')).toBe('keep me')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('requires the exact confirmation phrase', () => {
    const root = mkdtempSync(join(tmpdir(), 'sush-reset-confirm-'))
    try {
      writeFileSync(join(root, 'sush-users.json'), '{}', 'utf8')
      expect(resetSushUserData({ userData: root, confirmation: 'reset sush' })).toEqual({
        ok: false,
        error: 'Type RESET SUSH to confirm.'
      })
      expect(existsSync(join(root, 'sush-users.json'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
