// Command-frequency miner.
// Tallies the full command lines you run through the omnibar. When one crosses
// a threshold (default 15) the app offers to turn it into a .sushrc alias — so
// your personal shorthand library grows out of your own habits, not config.
//
// Storage lives in localStorage (renderer-only): the table churns on every
// command, and routing that through IPC + electron-store would be wasteful.

import { isSensitiveCommand } from './commandPrivacy'

const STORE_KEY = 'sush.cmdfreq.v1'
const DISMISS_KEY = 'sush.cmdfreq.dismissed.v1'

const THRESHOLD = 15
const MAX_TRACKED = 200            // cap the table so it can never grow unbounded
const DECAY_MS = 45 * 86400_000    // commands unseen for ~45 days fade out

function normalize(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ')
}

// Commands worth aliasing: long enough to save keystrokes, not a bare one-off.
// `ls`, `cd` are already short; volatile one-token noise isn't worth a slot.
function isAliasable(cmd) {
  if (!cmd) return false
  if (cmd.length < 4) return false
  const tokens = cmd.split(' ')
  if (tokens.length < 2 && cmd.length < 8) return false
  return true
}

function load(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    let changed = false
    for (const command of Object.keys(value)) {
      if (!isSensitiveCommand(command)) continue
      delete value[command]
      changed = true
    }
    // Scrub values written by older Sush versions as soon as either table is
    // read. Sensitive commands should not survive as dismissed entries either.
    if (changed) save(key, value)
    return value
  } catch { return null }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* quota — ignore */ }
}

function prune(table, now) {
  const cutoff = now - DECAY_MS
  for (const k of Object.keys(table)) {
    if ((table[k]?.last ?? 0) < cutoff) delete table[k]
  }
  const keys = Object.keys(table)
  if (keys.length > MAX_TRACKED) {
    keys.sort((a, b) => table[a].count - table[b].count)
    for (const k of keys.slice(0, keys.length - MAX_TRACKED)) delete table[k]
  }
}

// Record one command line. No-op for things not worth aliasing.
export function recordCommand(raw, now = Date.now()) {
  const cmd = normalize(raw)
  // Never persist secret values in the alias-frequency table. `secrets set`
  // intentionally accepts the value as an argument, so recording the full
  // command would turn an encrypted secret into plaintext localStorage.
  if (isSensitiveCommand(cmd)) return
  if (!isAliasable(cmd)) return
  const table = load(STORE_KEY) || {}
  const entry = table[cmd] || { count: 0, last: now }
  entry.count += 1
  entry.last = now
  table[cmd] = entry
  prune(table, now)
  save(STORE_KEY, table)
}

// Mark a command as "never suggest" — survives restarts.
export function dismissCommand(raw) {
  const cmd = normalize(raw)
  if (!cmd || isSensitiveCommand(cmd)) return
  const d = load(DISMISS_KEY) || {}
  d[cmd] = true
  save(DISMISS_KEY, d)
}

function isDismissed(cmd) {
  const d = load(DISMISS_KEY) || {}
  return !!d[cmd]
}

// Derive a short alias name from a command. `git status` → `gs`,
// `npm run dev` → `nrd`, `docker` → `doc`. Avoids names already taken.
export function suggestAliasName(cmd, taken = new Set()) {
  const tokens = normalize(cmd).split(' ').filter(Boolean)
  let base
  if (tokens.length === 1) {
    base = tokens[0].replace(/[^a-z0-9]/gi, '').slice(0, 3).toLowerCase()
  } else {
    base = tokens
      .filter(t => !t.startsWith('-'))   // skip flags when building initials
      .slice(0, 4)
      .map(t => (t.replace(/[^a-z0-9]/gi, '')[0] || ''))
      .join('')
      .toLowerCase()
  }
  if (!base) base = 'a'
  let name = base
  let n = 2
  while (taken.has(name)) { name = `${base}${n}`; n++ }
  return name
}

// The single best alias candidate: most-run command that has crossed the
// threshold and isn't already aliased or dismissed. null when nothing qualifies.
export function pickCandidate(existingAliasValues = new Set()) {
  const table = load(STORE_KEY) || {}
  let best = null
  for (const [cmd, e] of Object.entries(table)) {
    if (!e || e.count < THRESHOLD) continue
    if (isDismissed(cmd)) continue
    if (existingAliasValues.has(cmd)) continue
    if (!best || e.count > best.count) best = { command: cmd, count: e.count }
  }
  return best
}
