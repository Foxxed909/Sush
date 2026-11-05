#!/usr/bin/env node
// Sush Terminal: Sush, quietly in your terminal.
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { logoLines } from '../src/logo.mjs'
import { paint, reset, bold } from '../src/ansi.mjs'
import { AGENTS, agentById, commandFor, detectInstalled, modelsFor } from '../src/agents.mjs'
import { TAGLINE, runInteractive } from '../src/app.mjs'

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
    ['   --resume', 'continue the last conversation in this folder'],
    ['sush agents', 'which agent CLIs are installed'],
    ['sush models [agent]', 'the model catalog'],
    ['sush logo', 'print the wordmark'],
    ['sush --version', 'version']
  ]
  for (const [k, v] of rows) say('  ' + paint(SOFT, k.padEnd(28)) + paint(MUTED, v))
}

export function parseArgs(argv) {
  const out = { cmd: argv[0] || null, rest: [], model: null, resume: false, help: false, version: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--model' || a === '-m') { out.model = argv[++i] || null; continue }
    if (a === '--resume' || a === '-c') { out.resume = true; continue }
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
      say(`  ${paint(a.colour, a.glyph)} ${bold(a.label)}`)
      for (const m of modelsFor(id)) say(`    ${paint(SOFT, (m.value || '(default)').padEnd(38))} ${m.label}${m.badge ? ' ' + paint(m.badge === 'Free' ? '#5fd3a8' : PINK, m.badge) : ''}`)
    }
    return
  }
  if (args.cmd === 'run') {
    const id = args.rest[0]
    const argvRun = commandFor(id, { model: args.model, prompt: args.rest.slice(1).join(' '), resume: args.resume })
    if (!argvRun) { say(paint(PINK, `unknown agent: ${id || '(none)'}`) + paint(MUTED, `  try: ${AGENTS.map(a => a.id).join(', ')}`)); process.exitCode = 1; return }
    const child = spawn(argvRun[0], argvRun.slice(1), { stdio: 'inherit', shell: process.platform === 'win32' })
    child.on('exit', code => { process.exitCode = code ?? 0 })
    child.on('error', e => { say(paint(PINK, `could not start ${id}: ${e.message}`)); process.exitCode = 1 })
    return
  }
  if (args.cmd) { say(paint(PINK, `unknown command: ${args.cmd}`)); help(); process.exitCode = 1; return }
  if (!process.stdin.isTTY || !process.stdout.isTTY) return help()
  await runInteractive({ installed: detectInstalled() })
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === (await import('node:fs')).realpathSync(process.argv[1])
if (isMain) main(process.argv.slice(2))
