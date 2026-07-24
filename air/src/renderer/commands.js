// The `:` command layer.
//
// The contract, and it is the whole design: a line that starts with `:` is
// Air's, everything else is the shell's. There is no guessing, no "did you
// mean", no interception of a command that merely looks like one of ours. If
// you type `theme` you get your shell's `theme`; if you type `:theme` you get
// Air's. A user should never have to wonder which layer ate their input.
//
// This module is pure — no React, no window, no IPC. It turns a string into a
// description of what should happen, and the App decides how. That is what
// makes the layer testable, and it is why `:` handling has no branches
// scattered through the component.

export const COMMANDS = [
  {
    name: 'help',
    args: '[command]',
    summary: 'List every : command, or explain one',
    aliases: ['?', 'h']
  },
  {
    name: 'clear',
    args: '',
    summary: 'Clear this session’s screen and scrollback',
    aliases: ['cls']
  },
  {
    name: 'note',
    args: '[text]',
    summary: 'Jot a note against this session — no text opens the notes panel',
    aliases: ['n']
  },
  {
    name: 'notes',
    args: '',
    summary: 'Open the notes panel'
  },
  {
    name: 'theme',
    args: '[name]',
    summary: 'Switch theme — no name cycles to the next one',
    aliases: ['t']
  },
  {
    name: 'agent',
    args: '<claude|codex|gemini|opencode>',
    summary: 'Start an agent CLI in this session',
    aliases: ['a']
  },
  {
    name: 'new',
    args: '[path]',
    summary: 'Open a session, optionally in a directory',
    aliases: ['tab']
  },
  {
    name: 'close',
    args: '',
    summary: 'Close this session',
    aliases: ['q']
  },
  {
    name: 'rename',
    args: '<name>',
    summary: 'Rename this session',
    aliases: ['r']
  },
  {
    name: 'split',
    args: '',
    summary: 'Toggle two sessions side by side'
  },
  {
    name: 'find',
    args: '[text]',
    summary: 'Search this session’s output',
    aliases: ['f', 'search']
  },
  {
    name: 'go',
    args: '<number>',
    summary: 'Jump to session N'
  },
  {
    name: 'font',
    args: '<size|+|->',
    summary: 'Set or nudge the terminal font size'
  },
  {
    name: 'zen',
    args: '',
    summary: 'Hide every piece of chrome but the terminal'
  },
  {
    name: 'export',
    args: '',
    summary: 'Save this session’s output as a text file'
  },
  {
    name: 'cwd',
    args: '',
    summary: 'Show this session’s working directory'
  },
  {
    name: 'import',
    args: '',
    summary: 'Bring your aliases, env and start folder across from Sush'
  },
  {
    name: 'forget',
    args: '',
    summary: 'Drop everything imported from Sush and go back to plain Air'
  }
]

const BY_NAME = new Map()
for (const command of COMMANDS) {
  BY_NAME.set(command.name, command)
  for (const alias of command.aliases ?? []) BY_NAME.set(alias, command)
}

export const AGENTS = ['claude', 'codex', 'gemini', 'opencode']

// Is this line addressed to Air rather than to the shell?
// A bare `:` is not — it is what you have typed halfway to a real command, and
// treating it as an error while you are still typing is obnoxious.
export function isAirCommand(line) {
  return /^:\S/.test(String(line ?? ''))
}

// Split `:name arg arg` into its parts. Quotes are respected so a path with a
// space in it survives — `:new "C:\Program Files\x"` is one argument, and on
// Windows that is not an edge case.
export function tokenize(rest) {
  const out = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match
  while ((match = re.exec(String(rest ?? ''))) !== null) {
    out.push(match[1] ?? match[2] ?? match[3])
  }
  return out
}

// Parse a `:` line into { ok, name, args, rest } or { ok: false, error, ... }.
// `rest` is the raw remainder, which commands like :note and :find want
// verbatim rather than tokenized.
export function parseAirCommand(line) {
  const raw = String(line ?? '').trim()
  if (!isAirCommand(raw)) return { ok: false, error: 'Not a : command.' }

  const body = raw.slice(1)
  const spaceAt = body.search(/\s/)
  const word = (spaceAt === -1 ? body : body.slice(0, spaceAt)).toLowerCase()
  const rest = spaceAt === -1 ? '' : body.slice(spaceAt + 1).trim()

  const command = BY_NAME.get(word)
  if (!command) {
    const near = suggest(word)
    return {
      ok: false,
      name: word,
      error: near
        ? `Unknown command :${word} — did you mean :${near}?`
        : `Unknown command :${word}. Try :help.`
    }
  }

  return { ok: true, name: command.name, rest, args: tokenize(rest), command }
}

// Cheap nearest-name suggestion: prefix match first, then a single edit away.
// Deliberately not a fuzzy matcher — a wrong guess is worse than no guess.
export function suggest(word) {
  const target = String(word ?? '').toLowerCase()
  if (!target) return null
  const names = COMMANDS.map(c => c.name)
  const prefix = names.find(n => n.startsWith(target))
  if (prefix) return prefix
  return names.find(n => withinOneEdit(n, target) || isTransposition(n, target)) ?? null
}

