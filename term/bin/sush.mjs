#!/usr/bin/env node
// Sush Terminal: Sush, quietly in your terminal.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { logoLines } from '../src/logo.mjs'
import { paint, reset, bold } from '../src/ansi.mjs'
import { AGENTS, agentById, commandFor, detectInstalled, effortsFor, modelsFor } from '../src/agents.mjs'
import { TAGLINE, runInteractive } from '../src/app.mjs'
import { launchAgent } from '../src/launch.mjs'
import { runBoard } from '../src/board.mjs'
import { parseCrew, planCrew, runCrew } from '../src/crewcmd.mjs'
import { prepareHandoff } from '../src/handoff.mjs'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
const PINK = '#ff6b9d', MUTED = '#9d7f92', SOFT = '#c9b3c2'
// A closed pipe (`sush models | head`) is a normal way to stop reading.
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0); throw e })
const say = (s = '') => process.stdout.write(s + reset + '\n')

function help() {
  for (const l of logoLines()) say('  ' + l)
  say('  ' + paint(MUTED, TAGLINE))
  say()
  say('  ' + paint(PINK, 'usage'))
  const rows = [
    ['sush', 'open the home screen'],
    ['sush run <agent> [prompt]', 'start an agent here (claude, codex, gemini, opencode)'],
    ['   --model <id>', 'with a model, e.g. claude-opus-5-5 or opencode/big-pickle'],
    ['   --effort <level>', 'low · medium · high · xhigh · max (Claude) / none … xhigh (Codex)'],
    ['   --resume', 'continue the last conversation in this folder'],
    ['   --permission <mode>', 'ask · plan · edits · auto · full (also for crew, handoff)'],
    ['sush crew <agents…> [prompt]', 'several agents side by side on one prompt (tmux / Windows Terminal)'],
    ['   --model agent=id', 'per-agent model, e.g. --model codex=gpt-6.1-sol'],
    ['   --effort agent=level', 'per-agent effort, e.g. --effort claude=max'],
    ['   --board', 'add a live board pane'],
    ['sush board [--all]', 'every agent in this folder (or everywhere), live'],
    ['sush handoff <agent>', 'brief another agent from the latest conversation here'],
    ['   --from claude|codex', 'which conversation to hand off'],
    ['sush agents', 'which agent CLIs are installed'],
    ['sush models [agent]', 'the model catalog'],
    ['sush logo', 'print the wordmark'],
    ['sush --version', 'version']
  ]
  for (const [k, v] of rows) say('  ' + paint(SOFT, k.padEnd(28)) + paint(MUTED, v))
}

export function parseArgs(argv) {
  const out = { cmd: argv[0] || null, rest: [], model: null, effort: null, permission: null, resume: false, help: false, version: false, crew: null, from: null, all: false, once: false, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--model' || a === '-m') { out.model = argv[++i] || null; continue }
    if (a === '--resume' || a === '-c') { out.resume = true; continue }
    if ((a === '--effort' || a === '-e') && argv[0] !== 'crew') { out.effort = argv[++i] || null; continue }
    if (a === '--permission' || a === '--mode') { out.permission = argv[++i] || null; continue }
    if (a === '--crew') { out.crew = argv[++i] || null; continue }
    if (a === '--from') { out.from = argv[++i] || null; continue }
    if (a === '--all') { out.all = true; continue }
    if (a === '--once') { out.once = true; continue }
    if (a === '--dry-run') { out.dryRun = true; continue }
    if (a === '--help' || a === '-h') { out.help = true; continue }
    if (a === '--version' || a === '-v') { out.version = true; continue }
    if (i > 0) out.rest.push(a)
  }
  if (out.cmd && out.cmd.startsWith('-')) out.cmd = null
  return out
}

