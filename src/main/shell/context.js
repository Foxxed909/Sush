import { homedir } from 'os'

const MAX_HISTORY = 500

export class ShellContext {
  constructor({ cwd, tabId } = {}) {
    this.cwd = cwd ?? homedir()
    this.env = { ...process.env }
    this.history = []
    this.aliases = {}
    this.tabId = tabId ?? null
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
    const [first, ...rest] = input.trim().split(/\s+/)
    if (this.aliases[first]) return `${this.aliases[first]} ${rest.join(' ')}`.trimEnd()
    return input
  }
}
