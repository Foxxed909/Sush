import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { randomBytes } from 'crypto'

// Per-identity CLI account slots: one Sush identity can hold several Claude /
// Codex logins and hop between them when a session limit bites, without
// switching Sush profiles. Each slot owns a config dir that the provider's
// redirect env var points at. The 'default' slot is the identity's original
// config dir inside its home — an identity with no accounts.json behaves
// exactly like before this feature existed.
//
// Gemini is absent on purpose: its CLI has no config-dir env redirect, so it
// stays one-account-per-identity (full isolation redirects HOME instead).

export const SLOT_PROVIDERS = {
  claude: { env: 'CLAUDE_CONFIG_DIR', label: 'Claude Code' },
  codex: { env: 'CODEX_HOME', label: 'Codex' }
}

const MAX_SLOTS = 6

function identityDir(userId) {
  return join(app.getPath('userData'), 'identities', String(userId))
}

function accountsFile(userId) {
  return join(identityDir(userId), 'accounts.json')
}

function slotDir(userId, provider, slotId) {
  return join(identityDir(userId), 'accounts', provider, slotId)
}

function load(userId) {
  try {
    if (existsSync(accountsFile(userId))) {
      const data = JSON.parse(readFileSync(accountsFile(userId), 'utf8'))
      if (data && typeof data === 'object' && data.providers) return data
    }
  } catch {}
  return { version: 1, providers: {} }
}