// Two adjacent characters swapped. Kept separate from withinOneEdit because
// plain Levenshtein scores a transposition as TWO edits, so `clera` would never
// reach `clear` — and a swap is the single most common way a fast typist misses
// a word. Excluding it made the suggestion useless in exactly the case it is for.
function isTransposition(a, b) {
  if (a.length !== b.length) return false
  let first = -1
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue
    if (first === -1) { first = i; continue }
    // Second mismatch: it must be the one right after the first, and the two
    // characters must be each other's.
    return i === first + 1 && a[first] === b[i] && a[i] === b[first] &&
      a.slice(i + 1) === b.slice(i + 1)
  }
  return false
}

function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (a.length < b.length) j++
    else { i++; j++ }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

// Validate a parsed command and turn it into the action the App runs. Keeping
// validation here — rather than in the component — means every "you need an
// argument" message is written once and reads the same way.
export function resolveAction(parsed) {
  if (!parsed?.ok) return { ok: false, error: parsed?.error ?? 'Not a : command.' }
  const { name, rest, args } = parsed

  switch (name) {
    case 'help':
      return { ok: true, action: 'help', topic: args[0]?.replace(/^:/, '')?.toLowerCase() ?? null }

    case 'clear':
      return { ok: true, action: 'clear' }

    case 'note':
      return rest
        ? { ok: true, action: 'note-add', text: rest }
        : { ok: true, action: 'notes-open' }

    case 'notes':
      return { ok: true, action: 'notes-open' }

    case 'theme':
      return { ok: true, action: 'theme', theme: args[0]?.toLowerCase() ?? null }

    case 'agent': {
      const agent = args[0]?.toLowerCase()
      if (!agent) return { ok: false, error: `Which agent? One of: ${AGENTS.join(', ')}.` }
      if (!AGENTS.includes(agent)) {
        return { ok: false, error: `Unknown agent "${agent}". One of: ${AGENTS.join(', ')}.` }
      }
      return { ok: true, action: 'agent', agent, extra: args.slice(1).join(' ') }
    }

    case 'new':
      return { ok: true, action: 'new', cwd: args[0] ?? null }

    case 'close':
      return { ok: true, action: 'close' }

    case 'rename': {
      const label = rest.slice(0, 40).trim()
      if (!label) return { ok: false, error: 'Give the session a name: :rename api' }
      return { ok: true, action: 'rename', label }
    }

    case 'split':
      return { ok: true, action: 'split' }

    case 'find':
      return { ok: true, action: 'find', query: rest || null }

    case 'go': {
      const n = Number(args[0])
      if (!Number.isInteger(n) || n < 1) return { ok: false, error: 'Which session? :go 2' }
      return { ok: true, action: 'go', index: n - 1 }
    }

    case 'font': {
      const value = args[0]
      if (value === '+' || value === '-') {
        return { ok: true, action: 'font-step', step: value === '+' ? 1 : -1 }
      }
      const size = Number(value)
      if (!Number.isFinite(size)) return { ok: false, error: 'Font size, or + / - to nudge: :font 15' }
      // Clamp rather than reject. Someone typing `:font 400` wants "bigger",
      // and an error message is a worse answer than the largest size we have.
      return { ok: true, action: 'font', size: Math.max(8, Math.min(32, Math.round(size))) }
    }

    case 'zen':
      return { ok: true, action: 'zen' }

    case 'export':
      return { ok: true, action: 'export' }

    case 'cwd':
      return { ok: true, action: 'cwd' }

    case 'import':
      return { ok: true, action: 'import' }

    case 'forget':
      return { ok: true, action: 'forget' }

    default:
      return { ok: false, error: `Unknown command :${name}. Try :help.` }
  }
}

// One call: string in, action out.
export function runAirCommand(line) {
  return resolveAction(parseAirCommand(line))
}

// Completions for the input's ghost text and the palette. Matches on name and
// alias, but only ever SHOWS canonical names — suggesting `:cls` when `:clear`
// exists teaches the wrong vocabulary.
export function completions(line) {
  const raw = String(line ?? '')
  if (!raw.startsWith(':')) return []
  const body = raw.slice(1).toLowerCase()
  if (body.includes(' ')) return []
  const seen = new Set()
  const out = []
  for (const command of COMMANDS) {
    const names = [command.name, ...(command.aliases ?? [])]
    if (!names.some(n => n.startsWith(body))) continue
    if (seen.has(command.name)) continue
    seen.add(command.name)
    out.push(command)
  }
  return out
}

// The `:help` body, as lines. Rendered as plain text on purpose — a help screen
// that needs its own layout is a help screen nobody reads.
export function helpText(topic = null) {
  if (topic) {
    const command = BY_NAME.get(topic)
    if (!command) return [`No command :${topic}. Try :help.`]
    return [`:${command.name} ${command.args}`.trim(), `  ${command.summary}`].concat(
      command.aliases?.length ? [`  also: ${command.aliases.map(a => `:${a}`).join(', ')}`] : []
    )
  }
  const width = Math.max(...COMMANDS.map(c => `:${c.name} ${c.args}`.trim().length))
  return [
    'Sush Air — : commands (everything else goes to your shell)',
    '',
    ...COMMANDS.map(c => `${`:${c.name} ${c.args}`.trim().padEnd(width + 2)}${c.summary}`)
  ]
}
