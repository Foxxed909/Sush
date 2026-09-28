// Nightly provider/model adapter.
//
// Model IDs are deliberately treated as opaque CLI values. We only ship stable
// aliases we can verify across provider CLIs; users can enter a concrete model
// id without Sush having to ship a constantly-stale catalog.

const SAFE_MODEL = /^[A-Za-z0-9._:/-]{1,120}$/

export const NIGHTLY_MODEL_SPECS = {
  claude: {
    flag: '--model',
    options: [
      { value: '', label: 'Default' },
      { value: 'sonnet', label: 'Sonnet' },
      { value: 'opus', label: 'Opus' }
    ],
    placeholder: 'sonnet, opus, or full model id',
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
    options: [{ value: '', label: 'Default' }],
    placeholder: 'Codex model id',
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
      { value: '', label: 'Default (Auto)' },
      { value: 'auto', label: 'Auto' },
      { value: 'pro', label: 'Pro' },
      { value: 'flash', label: 'Flash' },
      { value: 'flash-lite', label: 'Flash Lite' }
    ],
    placeholder: 'auto, pro, flash, or model id'
  },
  opencode: {
    flag: '--model',
    options: [{ value: '', label: 'Default / last used' }],
    placeholder: 'provider/model'
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
  return v
}

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
