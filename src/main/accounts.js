import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { randomBytes } from 'crypto'
import { accountSlotDirectoryPath, atomicWriteJson, identityDirectoryPath, identityStoragePath } from './secure-storage'

// Per-identity CLI account slots: one Sush identity can hold several agent CLI
// logins and hop between them when a session limit bites, without
// switching Sush profiles. Each slot owns a provider-specific config/home
// overlay. The default slot is the identity's original config dir inside
// its home - an identity with no accounts.json behaves exactly like before
// this feature existed.

export const SLOT_PROVIDERS = {
  claude: { env: 'CLAUDE_CONFIG_DIR', label: 'Claude Code' },
  codex: { env: 'CODEX_HOME', label: 'Codex' },
  gemini: {
    label: 'Gemini',
    env: {
      HOME: '.',
      USERPROFILE: '.',
      APPDATA: 'AppData/Roaming',
      LOCALAPPDATA: 'AppData/Local'
    }
  },
  opencode: {
    label: 'OpenCode',
    env: {
      XDG_CONFIG_HOME: '.config',
      XDG_DATA_HOME: '.local/share',
      XDG_STATE_HOME: '.local/state',
      XDG_CACHE_HOME: '.cache'
    }
  }
}

// Must stay at least as high as the largest advertised tier allowance.
const MAX_SLOTS = 16

function identityDir(userId) {
  return identityDirectoryPath(app.getPath('userData'), userId)
}

function accountsFile(userId) {
  return identityStoragePath(app.getPath('userData'), userId, 'accounts.json')
}

function slotDir(userId, provider, slotId) {
  return accountSlotDirectoryPath(app.getPath('userData'), userId, provider, slotId)
}

function envForSlot(userId, provider, slotId) {
  const spec = SLOT_PROVIDERS[provider]
  if (!userId || !spec || !slotId || slotId === 'default') return {}
  const root = slotDir(userId, provider, slotId)
  if (!root) return {}
  if (typeof spec.env === 'string') return { [spec.env]: root }
  const env = {}
  for (const [key, subPath] of Object.entries(spec.env || {})) {
    env[key] = subPath === '.' ? root : join(root, subPath)
  }
  return env
}

function ensureSlotDirs(userId, provider, slotId) {
  const root = slotDir(userId, provider, slotId)
  if (!root) throw new Error('Invalid account slot path')
  mkdirSync(root, { recursive: true })
  for (const dir of Object.values(envForSlot(userId, provider, slotId))) {
    mkdirSync(dir, { recursive: true })
  }
}

function load(userId) {
  try {
    const file = accountsFile(userId)
    if (file && existsSync(file)) {
      const data = JSON.parse(readFileSync(file, 'utf8'))
      if (data && typeof data === 'object' && data.providers) return data
    }
  } catch {}
  return { version: 1, providers: {} }
}

