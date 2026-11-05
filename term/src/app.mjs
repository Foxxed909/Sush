import { launchAgent } from './launch.mjs'
import { homedir } from 'node:os'
import { basename } from 'node:path'
import { ACCENT, MUTED, logoLines, logoWidth } from './logo.mjs'
import { bold, center, dim, fg, padEnd, paint, reset, screen, truncate, width } from './ansi.mjs'
import { AGENTS, agentById, commandFor, effortLabel, effortsFor, modelLabel, modelsFor, permissionLabel, permissionsFor } from './agents.mjs'
import { loadState, saveState } from './state.mjs'

export const TAGLINE = 'quietly in your terminal'
const BORDER = '#5a3a4f'
const BORDER_LIT = '#ff6b9d'
const TEXT = '#f5eef3'
const SOFT = '#c9b3c2'

const INSTALL = {
  claude: 'npm i -g @anthropic-ai/claude-code',
  codex: 'npm i -g @openai/codex',
  gemini: 'npm i -g @google/gemini-cli',
  opencode: 'npm i -g opencode-ai'
}

// Join items with a separator, dropping from the end until it fits.
function fitJoin(items, sep, cols) {
  let list = items.slice()
  while (list.length > 1 && width(list.join(sep)) > cols - 2) list = list.slice(0, -1)
  return list.join(sep)
}

function shortPath(p) {
  const h = homedir()
  return p && p.startsWith(h) ? '~' + p.slice(h.length) : (p || '')
}

