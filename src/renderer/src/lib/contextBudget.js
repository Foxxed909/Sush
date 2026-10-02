// Per-provider auto-compact budget from the composer's context control.
//
// This caps how full the context may get before the CLI compacts — it does
// not shrink the model's hard window. Each CLI enforces it its own way:
//   Claude  CLAUDE_CODE_AUTO_COMPACT_WINDOW (env), floor 100K
//   Codex   -c model_auto_compact_token_limit=N
//   Gemini  model.compressionThreshold (a fraction, global in its settings)
// Sush applies it when a session launches.

const KEY = 'sush-context-budget'

export const BUDGET_PROVIDERS = ['claude', 'codex', 'gemini']

// The smallest budget each CLI accepts. Claude rejects anything under 100K.
const FLOOR = { claude: 100_000, codex: 10_000, gemini: 10_000 }

export function budgetRange(provider, windowSize) {
  if (!BUDGET_PROVIDERS.includes(provider)) return null
  const max = Number(windowSize) > 0 ? Number(windowSize) : null
  if (!max) return null
  const min = Math.min(FLOOR[provider], max)
  const step = max > 400_000 ? 5_000 : 1_000
  return { min, max, step }
}

export function clampBudget(provider, value, windowSize) {
  const range = budgetRange(provider, windowSize)
  const n = Math.round(Number(value))
  if (!range || !Number.isFinite(n)) return null
  // At (or past) the window it is simply "the full window": nothing to set.
  if (n >= range.max) return null
  return Math.max(range.min, n)
}

function readAll() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

export function loadContextBudget(provider) {
  const n = Number(readAll()[provider])
  return Number.isFinite(n) && n > 0 ? n : null
}

export function saveContextBudget(provider, value) {
  const all = readAll()
  if (value == null) delete all[provider]
  else all[provider] = Math.round(value)
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch {}
  return value ?? null
}

// Gemini expresses the budget as the fraction of its window at which it
// compresses; two decimals is what its settings dialog offers.
export function geminiThreshold(budget, windowSize) {
  const b = Number(budget)
  const w = Number(windowSize)
  if (!(b > 0) || !(w > 0)) return null
  return Math.min(1, Math.max(0.01, Math.round((b / w) * 100) / 100))
}
