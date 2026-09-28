// Live xterm instances by tab id, so app-level UI (the Nightly composer) can
// hand a message to a terminal the way a real paste would.
//
// Why this exists: writing `line1\nline2\r` straight to the PTY makes an
// agent TUI read the raw newline as Enter, so a multi-line message is sent as
// separate prompts. xterm's own paste() wraps the text in bracketed-paste
// markers when (and only when) the running program asked for them, and
// converts newlines the way a terminal should.
const terminals = new Map()

export function registerTerminal(tabId, term) {
  if (tabId && term) terminals.set(tabId, term)
}

export function unregisterTerminal(tabId, term) {
  // Only drop our own entry: a remount may already have registered a new one.
  if (terminals.get(tabId) === term) terminals.delete(tabId)
}

export function hasTerminal(tabId) {
  return terminals.has(tabId)
}

// Paste `text` as one block, then press Enter shortly after so the TUI has
// consumed the paste first. Returns false when the terminal isn't mounted
// (caller falls back to raw input).
export function pasteAndSubmit(tabId, text, sendEnter, { delayMs = 40, schedule = setTimeout } = {}) {
  const term = terminals.get(tabId)
  if (!term || typeof term.paste !== 'function') return false
  term.paste(String(text))
  schedule(() => sendEnter?.(), delayMs)
  return true
}

export function isMultiline(text) {
  return /\r|\n/.test(String(text ?? '').replace(/[\r\n]+$/, ''))
}