async function main(argv) {
  const args = parseArgs(argv)
  if (args.version) return say(`sush ${pkg.version}`)
  if (args.help) return help()
  if (args.cmd === 'logo') { for (const l of logoLines({ big: true })) say('  ' + l); return say('  ' + paint(MUTED, TAGLINE)) }
  if (args.cmd === 'agents') {
    const found = detectInstalled()
    for (const a of AGENTS) {
      const f = found[a.id]
      say(`  ${paint(a.colour, a.glyph)} ${bold(a.label.padEnd(12))} ${f.installed ? paint('#5fd3a8', 'installed') + paint(MUTED, f.version ? `  v${f.version}` : '') : paint(MUTED, 'not installed')}`)
    }
    return
  }
  if (args.cmd === 'models') {
    const ids = args.rest[0] ? [args.rest[0]] : AGENTS.map(a => a.id)
    for (const id of ids) {
      const a = agentById(id)
      if (!a) { say(paint(PINK, `unknown agent: ${id}`)); process.exitCode = 1; continue }
      say(`  ${paint(a.colour, a.glyph)} ${bold(a.label)}${effortsFor(id).length ? paint(MUTED, `   effort: ${effortsFor(id).filter(Boolean).join(' · ')}`) : ''}`)
      for (const m of modelsFor(id)) say(`    ${paint(SOFT, (m.value || '(default)').padEnd(38))} ${m.label}${m.badge ? ' ' + paint(m.badge === 'Free' ? '#5fd3a8' : PINK, m.badge) : ''}`)
    }
    return
  }
  if (args.cmd === 'run') {
    const id = args.rest[0]
    if (!agentById(id)) { say(paint(PINK, `unknown agent: ${id || '(none)'}`) + paint(MUTED, `  try: ${AGENTS.map(a => a.id).join(', ')}`)); process.exitCode = 1; return }
    const res = await launchAgent({ agent: id, model: args.model, effort: args.effort, permission: args.permission, prompt: args.rest.slice(1).join(' '), resume: args.resume, crewId: args.crew })
    if (res.error) say(paint(PINK, `could not start ${id}: ${res.error}`))
    process.exitCode = res.code ?? 0
    return
  }
  if (args.cmd === 'board') { process.exitCode = await runBoard({ all: args.all, once: args.once }); return }
  if (args.cmd === 'crew') {
    const spec = parseCrew(argv.slice(1))
    if (!spec.agents.length) { say(paint(PINK, 'name at least one agent: ') + paint(SOFT, 'sush crew claude codex "fix the flaky test"')); process.exitCode = 1; return }
    const plan = planCrew(spec)
    if (args.dryRun) { say(JSON.stringify(plan, null, 2)); return }
    if (plan.kind === 'none') {
      say(paint(PINK, 'sush crew needs tmux (or Windows Terminal on Windows) to open panes side by side.'))
      say(paint(MUTED, 'Run these in separate terminals instead:'))
      for (const c of plan.panes) say('  ' + paint(SOFT, c))
      process.exitCode = 1
      return
    }
    say(paint(PINK, `  crew ${plan.crewId}`) + paint(MUTED, ` · ${spec.agents.join(', ')}${spec.board ? ' + board' : ''}`))
    process.exitCode = runCrew(plan) ?? 0
    return
  }
  if (args.cmd === 'handoff') {
    const to = args.rest[0]
    const prep = prepareHandoff({ to, from: args.from })
    if (!prep.ok) { say(paint(PINK, prep.error)); process.exitCode = 1; return }
    say(paint(PINK, `  hand-off ${agentById(prep.from).label} → ${agentById(to).label}`))
    say(paint(MUTED, `  brief saved to ${prep.file}`))
    say()
    for (const l of prep.brief.split('\n').slice(0, 14)) say('  ' + paint(SOFT, l))
    if (prep.brief.split('\n').length > 14) say(paint(MUTED, '  …'))
    say()
    if (args.dryRun) return
    const res = await launchAgent({ agent: to, model: args.model, effort: args.effort, permission: args.permission, prompt: prep.brief, handoffFrom: prep.from })
    if (res.error) say(paint(PINK, `could not start ${to}: ${res.error}`))
    process.exitCode = res.code ?? 0
    return
  }
  if (args.cmd) { say(paint(PINK, `unknown command: ${args.cmd}`)); help(); process.exitCode = 1; return }
  if (!process.stdin.isTTY || !process.stdout.isTTY) return help()
  await runInteractive({ installed: detectInstalled() })
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === (await import('node:fs')).realpathSync(process.argv[1])
if (isMain) main(process.argv.slice(2))
