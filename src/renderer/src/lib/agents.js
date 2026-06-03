// Agents that can be launched into a session. `command` is typed into the
// shell once it boots (null = a plain terminal). `mono` + `color` render the
// monogram badge. Add your own CLIs here -- the launcher picks them up.
export const AGENTS = [
  { id: 'shell', label: 'Terminal', command: null, mono: '>_', color: '#8b9bb0', desc: 'Plain shell' },
  { id: 'claude', label: 'Claude Code', command: 'claude', mono: 'C', color: '#d97757', desc: 'Anthropic CLI' },
  { id: 'codex', label: 'Codex', command: 'codex', mono: 'Cx', color: '#10a37f', desc: 'OpenAI CLI' },
  { id: 'gemini', label: 'Gemini', command: 'gemini', mono: 'G', color: '#4285f4', desc: 'Google CLI' },
  { id: 'opencode', label: 'OpenCode', command: 'opencode', mono: 'O', color: '#f59e0b', desc: 'OpenCode CLI' }
]

// Mirrors BridgeSpace: spin up one agent or a whole swarm, capped so the
// terminal grid stays manageable.
export const MAX_SESSIONS = 16

export const agentById = (id) => AGENTS.find(a => a.id === id) || null
