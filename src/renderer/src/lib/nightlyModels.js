// Nightly provider/model adapter.
//
// Model IDs are opaque CLI values. Each provider lists its stable aliases
// plus the current generation by explicit id (refreshed Nov 2026); any other
// id can still be typed into the picker. `note` is the one-line description
// shown under a row, `badge` a short tag ('New', 'Free', 'Fast').

// Must start alphanumeric: a value like `--dangerously-skip-permissions` is
// shell-safe but would be read by the CLI as a flag, not a model id.
const SAFE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/

export const NIGHTLY_MODEL_SPECS = {
  claude: {
    flag: '--model',
    options: [
      { value: '', label: 'Default', note: 'Whatever your Claude plan picks' },
      { value: 'claude-fable-5-1', label: 'Fable 5.1', note: 'Most capable · long, hard work', badge: 'New' },
      { value: 'claude-opus-5-5', label: 'Opus 5.5', note: 'Deep reasoning and large refactors', badge: 'New' },
      { value: 'claude-sonnet-5-5', label: 'Sonnet 5.5', note: 'Fast everyday coding', badge: 'New' },
      { value: 'claude-haiku-5-5', label: 'Haiku 5.5', note: 'Quickest and cheapest', badge: 'Fast' },
      { value: 'opus', label: 'Opus (latest)', note: 'Alias, follows the newest Opus' },
      { value: 'sonnet', label: 'Sonnet (latest)', note: 'Alias, follows the newest Sonnet' },
      { value: 'haiku', label: 'Haiku (latest)', note: 'Alias, follows the newest Haiku' }
    ],
    placeholder: 'Search or type a model id',
    effort: {
      label: 'Effort',
      options: ['', 'low', 'medium', 'high', 'xhigh', 'max'],
      // `--effort` accepts low/medium/high/xhigh/max. Claude's interactive
      // `ultracode` mode is a separate workflow/session feature, not a valid
      // value for this CLI flag, so Nightly deliberately does not emit it.
      command: value => `--effort ${value}`
    }
  },
  codex: {
    flag: '--model',
    options: [
      { value: '', label: 'Default', note: 'Codex picks from your ChatGPT plan' },
      { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', note: 'Agentic coding model' }
    ],
    placeholder: 'Search or type a Codex model id',
    effort: {
      label: 'Reasoning',
      options: ['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
      // TOML literal strings keep this one argument portable through
      // PowerShell, cmd and POSIX shells.
      command: value => `--config "model_reasoning_effort='${value}'"`
    }
  },
  gemini: {
    flag: '--model',
    options: [
      { value: '', label: 'Default (Auto)', note: 'Gemini routes per request' },
      { value: 'auto', label: 'Auto', note: 'Routes between Pro and Flash' },
      { value: 'pro', label: 'Pro', note: 'Strongest reasoning' },
      { value: 'flash', label: 'Flash', note: 'Fast and capable', badge: 'Fast' },
      { value: 'flash-lite', label: 'Flash Lite', note: 'Lightest and cheapest' }
    ],
    placeholder: 'Search or type a Gemini model id'
  },
  opencode: {
    flag: '--model',
    // OpenCode Zen's free tier (from `opencode models`). Any provider/model
    // the user has connected in OpenCode can be typed in.
    options: [
      { value: '', label: 'Default / last used', note: 'Whatever OpenCode used last' },
      { value: 'opencode/big-pickle', label: 'Big Pickle', note: 'OpenCode Zen', badge: 'Free' },
      { value: 'opencode/deepseek-v4.1-flash-free', label: 'DeepSeek V4.1 Flash', note: 'OpenCode Zen', badge: 'Free' },
      { value: 'opencode/glm-5.3-flash-free', label: 'GLM 5.3 Flash', note: 'OpenCode Zen', badge: 'Free' },
      { value: 'opencode/mimo-v2.6-flash-free', label: 'MiMo V2.6 Flash', note: 'OpenCode Zen', badge: 'Free' },
      { value: 'opencode/nemotron-3-ultra-free', label: 'Nemotron 3 Ultra', note: 'OpenCode Zen', badge: 'Free' },
      { value: 'opencode/nemotron-3.5-super-vl-free', label: 'Nemotron 3.5 Super VL', note: 'OpenCode Zen · vision', badge: 'Free' },
      { value: 'opencode/nemotron-3.5-lightning-free', label: 'Nemotron 3.5 Lightning', note: 'OpenCode Zen', badge: 'Free' },
      { value: 'opencode/beam-free', label: 'Beam', note: 'OpenCode Zen', badge: 'Free' },
      { value: 'opencode/flint-40b-free', label: 'Flint 40B', note: 'OpenCode Zen', badge: 'Free' },
      { value: 'anthropic/claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Needs Anthropic connected in OpenCode' },
      { value: 'github-copilot/claude-sonnet-5-5', label: 'Sonnet 5.5 via Copilot', note: 'Needs GitHub Copilot connected in OpenCode' }
    ],
    placeholder: 'Search or type provider/model'
  }
}

// Capabilities discovered from the installed CLIs (main process probes
// `--version`/`--help`; see src/main/provider-capabilities.js). They only ever
// NARROW or REPLACE the verified fallback above with what the CLI itself
// advertises; `null` fields mean "not observed" and leave the fallback alone.
// Kept module-level so the launcher, live menus, validators and the command
// builder all read the same answer.
let discovered = {}

export function setProviderCapabilities(map) {
  discovered = map && typeof map === 'object' ? { ...map } : {}
}

export function providerCapabilities(provider) {
  return discovered[provider] || null
}

// false only when the installed CLI's help positively lacks the resume flag.
export function supportsResume(provider) {
  return providerCapabilities(provider)?.resume !== false
}

export function modelSpecFor(provider) {
  return NIGHTLY_MODEL_SPECS[provider] || null
}

export function normalizeModel(provider, value) {
  if (!modelSpecFor(provider)) return null
  if (providerCapabilities(provider)?.models?.flag === false) return null
  const v = String(value ?? '').trim()
  if (!v) return null
  return SAFE_MODEL.test(v) ? v : null
}

export function effortLabelFor(provider, value, fallback = 'Provider default') {
  const v = String(value || '')
  if (!v) return fallback
  if (provider === 'claude' && v === 'ultracode') return 'ultracode · xhigh + workflows'
  return EFFORT_LABELS[v] || v
}

const EFFORT_LABELS = { none: 'None', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' }

export function effortOptionsFor(provider, model = null) {
  const spec = modelSpecFor(provider)?.effort
  if (!spec) return []

  const reasoning = providerCapabilities(provider)?.reasoning
  // The installed CLI has no such flag: offering a level would only make the
  // launch fail, so offer none.
  if (reasoning?.flag === false) return []
  // The installed CLI enumerates its accepted values: that list is the truth
  // for this version, including values newer than our fallback.
  if (Array.isArray(reasoning?.choices) && reasoning.choices.length) {
    return ['', ...reasoning.choices]
  }

  // Codex publishes supported reasoning efforts per model. Until Sush has a
  // live model-catalog bridge, narrow the picker only for model slugs whose
  // current supported set we can verify; unknown models keep the CLI enum so
  // we don't block newer provider values.
  const modelId = String(model || '').trim().toLowerCase()
  if (provider === 'codex' && modelId === 'gpt-5.3-codex') {
    return ['', 'low', 'medium', 'high', 'xhigh']
  }

  return spec.options
}

export function normalizeEffort(provider, value, model = null) {
  const v = String(value ?? '').trim().toLowerCase()
  const options = effortOptionsFor(provider, model)
  if (!v || !options.includes(v)) return null
  return v
}

export function buildAgentCommand(agent, { model, effort, resume = false } = {}) {
  if (!agent) return null
  const base = resume ? (agent.resumeCommand || agent.command) : agent.command
  if (!base) return null
  const spec = modelSpecFor(agent.id)
  if (!spec) return base

  const parts = [base]
  const safeModel = normalizeModel(agent.id, model)
  if (safeModel) parts.push(spec.flag, safeModel)

  const safeEffort = normalizeEffort(agent.id, effort, model)
  if (safeEffort && spec.effort?.command) parts.push(spec.effort.command(safeEffort))

  return parts.join(' ')
}

// ── Model picker rows (Nightly, after T3 Code's ModelPickerContent, MIT) ──
export const PICKER_PROVIDERS = ['claude', 'codex', 'gemini', 'opencode']

function modelKey(provider, value) {
  return `${provider}:${value || ''}`
}

// Rows for one sidebar section: 'favorites' or a provider id. A search spans
// every provider, like T3; a typed id that is a valid model for the provider
// in view becomes a "Use …" row, because catalogs here are deliberately short.
export function pickerRows({ section = 'claude', query = '', favorites = new Set() } = {}) {
  const q = String(query || '').trim().toLowerCase()
  const providers = q || section === 'favorites' ? PICKER_PROVIDERS : [section]
  const rows = []
  for (const provider of providers) {
    const spec = modelSpecFor(provider)
    if (!spec) continue
    for (const option of spec.options) {
      const key = modelKey(provider, option.value)
      if (section === 'favorites' && !q && !favorites.has(key)) continue
      const label = option.label || option.value
      if (q && !`${label} ${option.value} ${option.note || ''} ${option.badge || ''} ${provider}`.toLowerCase().includes(q)) continue
      rows.push({ key, provider, value: option.value || null, label, note: option.note || '', badge: option.badge || '', favorite: favorites.has(key) })
    }
  }
  if (q && section !== 'favorites') {
    // Only offer "Use …" for something shaped like a model id, so a half-typed
    // search word ("sonne") never restarts the CLI with a bogus --model.
    const typed = String(query || '').trim()
    const custom = /[-./:0-9]/.test(typed) ? normalizeModel(section, typed) : null
    const known = rows.some(r => String(r.value || '').toLowerCase() === custom?.toLowerCase())
    if (custom && !known) {
      rows.push({ key: modelKey(section, custom), provider: section, value: custom, label: `Use “${custom}”`, custom: true, favorite: false })
    }
  }
  return rows
}

export function pickerModelLabel(provider, model) {
  const spec = modelSpecFor(provider)
  if (!model) return spec?.options.find(o => !o.value)?.label || 'Default'
  return spec?.options.find(o => o.value === model)?.label || model
}

// ── Context window (Nightly composer) ──────────────────────────────────────
// Current Claude models run with a 1M-token window by default (Haiku: 200K);
// there is no larger window to opt into, so "max" is what they already use.
// Other CLIs choose their window per model; Sush does not guess it.
// Known context windows. Codex reports its real window in the rollout
// (`reported`), which wins; Gemini's current models all take ~1M.
export function contextWindowFor(provider, model, reported = null) {
  if (Number(reported) > 0) return Number(reported)
  if (provider === 'claude') return /haiku/i.test(String(model || '')) ? 200_000 : 1_000_000
  if (provider === 'gemini') return 1_048_576
  return null
}

// Slash commands each CLI documents for shrinking or resetting its context.
export const CONTEXT_COMMANDS = {
  claude: { compact: '/compact', clear: '/clear' },
  codex: { compact: '/compact', clear: '/new' },
  gemini: { compact: '/compress', clear: '/clear' },
  opencode: { compact: '/compact', clear: '/new' }
}

export function formatTokens(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v < 0) return '—'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0).replace(/\.0$/, '')}M`
  if (v >= 1000) return `${Math.round(v / 1000)}K`
  return String(Math.round(v))
}