function save(userId, data) {
  try {
    const dir = identityDir(userId)
    const file = accountsFile(userId)
    if (!dir || !file) return false
    mkdirSync(dir, { recursive: true })
    atomicWriteJson(file, data)
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

// Best remaining % from a usage snapshot (session or week). Higher = healthier.
// Returns null when we have no numeric signal (health-only CLIs).
function remainingPct(slot) {
  const u = slot?.usage
  if (!u) return null
  const session = typeof u.sessionPct === 'number' ? u.sessionPct : null
  const week = typeof u.weekPct === 'number' ? u.weekPct : null
  if (session == null && week == null) return null
  // Remaining = 100 - used. Prefer the tighter (higher-used) window.
  const used = Math.max(session ?? 0, week ?? 0)
  return Math.max(0, 100 - used)
}

// Ranking for auto-rotation:
// 1. Highest remaining % when we have usage cache
// 2. Then oldest lastLimitAt (most rested)
// 3. Stable id tie-break
function rankSlots(slots) {
  return [...slots].sort((a, b) => {
    const ra = remainingPct(a)
    const rb = remainingPct(b)
    if (ra != null && rb != null && ra !== rb) return rb - ra
    if (ra != null && rb == null) return -1
    if (ra == null && rb != null) return 1
    const la = a.lastLimitAt || 0
    const lb = b.lastLimitAt || 0
    if (la !== lb) return la - lb
    return String(a.id).localeCompare(String(b.id))
  })
}

export function listAccounts(userId) {
  if (!userId) return { ok: false, error: 'no-user' }
  const data = load(userId)
  const providers = {}
  for (const p of Object.keys(SLOT_PROVIDERS)) {
    const st = providerState(data, p)
    providers[p] = {
      active: st.active,
      limitPolicy: LIMIT_POLICIES.includes(st.limitPolicy) ? st.limitPolicy : 'ask',
      slots: st.slots.map(s => ({
        id: s.id,
        label: s.label,
        lastLimitAt: s.lastLimitAt || null,
        usage: s.usage || null,
        usageHistory: Array.isArray(s.usageHistory) ? s.usageHistory.slice(-24) : []
      }))
    }
  }
  return { ok: true, providers }
}

// Aggregate pool view for one provider — powers the Usage popover / Settings panel.
// poolTotalPct is the sum of each slot's remaining % (4 accounts at 100% → 400%).
export function getPoolStats(userId, provider) {
  if (!userId || !SLOT_PROVIDERS[provider]) {
    return { ok: false, error: 'no-user-or-provider' }
  }
  const data = load(userId)
  const st = providerState(data, provider)
  const slots = st.slots || []
  let totalRemaining = 0
  let known = 0
  let healthy = 0
  const details = []

  for (const s of slots) {
    const rem = remainingPct(s)
    const limitedAgo = s.lastLimitAt ? Date.now() - s.lastLimitAt : null
    // Consider a slot "healthy" if it has remaining > 5% or no recent limit hit.
    const isHealthy = (rem != null ? rem > 5 : true) && (!s.lastLimitAt || limitedAgo > 5 * 60 * 1000)
    if (rem != null) {
      totalRemaining += rem
      known += 1
    }
    if (isHealthy) healthy += 1
    details.push({
      id: s.id,
      label: s.label,
      remainingPct: rem,
      lastLimitAt: s.lastLimitAt || null,
      active: s.id === st.active,
      healthy: isHealthy
    })
  }

  const avgRemaining = known > 0 ? Math.round(totalRemaining / known) : null
  // Sum of remaining % across slots that reported (e.g. 4 × 100 → 400).
  const poolTotalPct = known > 0 ? Math.round(totalRemaining) : null
  // Avg remaining scaled to a 0–100 bar (legacy / optional).
  const poolPct = known > 0 ? Math.min(100, Math.round(totalRemaining / slots.length)) : null

  return {
    ok: true,
    provider,
    label: SLOT_PROVIDERS[provider].label,
    slotCount: slots.length,
    healthyCount: healthy,
    knownCount: known,
    activeId: st.active,
    avgRemaining,
    poolPct,
    poolTotalPct,
    limitPolicy: LIMIT_POLICIES.includes(st.limitPolicy) ? st.limitPolicy : 'ask',
    slots: details
  }
}

// What happens when THIS CLI hits its session limit, set per-CLI (it used to be
// one global toggle, but auto-hopping makes sense on a CLI with several logins
// and none on a single-login one). Lives with the account data, so the limit
// cascade in main reads it straight from here — no renderer round-trip.
export const LIMIT_POLICIES = ['never', 'ask', 'auto']

export function getLimitPolicy(userId, provider) {
  if (!userId || !SLOT_PROVIDERS[provider]) return 'ask'
  const st = load(userId).providers?.[provider]
  return LIMIT_POLICIES.includes(st?.limitPolicy) ? st.limitPolicy : 'ask'
}

export function setLimitPolicy(userId, provider, policy) {
  if (!userId) return { ok: false, error: 'no-user' }
  if (!SLOT_PROVIDERS[provider]) return { ok: false, error: 'Unknown provider' }
  if (!LIMIT_POLICIES.includes(policy)) return { ok: false, error: 'Unknown policy' }
  const data = load(userId)
  providerState(data, provider).limitPolicy = policy
  if (!save(userId, data)) return { ok: false, error: 'Could not write accounts file' }
  return { ok: true, ...listAccounts(userId) }
}

export function renameAccount(userId, provider, label) {
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

// Cache a usage snapshot on a slot (session/week percentages + reset times),
// scraped on demand from the CLI's own usage view. Stored so the UI can paint
// the bars instantly from cache and show "updated Xm ago" without re-spawning.
export function setAccountUsage(userId, provider, slotId, usage) {
  if (!userId || !SLOT_PROVIDERS[provider]) return { ok: false, error: 'Unknown provider' }
  const data = load(userId)
  const st = providerState(data, provider)
  const slot = st.slots.find(s => s.id === slotId)
  if (!slot) return { ok: false, error: 'No such account' }
  const snapshot = usage ? { ...usage, at: Date.now() } : null
  slot.usage = snapshot
  if (snapshot) {
    const point = {
      at: snapshot.at,
      status: snapshot.status || null,
      signedIn: snapshot.signedIn,
      sessionPct: typeof snapshot.sessionPct === 'number' ? snapshot.sessionPct : null,
      weekPct: typeof snapshot.weekPct === 'number' ? snapshot.weekPct : null
    }
    slot.usageHistory = [...(Array.isArray(slot.usageHistory) ? slot.usageHistory : []), point].slice(-24)
  }
  if (!save(userId, data)) return { ok: false, error: 'Could not write accounts file' }
  return { ok: true, ...listAccounts(userId) }
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
    ensureSlotDirs(userId, provider, id)
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

// Rotate to another slot (used by the limit cascade).
// Prefers highest remaining % when usage cache exists, then oldest lastLimitAt.
// Returns the slot we landed on, or ok:false when there is nowhere to rotate.
export function nextAccount(userId, provider) {
  if (!userId) return { ok: false, error: 'no-user' }
  const data = load(userId)
  const st = providerState(data, provider)
  if (st.slots.length < 2) return { ok: false, error: 'no-alternate' }
  const others = st.slots.filter(s => s.id !== st.active)
  const ranked = rankSlots(others)
  const next = ranked[0]
  if (!next) return { ok: false, error: 'no-alternate' }
  st.active = next.id
  if (!save(userId, data)) return { ok: false, error: 'Could not write accounts file' }
  return { ok: true, slotId: next.id, label: next.label }
}

// What a limit-hit COULD rotate to, without changing anything.
// Must use the same ranking as nextAccount so 'ask' and 'auto' agree.
export function peekNextAccount(userId, provider) {
  if (!userId || !SLOT_PROVIDERS[provider]) return null
  const data = load(userId)
  const st = data.providers?.[provider]
  if (!st || !Array.isArray(st.slots) || st.slots.length < 2) return null
  const others = st.slots.filter(s => s.id !== st.active)
  const ranked = rankSlots(others)
  const next = ranked[0]
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
  const dir = slotDir(userId, provider, slotId)
  if (dir) {
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  }
  return { ok: true, ...listAccounts(userId) }
}

// Env overlay that points one provider at a specific slot. Claude/Codex use
// provider-specific config vars; Gemini/OpenCode need slot-local HOME/XDG
// overlays because their CLIs do not expose a narrower account-dir variable.
// The default slot returns {} because identity env already points there.
export function slotEnv(userId, provider, slotId) {
  return envForSlot(userId, provider, slotId)
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
    Object.assign(env, envForSlot(userId, p, st.active))
  }
  return env
}
