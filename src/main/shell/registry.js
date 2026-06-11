import * as fs from '../commands/fs'
import * as system from '../commands/system'
import * as dev from '../commands/dev'
import * as gh from '../commands/gh'
import * as secrets from '../commands/secrets'
import * as tools from '../commands/tools'
import * as utils from '../commands/utils'
import * as workspace from '../commands/workspace'
import * as extras from '../commands/extras'
import * as more from '../commands/more'
import * as github from '../commands/github'

const allModules = [workspace, fs, system, dev, gh, secrets, tools, utils, extras, more, github]

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

  get(name) {
    if (name == null) return undefined
    return this._map.get(name) ?? this._map.get(String(name).toLowerCase())
  }
  all() { return [...new Set(this._map.values())] }
}

export const registry = new CommandRegistry()
