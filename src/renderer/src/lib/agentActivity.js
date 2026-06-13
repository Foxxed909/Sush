// Mission Control: classify a session's live state from its PTY output stream.
//
// The renderer pipes every byte through `window.sush.onPtyData`. Rather than
// re-render on each byte, useAgentActivity keeps a small per-tab record (a tail
// of recent output + the timestamp of the last write) and calls classify() on a
// timer. The result is one of the STATES below, used to paint the board.
//
// This is deliberately heuristic. "working" vs "quiet" vs "exited" is reliable;
// the prompt/error sniffing is best-effort and tuned to be conservative so a
// busy agent is never mislabelled as waiting.

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]|[\x00-\x08\x0b\x0c\x0e-\x1f]/g

/** Strip ANSI escapes / control bytes so the tail can be pattern-matched. */
export function stripAnsi(value) {
  return String(value ?? '').replace(ANSI, '')
}

// How long output must be silent before a session is considered "settled"
// (i.e. no longer actively streaming). Below this it's "working".
const QUIET_MS = 1500

// Spinner glyphs + phrases that mean an agent is mid-thought even if the byte
// stream paused for a beat (CLIs often render a spinner then idle the PTY).
const BUSY_RE = /esc to interrupt|thinking|working…|working\.\.\.|compiling|building|installing|downloading|generating|running|⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏|▰|▱|◐|◓|◑|◒|↻/i

// An agent pausing to ask the user something. Conservative on purpose.
const WAITING_RE = /\b(y\/n|\[y\/n\]|\[y\/N\]|\[Y\/n\]|yes\/no|continue\?|proceed\?|overwrite\?|do you want|are you sure|press enter|press any key|\(y\)es|allow\?|approve\?)\s*$/i

// A prompt box waiting for free-text input (Claude/Codex-style framed prompt,
// or a bare interrogative caret at the very end of the buffer).
const PROMPT_TAIL_RE = /(│\s*>\s*|❯\s*$|›\s*$|\?\s+[^\n]*\s*$)/

// A normal shell prompt sitting idle (PowerShell / bash / zsh / cmd).
const SHELL_PROMPT_RE = /(PS [^\n]*>\s*$|[^\n]*\$\s*$|[A-Za-z]:\\[^\n]*>\s*$|[^\n]*#\s*$)/

// Surfaced failure signatures.
const ERROR_RE = /\b(error|traceback|exception|fatal|panic|✖|✗|✘| not recognized| not found|command not found|cannot find|permission denied)\b/i

// Usage/session-limit signatures from the agent CLIs (Claude/Codex). When one
// of these shows up in a settled session, Sush can offer to switch to another
// logged-in account for that CLI and resume. Kept specific so a session merely
// *mentioning* the word "limit" doesn't trip it.
const LIMIT_RE = /(usage|session|rate)[ -]?limit (reached|exceeded|hit)|(reached|hit) (your|the) (usage|session|rate)?[ -]?limit|limit (reached|exceeded)|too many requests|quota (exceeded|reached)|\b429\b|upgrade to continue|resets? (at|in)\b/i

/** True when the tail looks like the CLI hit its usage/session limit. */
export function detectLimit(tail) {
  return LIMIT_RE.test(stripAnsi(tail || ''))
}

export const STATES = {
  working: { id: 'working', label: 'Working', color: '#5fd3a8', dot: '#5fd3a8', rank: 1 },
  waiting: { id: 'waiting', label: 'Needs you', color: '#ffcb6b', dot: '#ffcb6b', rank: 0 },
  error:   { id: 'error',   label: 'Error',     color: '#ff6b81', dot: '#ff6b81', rank: 2 },
  idle:    { id: 'idle',    label: 'Idle',      color: '#8b9bb0', dot: '#6b7787', rank: 4 },
  done:    { id: 'done',    label: 'Done',      color: '#9aa6b8', dot: '#5a6675', rank: 3 },
  booting: { id: 'booting', label: 'Starting',  color: '#82aaff', dot: '#82aaff', rank: 1 }
}

/**
 * Classify a session from its activity record.
 * @param {object} rec  { tail, lastDataAt, exited, exitCode, startedAt }
 * @param {number} now  current epoch ms
 * @returns {string} a STATES key
 */
export function classify(rec, now) {
  if (!rec) return 'idle'
  if (rec.exited) return rec.exitCode ? 'error' : 'done'

  const quietMs = now - (rec.lastDataAt ?? 0)
  const tail = stripAnsi(rec.tail || '').replace(/[ \t]+$/gm, '')

  // No output ever, but only just spawned → starting up.
  if (!rec.lastDataAt && now - (rec.startedAt ?? now) < 4000) return 'booting'

  // Actively streaming, or a spinner is on screen → working.
  if (quietMs < QUIET_MS || BUSY_RE.test(tail)) return 'working'

  // Settled. Is it asking us something?
  const trimmed = tail.replace(/\s+$/, '')
  if (WAITING_RE.test(trimmed) || PROMPT_TAIL_RE.test(tail)) {
    // ...unless that "prompt" is really just an idle shell.
    if (!SHELL_PROMPT_RE.test(trimmed)) return 'waiting'
  }

  if (ERROR_RE.test(tail) && !SHELL_PROMPT_RE.test(trimmed)) return 'error'

  return 'idle'
}

/** Tally a {tabId: stateId} map into counts keyed by state id. */
export function summarize(states) {
  const counts = { working: 0, waiting: 0, error: 0, idle: 0, done: 0, booting: 0 }
  for (const id of Object.values(states)) {
    if (counts[id] != null) counts[id] += 1
  }
  return counts
}
