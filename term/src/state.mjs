import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Last agent, chosen model per agent, prompt history. Nothing else, and
// nothing ever leaves the machine.
export function stateDir() {
  if (process.env.SUSH_TERMINAL_HOME) return process.env.SUSH_TERMINAL_HOME
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'sush-terminal')
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'sush-terminal')
}
export function loadState() {
  try { return JSON.parse(readFileSync(join(stateDir(), 'state.json'), 'utf8')) || {} } catch { return {} }
}
export function saveState(state) {
  try {
    mkdirSync(stateDir(), { recursive: true })
    writeFileSync(join(stateDir(), 'state.json'), JSON.stringify(state, null, 2))
  } catch {}
}
