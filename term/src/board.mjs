import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { ACCENT, MUTED, logoLines } from './logo.mjs'
import { bold, center, padEnd, paint, reset, screen, truncate, width } from './ansi.mjs'
import { AGENTS, agentById, modelLabel } from './agents.mjs'
import { listTerminal, readDesktop } from './crew.mjs'
import { sessionInsight } from './transcripts.mjs'
import { notify } from './notify.mjs'
import { usageRunway, runwayLabel } from '../../src/renderer/src/lib/usageRunway.mjs'

// The live board: every agent in this folder (or everywhere, with --all),
// from the terminal registry and the desktop app, with a pilot light each.

const TONE = {
  working: { colour: ACCENT, label: 'Working' },
  waiting: { colour: '#ffcb6b', label: 'Needs you' },
  idle: { colour: '#8f8396', label: 'Idle' },
  running: { colour: '#c9b3c2', label: 'Running' },
  done: { colour: '#5fd3a8', label: 'Done' },
  error: { colour: '#ff6b81', label: 'Stopped' },
  limit: { colour: '#ff9f43', label: 'Limit' }
}
const DESKTOP_STATE = { waiting: 'waiting', working: 'working', booting: 'working', idle: 'idle', done: 'done', error: 'error' }

const shortPath = p => {
  const h = homedir()
  return p && p.startsWith(h) ? '~' + p.slice(h.length) : (p || '')
}
const ago = (t, now) => {
  const s = Math.max(0, Math.round((now - t) / 1000))
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`
}

// Gather rows (pure-ish: inputs injectable for tests).
export function gather({ cwd = process.cwd(), all = false, now = Date.now(), terminal = listTerminal(), desktop = readDesktop(), insight = sessionInsight } = {}) {
  const here = resolve(cwd)
  const inFolder = p => all || (p && (resolve(p) === here || resolve(p).startsWith(here + '/') || resolve(p).startsWith(here + '\\')))
  const rows = []
  for (const r of terminal) {
    if (!inFolder(r.cwd)) continue
    let state = r.endedAt ? 'done' : 'running'
    let last = ''
    if (!r.endedAt && (r.agent === 'claude' || r.agent === 'codex')) {
      const info = insight(r.agent, r.cwd, { since: (r.startedAt || 0) - 60e3, now })
      if (info) { state = info.state; last = info.lastText }
    }
    rows.push({ id: r.id, source: 'terminal', agent: r.agent, label: r.label || agentById(r.agent)?.label || r.agent, model: r.model, cwd: r.cwd, state, last, since: r.startedAt, ended: !!r.endedAt })
  }
  for (const s of desktop?.sessions || []) {
    if (!inFolder(s.cwd)) continue
    rows.push({ id: `d:${s.id}`, source: 'desktop', agent: s.agentId || 'shell', label: s.label || 'Session', model: s.model, cwd: s.cwd, state: s.limited ? 'limit' : (DESKTOP_STATE[s.state] || 'idle'), last: s.last || '', since: s.startedAt || now, ended: false })
  }
  const order = { waiting: 0, limit: 1, error: 2, working: 3, running: 4, idle: 5, done: 6 }
  rows.sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9) || (b.since || 0) - (a.since || 0))
  // Usage runway from the desktop app's samples.
  const usage = (desktop?.usage || []).map(u => {
    const runway = Number.isFinite(u.pct) && u.pct < (u.guardPct ?? 80) ? usageRunway(u.samples || [], u.guardPct ?? 80, { now }) : null
    return { ...u, runway }
  })
  return { rows, usage, desktopOn: !!desktop }
}

export function renderBoard({ rows, usage, desktopOn }, { cols = 100, rows: height = 30, cwd = process.cwd(), all = false, frame = 0, now = Date.now() } = {}) {
  const out = []
  const logo = logoLines()
  out.push('')
  out.push('  ' + logo[0])
  out.push('  ' + logo[1] + '   ' + paint(ACCENT, bold('board')) + '  ' + paint(MUTED, all ? 'every folder' : shortPath(cwd)))
  out.push('  ' + logo[2])
  out.push('')
  const counts = ['waiting', 'working', 'idle', 'done'].map(k => [k, rows.filter(r => r.state === k).length]).filter(([, n]) => n)
  out.push('  ' + counts.map(([k, n]) => paint(TONE[k].colour, `● ${n} ${TONE[k].label.toLowerCase()}`)).join(paint(MUTED, '   ')) + (desktopOn ? paint(MUTED, '   · desktop app connected') : paint(MUTED, '   · desktop app not running')))
  out.push('')
  if (!rows.length) {
    out.push(paint(MUTED, '  No agents here yet. Start one with ') + paint(ACCENT, 'sush') + paint(MUTED, ', or a crew with ') + paint(ACCENT, 'sush crew claude codex "…"'))
  }
  const w = { pilot: 3, agent: 16, state: 11, model: 22, age: 6 }
  for (const r of rows.slice(0, Math.max(3, height - 12))) {
    const tone = TONE[r.state] || TONE.idle
    // Pilot light: working breathes between two pinks (frame-driven).
    const pilotColour = r.state === 'working' ? (frame % 2 ? '#ffb3d0' : ACCENT) : tone.colour
    const a = agentById(r.agent)
    const name = `${a ? paint(a.colour, a.glyph) : ' '} ${paint('#f5eef3', truncate(r.label, w.agent - 2))}`
    const model = r.model ? modelLabel(r.agent, r.model) : ''
    const line = '  ' + paint(pilotColour, '▌') + ' ' + padEnd(name, w.agent) + ' ' +
      padEnd(paint(tone.colour, tone.label), w.state) + ' ' +
      padEnd(paint('#c9b3c2', truncate(model, w.model - 1)), w.model) + ' ' +
      padEnd(paint(MUTED, ago(r.since || now, now)), w.age) +
      paint(MUTED, r.source === 'desktop' ? 'app ' : 'term') +
      (all ? '  ' + paint(MUTED, truncate(shortPath(r.cwd), 28)) : '')
    out.push(line)
    if (r.last && cols > 70) out.push('      ' + paint('#8f8396', truncate(r.last.replace(/\s+/g, ' '), cols - 10)))
  }
  // Usage + hand-off before the limit.
  const soon = usage.filter(u => u.runway != null && u.runway <= 15)
  if (usage.length) {
    out.push('')
    for (const u of usage) {
      const bar = Math.max(0, Math.min(20, Math.round((u.pct || 0) / 5)))
      const guardAt = Math.round((u.guardPct ?? 80) / 5)
      const meter = Array.from({ length: 20 }, (_, i) => (i === guardAt ? paint('#ffcb6b', '┃') : i < bar ? paint(ACCENT, '█') : paint('#3a2433', '░'))).join('')
      out.push(`  ${paint('#c9b3c2', padEnd(`${u.providerLabel || u.provider} · ${u.label}`, 26))} ${meter} ${paint('#f5eef3', `${u.pct ?? '—'}%`)}  ${u.runway != null ? paint(u.runway <= 15 ? '#ffcb6b' : MUTED, `at this pace ${runwayLabel(u.runway, u.guardPct ?? 80)}`) : ''}`)
    }
  }
  for (const u of soon) {
    const other = AGENTS.find(a => a.id !== u.provider)?.id || 'codex'
    out.push('')
    out.push('  ' + paint('#ffcb6b', '◆ ') + paint('#f5eef3', `${u.label} reaches ${u.guardPct ?? 80}% in ~${u.runway} min.`) + paint(MUTED, ' Hand off before it does: ') + paint(ACCENT, `sush handoff ${other}`))
  }
  while (out.length < height - 1) out.push('')
  out.push(paint(MUTED, '  q quit   a ' + (all ? 'this folder' : 'all folders') + '   r refresh'))
  return out.slice(0, height).map(l => truncateLine(l, cols)).join('\n')
}
function truncateLine(l, cols) { return width(l) <= cols ? l : truncate(l, cols) }

// Notification rules: tell the user once when something starts needing them.
export function transitions(prev, rows) {
  const alerts = []
  for (const r of rows) {
    const before = prev.get(r.id)
    if (before && before !== r.state && (r.state === 'waiting' || r.state === 'limit' || r.state === 'error')) alerts.push(r)
    if (before && before === 'working' && r.state === 'done') alerts.push(r)
  }
  return alerts
}

export async function runBoard({ all = false, cwd = process.cwd(), once = false } = {}) {
  let showAll = all
  let frame = 0
  const prev = new Map()
  const notifiedUsage = new Set()
  const draw = () => {
    const data = gather({ cwd, all: showAll })
    for (const r of transitions(prev, data.rows)) {
      const what = r.state === 'waiting' ? 'needs you' : r.state === 'done' ? 'finished' : r.state === 'limit' ? 'hit a limit' : 'stopped'
      notify('Sush', `${r.label} ${what}`)
    }
    for (const u of data.usage) {
      if (u.runway != null && u.runway <= 15 && !notifiedUsage.has(u.label)) { notifiedUsage.add(u.label); notify('Sush', `${u.label} reaches ${u.guardPct ?? 80}% in ~${u.runway} min`) }
    }
    prev.clear(); for (const r of data.rows) prev.set(r.id, r.state)
    const text = renderBoard(data, { cols: process.stdout.columns || 100, rows: process.stdout.rows || 30, cwd, all: showAll, frame: frame++ })
    process.stdout.write(screen.home + screen.clear + text + reset)
  }
  if (once || !process.stdout.isTTY) {
    const data = gather({ cwd, all: showAll })
    process.stdout.write(renderBoard(data, { cols: process.stdout.columns || 100, rows: Math.max(12, data.rows.length * 2 + 14), cwd, all: showAll }) + reset + '\n')
    return 0
  }
  return new Promise(res => {
    process.stdout.write(screen.alt + screen.hide)
    const stdin = process.stdin
    if (stdin.isTTY) stdin.setRawMode(true)
    stdin.resume()
    draw()
    const timer = setInterval(draw, 1200)
    const onResize = () => draw()
    process.stdout.on('resize', onResize)
    const quit = () => {
      clearInterval(timer)
      process.stdout.off('resize', onResize)
      stdin.off('data', onKey)
      if (stdin.isTTY) stdin.setRawMode(false)
      stdin.pause()
      process.stdout.write(reset + screen.show + screen.main)
      res(0)
    }
    const onKey = (buf) => {
      const k = buf.toString()
      if (k === 'q' || k === '\x03' || k === '\x1b') return quit()
      if (k === 'a') { showAll = !showAll; draw() }
      if (k === 'r') draw()
    }
    stdin.on('data', onKey)
  })
}

export { center }