function save(userId, data) {
  try {
    mkdirSync(identityDir(userId), { recursive: true })
    writeFileSync(accountsFile(userId), JSON.stringify(data, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}

function providerState(data, provider) {
  if (!data.providers[provider]) {
    data.providers[provider] = {
      active: 'default',
      slots: [{ id: 'default', label: 'Default', createdAt: Date.now() }]
    }
  }
  return data.providers[provider]
}

export function listAccounts(userId) {
  if (!userId) return { ok: false, error: 'no-user' }
  const data = load(userId)
  const providers = {}
  for (const p of Object.keys(SLOT_PROVIDERS)) {
    const st = providerState(data, p)
    providers[p] = { active: st.active, slots: st.slots.map(s => ({ id: s.id, label: s.label, lastLimitAt: s.lastLimitAt || null })) }
  }
  return { ok: true, providers }
}

export function renameAccount(userId, provider, slotId, label) {
  if (!userId) return { ok: false, error: 'no-user' }
  if (!SLOT_PROVIDERS[provider]) return { ok: false, error: 'Unknown provider' }
  const name = String(label ?? '').trim().slice(0, 24)
  if (!name) return { ok: false, error: 'Name cannot be empty' }
  const data = load(userId)
  const st = providerState(data, provider)
  const slot = st.slots.find(s => s.id === slotId)
  if (!slot) return { ok: false, error: 'No such account' }
  slot.label = name
  if (!save(userId, data)) return { ok: false, error: 'Could not write accounts file' }
  return { ok: true, ...listAccounts(userId) }
}

// Remember that the active slot just hit its limit, so rotation can prefer
// the slot that has rested longest and the UI can show "limited Xh ago".
export function markLimitHit(userId, provider) {
  if (!userId || !SLOT_PROVIDERS[provider]) return
  const data = load(userId)
  const st = providerState(data, provider)
  const slot = st.slots.find(s => s.id === st.active)
  if (!slot) return
  slot.lastLimitAt = Date.now()
  save(userId, data)
}

// Creates the slot and makes it active, so the very next session spawned uses
// it — that session is where the user logs the new account in.
export function addAccount(userId, provider, label) {
  if (!userId) return { ok: false, error: 'no-user' }
  if (!SLOT_PROVIDERS[provider]) return { ok: false, error: 'This CLI does not support extra accounts' }
  const data = load(userId)
  const st = providerState(data, provider)
  if (st.slots.length >= MAX_SLOTS) return { ok: false, error: `Slot limit reached (${MAX_SLOTS})` }
  const id = 'acct-' + randomBytes(4).toString('hex')
  const name = String(label ?? '').trim().slice(0, 24) || `Account ${st.slots.length + 1}`
  try {
    mkdirSync(slotDir(userId, provider, id), { recursive: true })
  } catch (e) {
    return { ok: false, error: e.message }
  }
  st.slots.push({ id, label: name, createdAt: Date.now() })
  st.active = id
  if (!save(userId, data)) return { ok: false, error: 'Could not write accounts file' }
  return { ok: true, slotId: id, ...listAccounts(userId) }
}

export function switchAccount(userId, provider, slotId) {
  if (!userId) return { ok: false, error: 'no-user' }
  if (!SLOT_PROVIDERS[provider]) return { ok: false, error: 'Unknown provider' }
  const data = load(userId)
  const st = providerState(data, provider)
  const slot = st.slots.find(s => s.id === slotId)
  if (!slot) return { ok: false, error: 'No such account' }
  st.active = slot.id
  if (!save(userId, data)) return { ok: false, error: 'Could not write accounts file' }
  return { ok: true, slotId: slot.id, label: slot.label, ...listAccounts(userId) }
}

// Rotate to another slot (used by the limit cascade): prefer the slot whose
// last limit hit is the OLDEST — it has had the most time to reset — instead
// of blind round-robin (which could hop straight onto another limited login).
// Returns the slot we landed on, or ok:false when there is nowhere to rotate.
export function nextAccount(userId, provider) {
  if (!userId) return { ok: false, error: 'no-user' }
  const data = load(userId)
  const st = providerState(data, provider)
  if (st.slots.length < 2) return { ok: false, error: 'no-alternate' }
  const others = st.slots.filter(s => s.id !== st.active)
  const next = others.sort((a, b) => (a.lastLimitAt || 0) - (b.lastLimitAt || 0))[0]
  st.active = next.id
  if (!save(userId, data)) return { ok: false, error: 'Could not write accounts file' }
  return { ok: true, slotId: next.id, label: next.label }
}

// What a limit-hit COULD rotate to, without changing anything.
export function peekNextAccount(userId, provider) {
  if (!userId || !SLOT_PROVIDERS[provider]) return null
  const data = load(userId)
  const st = data.providers?.[provider]
  if (!st || !Array.isArray(st.slots) || st.slots.length < 2) return null
  const idx = st.slots.findIndex(s => s.id === st.active)
  const next = st.slots[(idx + 1) % st.slots.length]
  return next ? { id: next.id, label: next.label } : null
}

export function removeAccount(userId, provider, slotId) {
  if (!userId) return { ok: false, error: 'no-user' }
  if (slotId === 'default') return { ok: false, error: 'The default account cannot be removed' }
  const data = load(userId)
  const st = providerState(data, provider)
  const idx = st.slots.findIndex(s => s.id === slotId)
  if (idx === -1) return { ok: false, error: 'No such account' }
  st.slots.splice(idx, 1)
  if (st.active === slotId) st.active = 'default'
  if (!save(userId, data)) return { ok: false, error: 'Could not write accounts file' }
  try { rmSync(slotDir(userId, provider, slotId), { recursive: true, force: true }) } catch {}
  return { ok: true, ...listAccounts(userId) }
}

// Env overlay for the active slots. Spread AFTER the identity env so a
// non-default slot wins; default slots add nothing (identity env already
// points at the original config dir).
export function accountSlotEnv(userId) {
  if (!userId) return {}
  const data = load(userId)
  const env = {}
  for (const [p, spec] of Object.entries(SLOT_PROVIDERS)) {
    const st = data.providers?.[p]
    if (!st || !st.active || st.active === 'default') continue
    if (!st.slots?.some(s => s.id === st.active)) continue
    env[spec.env] = slotDir(userId, p, st.active)
  }
  return env
}
