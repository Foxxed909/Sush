import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  identityDirectoryPath,
  identityStoragePath,
  migrateLegacyOnce,
  migrationMarkerPath,
  protectConfigKey,
  resolveIdentityStorage,
  safeStorageState,
  transformLegacySecretStore,
  validIdentityId
} from '../src/main/secure-storage.js'

describe('identity storage containment', () => {
  it('accepts current IDs and rejects traversal or absolute path segments', () => {
    const root = join(tmpdir(), 'sush-user-data')
    expect(validIdentityId('a1b2c3d4')).toBe('a1b2c3d4')
    expect(validIdentityId('A1B2C3D4')).toBeNull()
    expect(validIdentityId('safe-name')).toBeNull()
    expect(validIdentityId('../other')).toBeNull()
    expect(validIdentityId('/tmp/other')).toBeNull()
    expect(validIdentityId('a\\..\\other')).toBeNull()
    expect(identityDirectoryPath(root, '../other')).toBeNull()
    expect(identityStoragePath(root, 'a1b2c3d4', '../auth.json')).toBeNull()
    expect(identityStoragePath(root, 'a1b2c3d4', 'auth.json')).toBe(join(root, 'identities', 'a1b2c3d4', 'auth.json'))
  })

  it('treats signed-out installs with identities as locked', () => {
    const args = { userData: '/safe', fileName: 'auth.json', legacyPath: '/safe/legacy.json' }
    expect(resolveIdentityStorage({ ...args, activeUser: null, users: [{ id: 'a1b2c3d4' }] })).toEqual({ ok: false, error: 'no-user' })
    expect(resolveIdentityStorage({ ...args, activeUser: null, users: [] })).toMatchObject({
      ok: true,
      kind: 'legacy',
      target: '/safe/legacy.json'
    })
    expect(resolveIdentityStorage({
      ...args,
      activeUser: null,
      users: [],
      legacyOwnerId: 'a1b2c3d4',
      legacyOwnershipEstablished: true
    })).toEqual({ ok: false, error: 'no-user' })
    expect(resolveIdentityStorage({ ...args, activeUser: { id: '../../escape' }, users: [] })).toEqual({
      ok: false,
      error: 'invalid-identity'
    })
  })

  it('does not infer legacy ownership from whoever is currently the sole identity', () => {
    const scope = resolveIdentityStorage({
      userData: '/safe',
      activeUser: { id: 'b1c2d3e4' },
      users: [{ id: 'b1c2d3e4' }],
      legacyOwnerId: 'a1b2c3d4',
      fileName: 'auth.json',
      legacyPath: '/safe/legacy.json'
    })
    expect(scope).toMatchObject({ ok: true, identityId: 'b1c2d3e4', ownsLegacy: false })
  })
})

describe('one-shot legacy migration', () => {
  it('leaves the legacy file intact on partial failure and never lets another identity claim it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sush-migration-'))
    const legacy = join(dir, 'legacy.json')
    const marker = migrationMarkerPath(dir, 'secrets-v2')
    const target = join(dir, 'identities', 'a1b2c3d4', 'secrets.json')
    writeFileSync(legacy, 'legacy-original', 'utf8')
    try {
      const failed = migrateLegacyOnce({
        marker,
        identityId: 'a1b2c3d4',
        target,
        transform: () => { throw new Error('second value failed') }
      })
      expect(failed).toMatchObject({ ok: false, error: 'migration-failed' })
      expect(existsSync(target)).toBe(false)
      expect(readFileSync(legacy, 'utf8')).toBe('legacy-original')

      const stolen = migrateLegacyOnce({
        marker,
        identityId: 'b1c2d3e4',
        target: join(dir, 'identities', 'b1c2d3e4', 'secrets.json'),
        transform: () => ({ shouldNot: 'run' })
      })
      expect(stolen).toEqual({ ok: false, error: 'legacy-claimed' })

      const resumed = migrateLegacyOnce({
        marker,
        identityId: 'a1b2c3d4',
        target,
        transform: () => ({ version: 2, secrets: { token: 'encrypted' } })
      })
      expect(resumed.ok).toBe(true)
      expect(JSON.parse(readFileSync(target, 'utf8'))).toMatchObject({ version: 2 })
      if (process.platform !== 'win32') expect(statSync(target).mode & 0o777).toBe(0o600)
      expect(JSON.parse(readFileSync(marker, 'utf8'))).toMatchObject({ claimedBy: 'a1b2c3d4', state: 'complete' })
      expect(readFileSync(legacy, 'utf8')).toBe('legacy-original')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fully decrypts a v1 vault before encrypting any value', () => {
    let encryptions = 0
    expect(() => transformLegacySecretStore(
      { first: 'good', second: 'bad' },
      {
        decryptLegacy(value) {
          if (value === 'bad') throw new Error('bad ciphertext')
          return 'clear'
        },
        encrypt(value) {
          encryptions++
          return `wrapped:${value}`
        }
      }
    )).toThrow('bad ciphertext')
    expect(encryptions).toBe(0)
  })
})

describe('OS storage classification', () => {
  it('does not treat Electron basic_text as genuine Linux encryption', () => {
    const storage = {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'basic_text'
    }
    expect(safeStorageState(storage, { platform: 'linux' })).toEqual({
      available: true,
      secure: false,
      backend: 'basic_text'
    })
  })

  it('fails closed when the Linux backend cannot be identified', () => {
    expect(safeStorageState(
      { isEncryptionAvailable: () => true },
      { platform: 'linux' }
    )).toMatchObject({ available: true, secure: false, backend: null })
    expect(safeStorageState(
      {
        isEncryptionAvailable: () => true,
        getSelectedStorageBackend: () => { throw new Error('not ready') }
      },
      { platform: 'linux' }
    )).toMatchObject({ available: true, secure: false, backend: null })
    expect(safeStorageState(
      {
        isEncryptionAvailable: () => true,
        getSelectedStorageBackend: () => 'gnome_libsecret'
      },
      { platform: 'linux' }
    )).toMatchObject({ available: true, secure: true, backend: 'gnome_libsecret' })
  })

  it('rewraps plaintext config keys once secure storage is genuinely available', () => {
    const storage = {
      encryptString: value => Buffer.from(`enc:${value}`),
      decryptString: value => value.toString('utf8')
    }
    const protectedKey = protectConfigKey(
      { provider: 'openai', key: 'sk-test', keyEnc: false },
      storage,
      { available: true, secure: true, backend: 'keychain' }
    )
    expect(protectedKey).toMatchObject({ ok: true, changed: true })
    expect(protectedKey.config.keyEnc).toBe(true)
    expect(Buffer.from(protectedKey.config.key, 'base64').toString('utf8')).toBe('enc:sk-test')
  })
})
