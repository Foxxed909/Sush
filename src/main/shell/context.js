import { homedir } from 'os'

const MAX_HISTORY = 500

export class ShellContext {
  constructor({ cwd, tabId, shellId } = {}) {
    this.cwd = cwd ?? homedir()
    this.env = { ...process.env }
    this.history = []
    this.aliases = {}
    this.tabId = tabId ?? null
    this.shellId = shellId ?? null
  }

  setCwd(newCwd) {
    this.cwd = newCwd
  }

  pushHistory(input) {
    if (input && this.history[this.history.length - 1] !== input) {
      this.history.push(input)
      if (this.history.length > MAX_HISTORY) this.history.shift()
    }
  }

  // Expand aliases in input before dispatch.
  expandAliases(input) {
    const trimmed = input.trim()
    const first = trimmed.split(/\s+/, 1)[0]
    // Only the alias word is replaced; the rest of the line stays verbatim so
    // quoting and internal spacing in arguments survive expansion.
    if (this.aliases[first]) return `${this.aliases[first]}${trimmed.slice(first.length)}`.trimEnd()
    return input
  }
}
