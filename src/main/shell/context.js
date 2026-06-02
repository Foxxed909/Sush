import { homedir } from 'os'

export class ShellContext {
  constructor({ cwd } = {}) {
    this.cwd = cwd ?? homedir()
    this.env = { ...process.env }
    this.history = []
  }

  setCwd(newCwd) {
    this.cwd = newCwd
  }

  pushHistory(input) {
    if (input && this.history[this.history.length - 1] !== input) {
      this.history.push(input)
    }
  }
}
