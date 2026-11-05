import { spawn } from 'node:child_process'
import { agentById, commandFor } from './agents.mjs'
import { newId, register, update } from './crew.mjs'

// Start an agent in this terminal and put it in the crew registry, so
// `sush board` and the desktop app can see it. Resolves with the exit code.
export function launchAgent({ agent, model = null, effort = null, permission = null, prompt = '', resume = false, cwd = process.cwd(), crewId = null, handoffFrom = null, env = process.env }) {
  const def = agentById(agent)
  const argv = commandFor(agent, { model, prompt, resume, effort, permission })
  if (!def || !argv) return Promise.resolve({ code: 1, error: `unknown agent: ${agent}` })
  return new Promise(resolve => {
    let child
    try {
      child = spawn(argv[0], argv.slice(1), { stdio: 'inherit', cwd, env, shell: process.platform === 'win32' })
    } catch (e) {
      resolve({ code: 1, error: e.message }); return
    }
    const rec = register({
      id: newId(), agent, label: def.label, model: model || null, effort: effort || null, permission: permission || null, cwd, pid: child.pid, wrapperPid: process.pid,
      crewId, handoffFrom, resume, prompt: String(prompt || '').split('\n')[0].slice(0, 160)
    }, env)
    const done = (code, error) => {
      update(rec.id, { endedAt: Date.now(), exitCode: code ?? null }, env)
      resolve({ code: code ?? 0, error, id: rec.id })
    }
    child.on('exit', code => done(code))
    child.on('error', e => done(1, e.message))
  })
}
