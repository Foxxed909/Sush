const localPython = (dir, script) =>
  `powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '${dir.replace(/'/g, "''")}'; python ${script}"`

// Agents and CLI tools that can be launched into a session. `command` is typed
// into the shell once it boots (null = a plain terminal). `mono` + `color`
// render the monogram badge. Add your own CLIs here -- the launcher picks them up.
//
// `resumeCommand` (optional) is used instead of `command` when a session is
// *restored* after an app restart, so the agent picks up its previous
// conversation in that directory rather than starting fresh. Only set it for
// CLIs that actually support resume; agents without it just re-launch fresh.
export const AGENTS = [
  { id: 'shell', label: 'Terminal', command: null, mono: '>_', color: '#8b9bb0', desc: 'Plain shell' },
  { id: 'claude', label: 'Claude Code', command: 'claude', resumeCommand: 'claude --continue', mono: 'C', color: '#d97757', desc: 'Anthropic CLI' },
  // Other agents fall back to a fresh re-launch on restore. Add a verified
  // `resumeCommand` here as each CLI's resume syntax is confirmed (e.g. codex).
  { id: 'codex', label: 'Codex', command: 'codex', mono: 'Cx', color: '#10a37f', desc: 'OpenAI CLI' },
  { id: 'gemini', label: 'Gemini', command: 'gemini', mono: 'G', color: '#4285f4', desc: 'Google CLI' },
  { id: 'opencode', label: 'OpenCode', command: 'opencode', mono: 'O', color: '#f59e0b', desc: 'OpenCode CLI' },
  { id: 'hermes', label: 'Hermes', command: 'hermes', mono: 'H', color: '#7c3aed', desc: 'Hermes agent CLI' },
  { id: 'aipex', label: 'AIPEX', command: 'aipex', mono: 'Ax', color: '#22c55e', desc: 'Rooms CLI agent' },
  { id: 'trident', label: 'Trident', command: 'trident', mono: 'T', color: '#38bdf8', desc: 'Agentic coding CLI' },
  { id: 'bedrock', label: 'Bedrock', command: 'bedrock', mono: 'B', color: '#a3e635', desc: 'Grounded AI workspace' },
  { id: 'quill', label: 'Quill', command: localPython('C:\\Users\\WhitePC\\Rooms\\Coderoom\\CLI\\Quill', 'quill.py'), mono: 'Q', color: '#f472b6', desc: 'Writing CLI' },
  { id: 'razor', label: 'Razor', command: 'razor', mono: 'Rz', color: '#ef4444', desc: 'Coding CLI' },
  { id: 'serenity', label: 'Serenity', command: 'serenity', mono: 'S', color: '#14b8a6', desc: 'Calm AI workspace' },
  { id: 'sydney', label: 'Sydney', command: 'sydney', mono: 'Sy', color: '#60a5fa', desc: 'AI companion CLI' },
  { id: 'ocp', label: 'OCP', command: localPython('C:\\Users\\WhitePC\\Rooms\\Coderoom\\CLI\\OCP', 'ocp.py'), mono: 'OC', color: '#f97316', desc: 'Open CLI Platform' },
  { id: 'erosion', label: 'Erosion', command: 'erosion help', mono: 'Er', color: '#84cc16', desc: 'Cache cleaner tool' },
  { id: 'evm', label: 'EVM', command: 'evm help', mono: 'Ev', color: '#eab308', desc: 'Environment monitor' }
]

// Mirrors BridgeSpace: spin up one agent or a whole swarm, capped so the
// terminal grid stays manageable.
export const MAX_SESSIONS = 16

export const agentById = (id) => AGENTS.find(a => a.id === id) || null
