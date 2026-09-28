// Guard rails for actions that come out of an LLM.
//
// Seducia's model reads session output (which can contain attacker-controlled
// text: web pages, issues, files an agent opened) and replies with JSON action
// lines. Those must never be trusted like the user's own typing:
//   1. a launch may only name catalogued agents; the model cannot supply the
//      command line, label or any other field the launcher would spread in;
//   2. actions that execute or destroy (launch, run, close-*) need a click.

// Model-supplied `count` is bounded here; the launcher additionally caps by plan.
export const MAX_AGENTS_PER_ACTION = 12

// Only these intents change what is running on the machine.
const GATED = new Set(['launch', 'run', 'close-session', 'close-workspace'])

export function needsApproval(intent) {
  return GATED.has(intent?.type)
}

// Keep only { id, count, model, effort } for agents that exist in the catalog.
// `lookup` resolves an id to a catalog entry (agentById); model/effort are
// re-validated by the same adapter functions the UI uses, so a value the
// picker would refuse is refused here too.
export function sanitizeLaunchAgents(agents, { lookup, normalizeModel, normalizeEffort } = {}) {
  const out = []
  const dropped = []
  for (const raw of Array.isArray(agents) ? agents : []) {
    const id = typeof raw?.id === 'string' ? raw.id : ''
    const known = id && lookup ? lookup(id) : null
    if (!known) { dropped.push(id || '(no id)'); continue }
    const n = Math.floor(Number(raw?.count))
    const count = Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_AGENTS_PER_ACTION) : 1
    const entry = { id: known.id, count }
    const model = normalizeModel ? normalizeModel(known.id, raw?.model) : null
    if (model) {
      entry.model = model
      const effort = normalizeEffort ? normalizeEffort(known.id, raw?.effort, model) : null
      if (effort) entry.effort = effort
    } else if (raw?.effort && normalizeEffort) {
      const effort = normalizeEffort(known.id, raw.effort, null)
      if (effort) entry.effort = effort
    }
    out.push(entry)
  }
  return { agents: out, dropped }
}

const clip = (text, n = 120) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

// One human-readable line per gated action, shown on the approval card.
// Shows the literal command for `run` — what will execute, not a paraphrase.
export function describeGatedIntent(intent, { label = id => id } = {}) {
  switch (intent?.type) {
    case 'launch': {
      const crew = (Array.isArray(intent.agents) ? intent.agents : [])
        .map(a => `${Math.max(1, Number(a?.count) || 1)}× ${label(a?.id) || a?.id || '?'}`)
        .join(', ') || 'no agents'
      return { kind: 'Launch', text: `${crew}${intent.cwd ? ` in ${clip(intent.cwd, 60)}` : ''}`, detail: intent.prompt ? `Brief: ${clip(intent.prompt, 200)}` : null }
    }
    case 'run':
      return { kind: 'Run', text: clip(intent.input, 200), mono: true }
    case 'close-session':
      return { kind: 'Close', text: `sessions matching “${clip(intent.target || 'all', 40)}”` }
    case 'close-workspace':
      return { kind: 'Close workspace', text: clip(intent.name || 'this workspace', 60) }
    default:
      return { kind: intent?.type || 'Action', text: '' }
  }
}
