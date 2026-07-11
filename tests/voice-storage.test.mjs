import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const state = vi.hoisted(() => ({
  activeUser: null,
  users: [],
  legacyOwnerId: null,
  userData: '',
  failWrites: false
}))

vi.mock('electron', () => ({
  app: { getPath: () => state.userData },
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: value => Buffer.from(`encrypted:${value}`),
    decryptString: value => value.toString('utf8').replace(/^encrypted:/, '')
  }
}))

vi.mock('../src/main/users.js', () => ({
  getActiveUser: () => state.activeUser,
  getLegacyOwnerId: () => state.legacyOwnerId,
  isLegacyOwnershipEstablished: () => state.legacyOwnerId !== null,
  listUsers: () => state.users
}))

vi.mock('../src/main/secure-storage.js', async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    atomicWriteJson(...args) {
      if (state.failWrites) throw new Error('disk full')
      return actual.atomicWriteJson(...args)
    }
  }
})

import { getSttConfigPublic, setSttConfig } from '../src/main/stt.js'
import { getTtsConfigPublic, setTtsConfig } from '../src/main/tts.js'

describe('voice config storage boundaries', () => {
  beforeAll(() => {
    state.userData = mkdtempSync(join(tmpdir(), 'sush-voice-config-'))
  })

  afterAll(() => {
    rmSync(state.userData, { recursive: true, force: true })
  })

  it('returns no-user while identities exist but none is active', () => {
    state.activeUser = null
    state.users = [{ id: 'a1b2c3d4' }]
    expect(getSttConfigPublic()).toMatchObject({ ok: false, error: 'no-user', hasKey: false })
    expect(getTtsConfigPublic()).toMatchObject({ ok: false, error: 'no-user', hasKey: false })
    expect(setSttConfig({ model: 'whisper-1' })).toEqual({ ok: false, error: 'no-user' })
    expect(setTtsConfig({ model: 'gpt-4o-mini-tts' })).toEqual({ ok: false, error: 'no-user' })
  })

  it('never reports success when an atomic config write fails', () => {
    state.activeUser = { id: 'a1b2c3d4' }
    state.users = [state.activeUser]
    state.legacyOwnerId = state.activeUser.id
    state.failWrites = true
    expect(setSttConfig({ model: 'gpt-4o-transcribe' })).toEqual({ ok: false, error: 'persist-failed' })
    expect(setTtsConfig({ model: 'gpt-4o-mini-tts' })).toEqual({ ok: false, error: 'persist-failed' })
    state.failWrites = false
    expect(getSttConfigPublic().model).toBe('')
    expect(getTtsConfigPublic().model).toBe('')
  })
})
