// Agents and CLI tools that can be launched into a session. `command` is typed
// into the shell once it boots (null = a plain terminal). `mono` + `color`
// render the monogram badge.
//
// `resumeCommand` (optional) is used instead of `command` when a session is
// *restored* after an app restart, so the agent picks up its previous
// conversation in that directory rather than starting fresh. Only set it for
// CLIs that actually support resume; agents without it just re-launch fresh.
//
// Machine-specific tools no longer live here — add them as CUSTOM agents in
// Settings ▸ Agents (stored per user in localStorage, key 'sush-custom-agents').
export const BUILTIN_AGENTS = [
  { id: 'shell', label: 'Terminal', command: null, mono: '>_', color: '#8b9bb0', desc: 'Plain shell' },
  { id: 'claude', label: 'Claude Code', command: 'claude', resumeCommand: 'claude --continue', mono: 'C', color: '#d97757', desc: 'Anthropic CLI' },
  { id: 'codex', label: 'Codex', command: 'codex', resumeCommand: 'codex resume --last', mono: 'Cx', color: '#10a37f', desc: 'OpenAI CLI' },
  { id: 'gemini', label: 'Gemini', command: 'gemini', resumeCommand: 'gemini --resume latest', mono: 'G', color: '#4285f4', desc: 'Google CLI' },
  { id: 'opencode', label: 'OpenCode', command: 'opencode', resumeCommand: 'opencode --continue', mono: 'O', color: '#f59e0b', desc: 'OpenCode CLI' },
  // Grok Build (xAI) — interactive TUI; --continue resumes the latest session
  // for the cwd (docs: -c / --continue).
  { id: 'grok', label: 'Grok Build', command: 'grok', resumeCommand: 'grok --continue', mono: 'Gk', color: '#22d3ee', desc: 'xAI coding agent' }
]

const CUSTOM_KEY = 'sush-custom-agents'

// Read inside functions only — module-scope localStorage reads would beat the
// per-user storage shim installed in main.jsx.
export function loadCustomAgents() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved
      .filter(a => a && a.id && a.label && a.command)
      .slice(0, 12)
      .map(a => ({
        id: String(a.id),
        label: String(a.label).slice(0, 24),
        command: String(a.command).slice(0, 200),
        resumeCommand: a.resumeCommand ? String(a.resumeCommand).slice(0, 200) : undefined,
        mono: String(a.mono || a.label[0] || '?').slice(0, 2),
        color: /^#[0-9a-fA-F]{3,8}$/.test(a.color || '') ? a.color : '#8b9bb0',
        desc: String(a.desc || 'Custom agent').slice(0, 40),
        custom: true
      }))
  } catch {
    return []
  }
}

export function saveCustomAgents(list) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list.slice(0, 12))) } catch {}
}

export function addCustomAgent({ label, command, resumeCommand, color }) {
  const name = String(label ?? '').trim()
  const cmd = String(command ?? '').trim()
  if (!name || !cmd) return { ok: false, error: 'Name and command are required' }
  const id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)
  if (allAgents().some(a => a.id === id)) return { ok: false, error: 'An agent with that name already exists' }
  const next = [...loadCustomAgents(), { id, label: name, command: cmd, resumeCommand: String(resumeCommand ?? '').trim() || undefined, mono: name[0].toUpperCase(), color: color || '#8b9bb0', desc: 'Custom agent', custom: true }]
  saveCustomAgents(next)
  return { ok: true, id }
}

export function removeCustomAgent(id) {
  saveCustomAgents(loadCustomAgents().filter(a => a.id !== id))
}

// Built-ins + the user's custom agents. The launcher, Seducia's catalog, and
// the CLI-availability probe all go through this so custom agents are
// first-class everywhere.
export function allAgents() {
  return [...BUILTIN_AGENTS, ...loadCustomAgents()]
}

// Back-compat alias for modules that only need the static built-in list
// (e.g. the AI system prompt's id catalog, built at module scope).
export const AGENTS = BUILTIN_AGENTS

// How to trigger each CLI's OWN sign-in when connecting an account. Running
// the command opens the vendor's native login (browser OAuth — "Continue with
// Google" wherever the vendor offers it). Sush never sees the credentials; it
// only points the CLI at the right config dir and lets the CLI log itself in.
// `agent` simply runs the agent on first use (which prompts login); a few CLIs
// have an explicit login subcommand instead.
export const LOGIN_COMMANDS = {
  claude: { command: 'claude', label: 'Claude sign-in' },
  codex: { command: 'codex', label: 'Codex sign-in' },
  gemini: { command: 'gemini', label: 'Gemini sign-in' },
  opencode: { command: 'opencode auth login', label: 'OpenCode sign-in' },
  grok: { command: 'grok login', label: 'Grok Build sign-in' }
}

// Hard ceiling on concurrent sessions — must be at least the largest tier's
// gridCap (Enterprise sells 32 grid sessions; a 16 ceiling silently broke that
// promise). The per-tier cap is enforced where sessions are created
// (launchSessions consults the license); this is only the absolute bound.
export const MAX_SESSIONS = 32

export const agentById = (id) => allAgents().find(a => a.id === id) || null

/** Providers that participate in account slots + the usage pool popover. */
export const POOL_PROVIDERS = ['claude', 'codex', 'gemini', 'opencode', 'grok']
