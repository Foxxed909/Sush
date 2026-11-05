import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { agentById } from './agents.mjs'
import { newId } from './crew.mjs'

// `sush crew claude codex opencode "fix the flaky test" [--model claude=opus]`
// Opens one pane per agent, side by side, all started on the same prompt.
// tmux (inside or outside), or Windows Terminal split panes. Each pane runs
// `sush run`, so every agent lands in the crew registry and on the board.

const SUSH = fileURLToPath(new URL('../bin/sush.mjs', import.meta.url))
const has = bin => {
  try { execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' }); return true } catch { return false }
}
const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`

export function parseCrew(args) {
  const agents = []
  const models = {}
  const efforts = {}
  const words = []
  let board = false
  let permission = null
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--model' || a === '-m') {
      const [k, v] = String(args[++i] || '').split('=')
      if (k && v) models[k] = v
      continue
    }
    if (a === '--effort' || a === '-e') {
      const [k, v] = String(args[++i] || '').split('=')
      if (k && v) efforts[k] = v
      continue
    }
    if (a === '--permission' || a === '--mode') { permission = args[++i] || null; continue }
    if (a === '--board') { board = true; continue }
    if (a === '--dry-run') continue
    if (!words.length && agentById(a)) { agents.push(a); continue }
    words.push(a)
  }
  return { agents, models, efforts, permission, prompt: words.join(' ').trim(), board }
}

// The shell command each pane runs.
export function paneCommand(agent, { model, effort, permission, prompt, crewId, node = process.execPath }) {
  return [q(node), q(SUSH), 'run', agent, ...(model ? ['--model', q(model)] : []), ...(effort ? ['--effort', q(effort)] : []), ...(permission ? ['--permission', q(permission)] : []), '--crew', crewId, ...(prompt ? [q(prompt)] : [])].join(' ')
}

export function planCrew({ agents, models, efforts = {}, permission = null, prompt, board }, { env = process.env, platform = process.platform, have = has } = {}) {
  const crewId = newId().replace('t-', 'crew-')
  const panes = agents.map(a => paneCommand(a, { model: models[a], effort: efforts[a], permission, prompt, crewId }))
  if (board) panes.push([q(process.execPath), q(SUSH), 'board'].join(' '))
  if (env.TMUX) return { kind: 'tmux-inside', crewId, panes }
  if (have('tmux')) return { kind: 'tmux-new', crewId, panes, session: `sush-${crewId.slice(-6)}` }
  if (platform === 'win32' && have('wt')) return { kind: 'wt', crewId, panes }
  return { kind: 'none', crewId, panes }
}

export function runCrew(plan, { cwd = process.cwd() } = {}) {
  const sh = (bin, args) => spawnSync(bin, args, { stdio: 'inherit', cwd })
  if (plan.kind === 'tmux-inside') {
    plan.panes.forEach((cmd, i) => {
      sh('tmux', ['split-window', i === 0 ? '-h' : '-v', '-c', cwd, cmd])
      sh('tmux', ['select-layout', 'tiled'])
    })
    return 0
  }
  if (plan.kind === 'tmux-new') {
    const [first, ...rest] = plan.panes
    sh('tmux', ['new-session', '-d', '-s', plan.session, '-c', cwd, first])
    for (const cmd of rest) { sh('tmux', ['split-window', '-t', plan.session, '-c', cwd, cmd]); sh('tmux', ['select-layout', '-t', plan.session, 'tiled']) }
    sh('tmux', ['set-option', '-t', plan.session, 'pane-border-style', 'fg=#5a3a4f'])
    sh('tmux', ['set-option', '-t', plan.session, 'pane-active-border-style', 'fg=#ff6b9d'])
    return sh('tmux', ['attach', '-t', plan.session]).status ?? 0
  }
  if (plan.kind === 'wt') {
    const args = ['-w', '0', 'new-tab', '--title', 'Sush crew', '-d', cwd, 'cmd', '/k', plan.panes[0]]
    plan.panes.slice(1).forEach((cmd, i) => args.push(';', 'split-pane', i % 2 ? '-H' : '-V', '-d', cwd, 'cmd', '/k', cmd))
    return sh('wt', args).status ?? 0
  }
  return null
}
