import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const state = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.dir } }))
import { initUsers, createUser, activateUser, activeUserEnv } from '../src/main/users.js'
import { addAccount, slotEnv } from '../src/main/accounts.js'
import { financeSummary, setFinanceSettings } from '../src/main/finance.js'

beforeEach(() => { state.dir = mkdtempSync(join(tmpdir(), 'sush-fin-')); initUsers() })
afterEach(() => rmSync(state.dir, { recursive: true, force: true }))

const line = (id, output) => JSON.stringify({ timestamp: new Date().toISOString(), cwd: '/w/app', message: { id, model: 'claude-sonnet-5-5', usage: { output_tokens: output } } })
function transcript(configDir, name, lines) {
  const dir = join(configDir, 'projects', '-w-app')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), lines.join('\n'))
}

it('attributes transcripts to the slot whose config dir holds them, per identity', async () => {
  const { user: a } = createUser({ name: 'Ann' })
  const { user: b } = createUser({ name: 'Ben' })
  activateUser({ id: a.id })
  const base = activeUserEnv({ includeAccounts: false })
  transcript(base.CLAUDE_CONFIG_DIR, 's1.jsonl', [line('m1', 1e6), line('m1', 1e6)])
  const { providers } = addAccount(a.id, 'claude', 'Work')
  const work = providers.claude.slots.find(s => s.label === 'Work')
  transcript(slotEnv(a.id, 'claude', work.id).CLAUDE_CONFIG_DIR, 's2.jsonl', [line('m2', 2e6)])
  setFinanceSettings(a.id, { plan: { key: `claude:${work.id}`, usd: 20 } })

  const s = await financeSummary(a.id, base)
  const byLabel = Object.fromEntries(s.accounts.map(r => [r.label, r]))
  expect(byLabel['Claude · Default'].usd).toBe(10)   // m1 counted once at $10/MTok output
  expect(byLabel['Claude · Work'].usd).toBe(20)
  expect(s.planUsd).toBe(20)

  activateUser({ id: b.id })
  const other = await financeSummary(b.id, activeUserEnv({ includeAccounts: false }))
  expect(other.usd).toBe(0)
  expect(other.planUsd).toBe(0)
})

it('rejects malformed settings patches', () => {
  const { user } = createUser({ name: 'Cy' })
  expect(setFinanceSettings(user.id, { price: { model: 'x-model', input: 1 } }).ok).toBe(false)
  const r = setFinanceSettings(user.id, { budgetUsd: '-5', plan: { key: '../etc', usd: 9 } })
  expect(r.settings.budgetUsd).toBe(null)
  expect(r.settings.plans).toEqual({})
})
