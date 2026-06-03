import * as fs from '../commands/fs'
import * as system from '../commands/system'
import * as dev from '../commands/dev'
import * as gh from '../commands/gh'
import * as secrets from '../commands/secrets'
import * as tools from '../commands/tools'
import * as utils from '../commands/utils'
import * as workspace from '../commands/workspace'
import * as extras from '../commands/extras'

const allModules = [workspace, fs, system, dev, gh, secrets, tools, utils, extras]

class CommandRegistry {
  constructor() {
    this._map = new Map()
    for (const mod of allModules) {
      for (const [key, cmd] of Object.entries(mod)) {
        if (cmd && typeof cmd.run === 'function') {
          this._map.set(cmd.name ?? key, cmd)
          if (cmd.aliases) cmd.aliases.forEach(a => this._map.set(a, cmd))
        }
      }
    }
  }

  get(name) { return this._map.get(name) }
  all() { return [...new Set(this._map.values())] }
}

export const registry = new CommandRegistry()