// Pure: the whole screen as a string, given state and terminal size.
export function render(st, cols = 80, rows = 24) {
  const out = []
  const big = cols >= 64 && rows >= 26
  const logo = logoLines({ big })
  const boxW = Math.max(30, Math.min(cols - 4, 76))
  const pad = ' '.repeat(Math.max(0, Math.floor((cols - boxW) / 2)))
  const agent = agentById(st.agent) || AGENTS[0]
  const installed = st.installed?.[agent.id]?.installed !== false
  const model = modelLabel(agent.id, st.models?.[agent.id]) + (st.efforts?.[agent.id] ? ` · ${effortLabel(st.efforts[agent.id])}` : '') + (st.permissions?.[agent.id] ? ` · ${permissionLabel(st.permissions[agent.id])}` : '')

  const body = []
  for (const l of logo) body.push(center(l, cols))
  body.push('')
  body.push(center(paint(MUTED, TAGLINE), cols))
  body.push('')

  // Prompt box.
  const lit = st.focus !== false
  const b = c => paint(lit ? BORDER_LIT : BORDER, c)
  const inner = boxW - 4
  const placeholder = installed ? 'Ask anything, or press tab to switch agents' : `${agent.label} is not installed`
  const text = st.input ? paint(TEXT, truncate(st.input, inner - 2)) + (lit ? paint(ACCENT, '▏') : '') : paint('#6f5a68', placeholder)
  const status = `${paint(agent.colour, agent.glyph)} ${paint(TEXT, bold(agent.label))} ${paint(MUTED, '·')} ${paint(SOFT, model)}`
  const where = paint(MUTED, truncate(shortPath(st.cwd), Math.max(8, inner - width(status) - 2)))
  body.push(pad + b('╭' + '─'.repeat(boxW - 2) + '╮'))
  body.push(pad + b('│') + ' ' + paint(ACCENT, '›') + ' ' + padEnd(text, inner - 2) + ' ' + b('│'))
  body.push(pad + b('│') + ' '.repeat(boxW - 2) + b('│'))
  body.push(pad + b('│') + ' ' + padEnd(status, inner - width(where)) + where + ' ' + b('│'))
  body.push(pad + b('╰' + '─'.repeat(boxW - 2) + '╯'))

  if (!installed) body.push(center(paint(MUTED, 'install: ') + paint(SOFT, truncate(INSTALL[agent.id] || agent.bin, cols - 12)), cols))
  else body.push('')

  // Overlay: model list, agent list or help, under the box.
  if (st.overlay === 'models') {
    const list = modelsFor(agent.id)
    const start = Math.max(0, Math.min(st.cursor - 3, list.length - 7))
    body.push(pad + paint(MUTED, ` ${agent.label} models`) )
    list.slice(start, start + 7).forEach((m, i) => {
      const idx = start + i
      const on = idx === st.cursor
      const chosen = (m.value || null) === (st.models?.[agent.id] || null)
      const badge = m.badge ? ' ' + paint(m.badge === 'Free' ? '#5fd3a8' : m.badge === 'New' ? ACCENT : '#82aaff', m.badge) : ''
      const line = `${on ? paint(ACCENT, '▸') : ' '} ${chosen ? paint(ACCENT, '●') : paint(MUTED, '○')} ${on ? paint(TEXT, bold(m.label)) : paint(SOFT, m.label)}${badge}  ${paint(MUTED, truncate(m.note, Math.max(0, boxW - width(m.label) - 14)))}`
      body.push(pad + line)
    })
  } else if (st.overlay === 'help') {
    const rowsHelp = [
      ['enter', 'start the agent (with your prompt, if any)'], ['tab / shift+tab', 'next / previous agent'],
      ['ctrl+t', 'choose a model'], ['ctrl+e', 'cycle effort / reasoning'], ['ctrl+p', 'cycle permissions (ask · plan · edits · auto · full)'], ['ctrl+r', 'resume the last conversation here'],
      ['↑ / ↓', 'prompt history'], ['ctrl+u', 'clear the line'], ['esc', 'close this'], ['ctrl+c', 'quit']
    ]
    for (const [k, v] of rowsHelp) body.push(pad + ' ' + paint(ACCENT, padEnd(k, 16)) + paint(SOFT, v))
  } else {
    const agentsItems = AGENTS.map(a => {
      const on = a.id === agent.id
      const ok = st.installed?.[a.id]?.installed !== false
      const label = `${a.glyph} ${a.label}`
      return on ? paint(a.colour, bold(label)) : paint(ok ? SOFT : '#5c4b56', label)
    })
    // Narrow terminals: just the current agent's neighbours, current first.
    const ai = AGENTS.findIndex(a => a.id === agent.id)
    const ordered = [...agentsItems.slice(ai), ...agentsItems.slice(0, ai)]
    body.push(center(width(agentsItems.join('   ')) <= cols - 2 ? agentsItems.join(paint(MUTED, '   ')) : fitJoin(ordered, paint(MUTED, '   '), cols), cols))
    body.push('')
    const hint = (k, v) => paint(TEXT, k) + ' ' + paint(MUTED, v)
    body.push(center(fitJoin([hint('tab', 'agent'), hint('ctrl+t', 'model'), hint('ctrl+e', 'effort'), hint('?', 'help'), hint('ctrl+r', 'resume'), hint('ctrl+c', 'quit')], paint(MUTED, '   '), cols), cols))
  }
  if (st.toast) { body.push(''); body.push(center(paint(ACCENT, '● ') + paint(SOFT, truncate(st.toast, cols - 4)), cols)) }

  const top = Math.max(0, Math.floor((rows - body.length) / 2) - 1)
  for (let i = 0; i < top; i++) out.push('')
  out.push(...body)
  // A faint pink baseline, like the app's toolbar hairline.
  while (out.length < rows - 1) out.push('')
  out.push(center(paint('#3a2433', '─'.repeat(Math.min(cols - 8, 60))), cols))
  return out.slice(0, rows).join('\n')
}

function draw(st) {
  const cols = process.stdout.columns || 80
  const rows = process.stdout.rows || 24
  process.stdout.write(screen.home + screen.clear + render(st, cols, rows) + reset)
}

