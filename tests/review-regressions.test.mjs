import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const state = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.dir } }))
import { initUsers, createUser, updateUser, listUsers, activateUser, activeUserEnv } from '../src/main/users.js'
import { addAccount, slotEnv, listAccounts } from '../src/main/accounts.js'
import { parseThreadEvents } from '../src/main/thread-bridge.js'
import { createPtyLaunchGate } from '../src/main/pty-launch-gate.js'

beforeEach(() => { state.dir = mkdtempSync(join(tmpdir(), 'sush-review-')); initUsers() })
afterEach(() => rmSync(state.dir, { recursive: true, force: true }))

it('rejects invalid PIN edits without changing memory or subsequently persisted data', () => {
  const { user } = createUser({ name: 'Original', pin: '1234' })
  expect(updateUser({ id: user.id, patch: { name: 'Leaked', isolation: 'full' }, newPin: 'bad' }).ok).toBe(false)
  expect(listUsers()[0]).toMatchObject({ name: 'Original', isolation: 'cli' })
  createUser({ name: 'Second' })
  initUsers()
  expect(listUsers()[0].name).toBe('Original')
})
it('checks uniqueness after the same name truncation used for storage', () => {
  const name = 'a'.repeat(32)
  expect(createUser({ name }).ok).toBe(true)
  expect(createUser({ name: name + 'extra' }).ok).toBe(false)
})
it('can probe default credentials while an alternate account remains selected', () => {
  const { user } = createUser({ name: 'Account owner', isolation: 'full' })
  activateUser({ id: user.id })
  const original = activeUserEnv()
  addAccount(user.id, 'claude', 'Other Claude')
  addAccount(user.id, 'gemini', 'Other Gemini')
  expect(activeUserEnv().CLAUDE_CONFIG_DIR).not.toBe(original.CLAUDE_CONFIG_DIR)
  expect(activeUserEnv().HOME).not.toBe(original.HOME)
  const probe = { ...activeUserEnv({ includeAccounts: false }), ...slotEnv(user.id, 'claude', 'default') }
  expect(probe.CLAUDE_CONFIG_DIR).toBe(original.CLAUDE_CONFIG_DIR)
  expect(probe.HOME).toBe(original.HOME)
})
it('ignores valid JSON primitives in hook event logs', () => {
  const result = parseThreadEvents('null\n42\n[]\n"text"\n{"hook_event_name":"Stop"}')
  expect(result).toMatchObject({ state: 'idle', eventCount: 1 })
})
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function fixture(limit = 2) {
  const wait = deferred()
  const sessions = new Map()
  let owner = 'user-a'
  const start = vi.fn(async ({ tabId }, assertCurrent) => {
    await wait.promise
    assertCurrent()
    sessions.set(tabId, { pid: 1 })
    return { pid: 1 }
  })
  const gate = createPtyLaunchGate({ sessions, limit, identity: () => owner, start })
  return { gate, wait, sessions, start, switchOwner: () => { owner = 'user-b' } }
}
it('deduplicates concurrent starts for the same tab', async () => {
  const f = fixture(); const a = f.gate.launch({ tabId: 'one' }); const b = f.gate.launch({ tabId: 'one' })
  expect(a).toBe(b); f.wait.resolve(); await a; expect(f.start).toHaveBeenCalledTimes(1)
})
it('counts pending launches against the process cap', async () => {
  const f = fixture(1); const a = f.gate.launch({ tabId: 'one' })
  await expect(f.gate.launch({ tabId: 'two' })).rejects.toThrow('Too many terminals')
  f.wait.resolve(); await a
})
it.each(['close', 'signout', 'switch'])('cancels startup after %s while discovery is pending', async mode => {
  const f = fixture(); const a = f.gate.launch({ tabId: 'one' }); await Promise.resolve()
  if (mode === 'close') f.gate.cancel('one')
  if (mode === 'signout') f.gate.cancelAll()
  if (mode === 'switch') f.switchOwner()
  f.wait.resolve(); await expect(a).rejects.toThrow('cancelled'); expect(f.sessions.size).toBe(0)
})
it('an old cancellation cannot erase a replacement launch reservation', async () => {
  const f = fixture(1); const old = f.gate.launch({ tabId: 'one' }); await Promise.resolve()
  f.gate.cancel('one'); const replacement = f.gate.launch({ tabId: 'one' }); f.wait.resolve()
  await expect(old).rejects.toThrow('cancelled'); await expect(replacement).resolves.toEqual({ pid: 1 })
})

it('supports all 50 advertised Enterprise slots and keeps a hard ceiling', () => {
  const { user } = createUser({ name: 'Enterprise owner' })
  for (let i = 1; i < 50; i++) expect(addAccount(user.id, 'claude', `Slot ${i}`).ok).toBe(true)
  expect(listAccounts(user.id).providers.claude.slots).toHaveLength(50)
  expect(addAccount(user.id, 'claude', 'Overflow')).toMatchObject({ ok: false, error: 'Slot limit reached (50)' })
})
