import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const state = vi.hoisted(() => ({ userData: '', failWrites: false }))

vi.mock('electron', () => ({
  app: { getPath: () => state.userData }
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

import { createUser, deleteUser, initUsers, listUsers, userHomeDir } from '../src/main/users.js'

describe('identity filesystem transactions', () => {
  beforeAll(() => {
    state.userData = mkdtempSync(join(tmpdir(), 'sush-users-'))
    initUsers()
  })

  afterAll(() => {
    rmSync(state.userData, { recursive: true, force: true })
  })

  it('cleans failed creates and restores wiped data when the registry cannot persist', () => {
    state.failWrites = true
    expect(createUser({ name: 'Failed create' })).toMatchObject({ ok: false })
    const identities = join(state.userData, 'identities')
    expect(existsSync(identities) ? readdirSync(identities) : []).toEqual([])

    state.failWrites = false
    const created = createUser({ name: 'Kept user' })
    expect(created.ok).toBe(true)
    const home = userHomeDir(created.user.id)
    const marker = join(home, 'do-not-lose.txt')
    writeFileSync(marker, 'important', 'utf8')

    state.failWrites = true
    expect(deleteUser({ id: created.user.id, wipeData: true })).toMatchObject({ ok: false })
    expect(listUsers()).toHaveLength(1)
    expect(existsSync(marker)).toBe(true)
  })
})