// Key handling (pure state transitions; returns an action or null).
export function reduce(st, key) {
  const agentIdx = AGENTS.findIndex(a => a.id === st.agent)
  if (st.overlay === 'models') {
    const list = modelsFor(st.agent)
    if (key === 'up') return { ...st, cursor: Math.max(0, st.cursor - 1) }
    if (key === 'down') return { ...st, cursor: Math.min(list.length - 1, st.cursor + 1) }
    if (key === 'enter') {
      const m = list[st.cursor]
      return { ...st, overlay: null, models: { ...st.models, [st.agent]: m?.value || null }, toast: `${m?.label || 'Default'} for ${agentById(st.agent).label}` }
    }
    if (key === 'esc' || key === 'ctrl+t') return { ...st, overlay: null }
    return st
  }
  if (st.overlay === 'help') return (key === 'esc' || key === '?' || key === 'enter') ? { ...st, overlay: null } : st
  switch (key) {
    case 'tab': return { ...st, agent: AGENTS[(agentIdx + 1) % AGENTS.length].id, toast: '' }
    case 'shift+tab': return { ...st, agent: AGENTS[(agentIdx - 1 + AGENTS.length) % AGENTS.length].id, toast: '' }
    case 'ctrl+t': {
      const list = modelsFor(st.agent)
      const cur = Math.max(0, list.findIndex(m => (m.value || null) === (st.models?.[st.agent] || null)))
      return { ...st, overlay: 'models', cursor: cur }
    }
    case 'ctrl+e': {
      const levels = effortsFor(st.agent)
      if (!levels.length) return { ...st, toast: `${agentById(st.agent).label} has no effort setting` }
      const cur = levels.indexOf(st.efforts?.[st.agent] || '')
      const next = levels[(cur + 1) % levels.length]
      return { ...st, efforts: { ...st.efforts, [st.agent]: next || null }, toast: `Effort: ${effortLabel(next)}` }
    }
    case 'ctrl+p': {
      const modes = permissionsFor(st.agent)
      if (modes.length < 2) return { ...st, toast: `${agentById(st.agent).label} has no permission modes` }
      const cur = modes.indexOf(st.permissions?.[st.agent] || '')
      const next = modes[(cur + 1) % modes.length]
      return { ...st, permissions: { ...st.permissions, [st.agent]: next || null }, toast: `Permissions: ${permissionLabel(next)}${next === 'full' ? ' (no prompts, no sandbox)' : ''}` }
    }
    case 'backspace': return { ...st, input: st.input.slice(0, -1), histIdx: -1 }
    case 'ctrl+u': return { ...st, input: '', histIdx: -1 }
    case 'ctrl+w': return { ...st, input: st.input.replace(/\S+\s*$/, ''), histIdx: -1 }
    case 'up': {
      const h = st.history || []
      if (!h.length) return st
      const i = Math.min(h.length - 1, (st.histIdx ?? -1) + 1)
      return { ...st, histIdx: i, input: h[h.length - 1 - i] }
    }
    case 'down': {
      const h = st.history || []
      const i = (st.histIdx ?? -1) - 1
      return i < 0 ? { ...st, histIdx: -1, input: '' } : { ...st, histIdx: i, input: h[h.length - 1 - i] }
    }
    case '?': return st.input ? { ...st, input: st.input + '?' } : { ...st, overlay: 'help' }
    case 'esc': return { ...st, toast: '' }
    default:
      if (key.length >= 1 && !key.startsWith('ctrl+') && !['enter', 'ctrl+r', 'quit'].includes(key)) {
        return { ...st, input: st.input + key, histIdx: -1 }
      }
      return st
  }
}

