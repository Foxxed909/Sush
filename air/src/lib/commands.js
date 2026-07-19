// The Air command layer: a small set of Sush built-ins behind a `:` sigil
// (`:help`, `:theme ember`). When a line starts with `:` on an empty prompt,
// the Terminal echoes locally and never forwards to the PTY — so we never
// have to fight PSReadLine/readline to un-type a line, and every real shell
// keystroke (completion, history, ctrl-keys) passes through untouched.
//
// Intentionally tiny compared to big Sush: no fs surface, no package ops.

export const AIR_COMMANDS = {
  help: 'List Air built-ins',
  clear: 'Clear the screen',
  note: 'Print a highlighted note into the scrollback',
  theme: 'Switch theme (theme <ink|ember|moss|paper>)',
  agent: 'Launch an agent CLI in this session (agent claude, agent gemini …)',
  air: 'About Sush Air'
}

const AGENTS = { claude: 'claude', gemini: 'gemini', codex: 'codex', aider: 'aider' }

// Returns null to pass the line to the shell, or an action object:
//   { print: '...' } write text locally   { clear: true }
//   { theme: 'ink' }                      { run: 'claude' } send to the shell
export function interpretLine(line, { themes }) {
  const trimmed = line.trim()
  if (!trimmed) return null
  const [cmd, ...args] = trimmed.split(/\s+/)
  switch (cmd.toLowerCase()) {
    case 'help': {
      const rows = Object.entries(AIR_COMMANDS).map(([k, v]) => `  :${k.padEnd(7)} ${v}`)
      return { print: `\r\nSush Air built-ins (start a line with ':'):\r\n${rows.join('\r\n')}\r\n(everything else goes to your shell)\r\n` }
    }
    case 'clear':
      return { clear: true }
    case 'note':
      return { print: `\r\n\x1b[1;33m▌ ${args.join(' ')}\x1b[0m\r\n` }
    case 'theme': {
      const id = (args[0] || '').toLowerCase()
      if (themes[id]) return { theme: id }
      return { print: `\r\nThemes: ${Object.keys(themes).join(', ')}\r\n` }
    }
    case 'agent': {
      const name = (args[0] || '').toLowerCase()
      const bin = AGENTS[name]
      if (!bin) return { print: `\r\nAgents: ${Object.keys(AGENTS).join(', ')}\r\n` }
      return { run: [bin, ...args.slice(1)].join(' ') }
    }
    case 'air':
      return { print: '\r\nSush Air — the light Sush. Tauri + Rust PTY, a fraction of the weight.\r\n' }
    default:
      return null
  }
}
