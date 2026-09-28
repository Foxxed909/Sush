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
      // Claude Code exposes low/medium/high/xhigh/max; exact availability can
      // still vary by model/version, so Sush never invents provider-specific
      // values beyond the CLI's own effort vocabulary.
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

export function modelSpecFor(provider) {
  return NIGHTLY_MODEL_SPECS[provider] || null
}

export function normalizeModel(provider, value) {
  if (!modelSpecFor(provider)) return null
  const v = String(value ?? '').trim()
  if (!v) return null
  return SAFE_MODEL.test(v) ? v : null
}

export function normalizeEffort(provider, value) {
  const spec = modelSpecFor(provider)?.effort
  const v = String(value ?? '').trim().toLowerCase()
  if (!spec || !v || !spec.options.includes(v)) return null
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

  const safeEffort = normalizeEffort(agent.id, effort)
  if (safeEffort && spec.effort?.command) parts.push(spec.effort.command(safeEffort))

  return parts.join(' ')
}