export function keyName(data) {
  const map = {
    '\r': 'enter', '\n': 'enter', '\t': 'tab', '\x1b[Z': 'shift+tab', '\x7f': 'backspace', '\b': 'backspace',
    '\x1b[A': 'up', '\x1b[B': 'down', '\x1bOA': 'up', '\x1bOB': 'down', '\x1b': 'esc',
    '\x03': 'quit', '\x04': 'quit', '\x14': 'ctrl+t', '\x05': 'ctrl+e', '\x10': 'ctrl+p', '\x12': 'ctrl+r', '\x15': 'ctrl+u', '\x17': 'ctrl+w', '\x0c': 'ctrl+l'
  }
  if (map[data]) return map[data]
  if (data.startsWith('\x1b')) return null
  // Pasted text: keep printable characters, flatten newlines.
  const text = data.replace(/[\r\n]+/g, ' ').replace(/[\x00-\x1f\x7f]/g, '')
  return text || null
}

export async function runInteractive({ installed, cwd = process.cwd() } = {}) {
  const saved = loadState()
  let st = {
    agent: saved.agent && agentById(saved.agent) ? saved.agent : (AGENTS.find(a => installed?.[a.id]?.installed)?.id || 'claude'),
    models: saved.models || {},
    efforts: saved.efforts || {},
    permissions: saved.permissions || {},
    history: saved.history || [],
    histIdx: -1, input: '', overlay: null, cursor: 0, toast: '', cwd, installed
  }
  const stdin = process.stdin
  const enter = () => {
    process.stdout.write(screen.alt + screen.hide)
    if (stdin.isTTY) stdin.setRawMode(true)
    stdin.resume()
    draw(st)
  }
  const leave = () => {
    if (stdin.isTTY) stdin.setRawMode(false)
    stdin.pause()
    process.stdout.write(reset + screen.show + screen.main)
  }
  const persist = () => saveState({ agent: st.agent, models: st.models, efforts: st.efforts, permissions: st.permissions, history: st.history.slice(-50) })
  const onResize = () => draw(st)

  return new Promise(resolve => {
    const quit = () => {
      stdin.off('data', onData)
      process.stdout.off('resize', onResize)
      persist()
      leave()
      resolve(0)
    }
    const launch = (resume) => {
      const agent = agentById(st.agent)
      if (installed?.[agent.id]?.installed === false) {
        st = { ...st, toast: `${agent.label} is not installed. ${INSTALL[agent.id]}` }
        draw(st)
        return
      }
      const prompt = resume ? '' : st.input.trim()
      const argv = commandFor(agent.id, { model: st.models[agent.id], prompt, resume, effort: st.efforts?.[agent.id], permission: st.permissions?.[agent.id] })
      if (prompt) st.history = [...st.history.filter(h => h !== prompt), prompt]
      persist()
      stdin.off('data', onData)
      leave()
      process.stdout.write(paint(ACCENT, '\n  sush ') + paint(MUTED, '› ') + paint(SOFT, argv.map(a => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')) + reset + '\n\n')
      const started = Date.now()
      launchAgent({ agent: agent.id, model: st.models[agent.id], effort: st.efforts?.[agent.id], permission: st.permissions?.[agent.id], prompt, resume, cwd: st.cwd }).then(({ code, error }) => {
        const secs = Math.round((Date.now() - started) / 1000)
        const took = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`
        st = { ...st, input: '', histIdx: -1, toast: error ? `Could not start ${agent.label}: ${error}` : `${agent.label} ${code === 0 || code == null ? 'finished' : `exited (${code})`} · ${took}` }
        stdin.on('data', onData)
        enter()
      })
    }
    const onData = (buf) => {
      const key = keyName(buf.toString('utf8'))
      if (!key) return
      if (key === 'quit') { if (st.input) { st = { ...st, input: '' }; draw(st); return } return quit() }
      if (key === 'ctrl+l') return draw(st)
      if (key === 'enter' && !st.overlay) return launch(false)
      if (key === 'ctrl+r' && !st.overlay) return launch(true)
      st = reduce(st, key)
      draw(st)
    }
    process.stdout.on('resize', onResize)
    stdin.on('data', onData)
    enter()
  })
}

export { basename }
