import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { tierOf } from './license'

// ── Quiet Credits ────────────────────────────────────────────────────────────
// A local, offline usage meter for voice dictation ("Quiet" = the Hush/whisper
// family). Even though dictation runs on the user's OWN OpenAI key, Sush meters
// it per tier so the feature has a clear free allowance and a reason to upgrade
// — no billing backend, no server, just a monthly bucket of seconds stored next
// to the offline license. Mirrors the license module's "one source of truth"
// shape so the renderer can mirror it over IPC.
//
// The bucket is denominated in SECONDS of audio transcribed (Whisper bills by
// audio minute, so seconds is the honest unit). It rolls over on the calendar
// month. Tiers map to monthly allowances here:
const TIER_ALLOWANCE_SEC = {
  free: 5 * 60,     // 5 minutes / month — enough to feel it work
  plus: 60 * 60,    // 60 minutes / month
  pro: 300 * 60     // 300 minutes / month
}

// `credits` isn't in TIER_FEATURES (that table gates boolean/number features the
// license owns); the allowance lives here so dictation tuning never churns the
// license file. featuresOf() is still consulted for the active tier name.
export function allowanceFor(tier) {
  return TIER_ALLOWANCE_SEC[tier] ?? TIER_ALLOWANCE_SEC.free
}

const file = () => join(app.getPath('userData'), 'sush-credits.json')

// Calendar-month key, e.g. "2026-06". Used to detect rollover.
function periodKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// First instant of next month (local) — when the bucket refills.
function nextResetAt(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()
}

let cache = null
function load() {
  if (cache) return cache
  try {
    if (existsSync(file())) {
      const data = JSON.parse(readFileSync(file(), 'utf8'))
      if (data && typeof data === 'object') cache = data
    }
  } catch {}
  if (!cache) cache = { period: periodKey(), usedSec: 0 }
  return cache
}

function persist() {
  try { writeFileSync(file(), JSON.stringify(cache, null, 2), 'utf8'); return true } catch { return false }
}

// Roll the bucket over to the current month if the stored period is stale.
function rollover() {
  const c = load()
  const now = periodKey()
  if (c.period !== now) {
    c.period = now
    c.usedSec = 0
    persist()
  }
  return c
}

// Current tier comes straight from the license module so a redeemed code lifts
// the allowance immediately. Used seconds persist across a tier change (you
// don't get spent minutes back by upgrading), but the ceiling moves.
// (Was previously reverse-mapped from feature slots — broke if TIER_FEATURES
// numbers ever changed; tierOf() is the source of truth.)
function currentTier() {
  return tierOf()
}

export function getCredits() {
  const c = rollover()
  const tier = currentTier()
  const allowanceSec = allowanceFor(tier)
  const usedSec = Math.min(c.usedSec, allowanceSec)
  return {
    tier,
    allowanceSec,
    usedSec,
    remainingSec: Math.max(0, allowanceSec - c.usedSec),
    resetAt: nextResetAt(),
    period: c.period
  }
}

// Reserve before a transcription: refuse when the bucket is empty so a request
// is never sent that the user has no allowance for.
export function canSpend(seconds = 0) {
  const { remainingSec } = getCredits()
  return remainingSec > 0 || Number(seconds) <= 0
}

// Record consumed audio seconds (rounded up — partial seconds still cost). Caps
// at the allowance so the meter never reports negative. Returns the fresh state.
export function consumeCredits(seconds) {
  const c = rollover()
  const add = Math.max(0, Math.ceil(Number(seconds) || 0))
  c.usedSec = Math.max(0, c.usedSec + add)
  persist()
  return getCredits()
}

// Dev/testing + a user-facing "reset my meter" affordance.
export function resetCredits() {
  cache = { period: periodKey(), usedSec: 0 }
  persist()
  return getCredits()
}
