// Extra built-in commands: filesystem ops, utilities, dev tools, quick queries.
import { readFile, writeFile, copyFile, rename, rm, readdir, stat, mkdir } from 'fs/promises'
import { existsSync, statSync, readFileSync } from 'fs'
import { resolve, join } from 'path'
import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { homedir } from 'os'
import { ok, err, ansi } from './_helpers'

const execFileAsync = promisify(execFile)

// ---------- cp ----------
export const cp = {
  name: 'cp',
  description: 'Copy a file',
  usage: 'cp <src> <dest>',
  async run([src, dest], ctx) {
    if (!src || !dest) return err('cp: usage: cp <src> <dest>')
    const s = resolve(ctx.cwd, src)
    const d = resolve(ctx.cwd, dest)
    if (!existsSync(s)) return err(`cp: no such file: ${src}`)
    try {
      await copyFile(s, d)
      return ok(ansi.green(`copied: ${src} → ${dest}`))
    } catch (e) {
      return err(`cp: ${e.message}`)
    }
  }
}

// ---------- mv ----------
export const mv = {
  name: 'mv',
  description: 'Move or rename a file',
  usage: 'mv <src> <dest>',
  async run([src, dest], ctx) {
    if (!src || !dest) return err('mv: usage: mv <src> <dest>')
    const s = resolve(ctx.cwd, src)
    const d = resolve(ctx.cwd, dest)
    if (!existsSync(s)) return err(`mv: no such file: ${src}`)
    try {
      await rename(s, d)
      return ok(ansi.green(`moved: ${src} → ${dest}`))
    } catch (e) {
      return err(`mv: ${e.message}`)
    }
  }
}

// ---------- rm ----------
export const rmCmd = {
  name: 'rm',
  description: 'Remove a file or directory',
  usage: 'rm <path> [-r]',
  async run(args, ctx) {
    const flags = args.filter(a => a.startsWith('-'))
    const paths = args.filter(a => !a.startsWith('-'))
    if (!paths.length) return err('rm: missing path')
    const recursive = flags.some(f => f.includes('r'))
    const results = []
    for (const p of paths) {
      const full = resolve(ctx.cwd, p)
      if (!existsSync(full)) { results.push(ansi.red(`not found: ${p}`)); continue }
      try {
        await rm(full, { recursive, force: true })
        results.push(ansi.green(`removed: ${p}`))
      } catch (e) {
        results.push(ansi.red(`${p}: ${e.message}`))
      }
    }
    return ok(results.join('\r\n'))
  }
}

// ---------- find ----------
export const findCmd = {
  name: 'find',
  description: 'Find files matching a pattern',
  usage: 'find <pattern> [dir]',
  async run([pattern, dir], ctx) {
    if (!pattern) return err('find: missing pattern')
    const root = resolve(ctx.cwd, dir ?? '.')
    if (!existsSync(root)) return err(`find: no such directory: ${dir ?? '.'}`)
    const results = []
    const regex = new RegExp(globToRegex(pattern), 'i')
    async function walk(d, depth = 0) {
      if (depth > 8) return
      try {
        const entries = await readdir(d, { withFileTypes: true })
        for (const e of entries) {
          if (e.name.startsWith('.') && e.name !== '.env') continue
          if (e.name === 'node_modules' || e.name === '.git') continue
          const full = join(d, e.name)
          if (regex.test(e.name)) results.push(full.replace(ctx.cwd + '/', '').replace(ctx.cwd + '\\', ''))
          if (e.isDirectory()) await walk(full, depth + 1)
        }
      } catch {}
    }
    await walk(root)
    if (!results.length) return ok(ansi.dim(`No files matching "${pattern}"`))
    return ok(results.slice(0, 100).map(r => ansi.cyan(r)).join('\r\n'))
  }
}

// ---------- grep ----------
export const grep = {
  name: 'grep',
  description: 'Search file contents for a pattern',
  usage: 'grep <pattern> <file>',
  async run([pattern, file], ctx) {
    if (!pattern || !file) return err('grep: usage: grep <pattern> <file>')
    const path = resolve(ctx.cwd, file)
    if (!existsSync(path)) return err(`grep: no such file: ${file}`)
    try {
      const content = await readFile(path, 'utf8')
      const regex = new RegExp(pattern, 'i')
      const highlight = new RegExp(pattern, 'gi')
      const lines = content.split('\n')
      const matches = lines
        .map((line, i) => ({ line, num: i + 1, match: regex.test(line) }))
        .filter(r => r.match)
      if (!matches.length) return ok(ansi.dim(`No matches for "${pattern}" in ${file}`))
      return ok(matches.map(r => `${ansi.dim(String(r.num).padStart(4))}: ${r.line.replace(highlight, m => ansi.pink(m))}`).join('\r\n'))
    } catch (e) {
      return err(`grep: ${e.message}`)
    }
  }
}

function globToRegex(pattern) {
  return String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
}

// ---------- diff ----------
export const diff = {
  name: 'diff',
  description: 'Show differences between two files',
  usage: 'diff <file1> <file2>',
  async run([f1, f2], ctx) {
    if (!f1 || !f2) return err('diff: usage: diff <file1> <file2>')
    const p1 = resolve(ctx.cwd, f1)
    const p2 = resolve(ctx.cwd, f2)
    if (!existsSync(p1)) return err(`diff: no such file: ${f1}`)
    if (!existsSync(p2)) return err(`diff: no such file: ${f2}`)
    const [a, b] = await Promise.all([readFile(p1, 'utf8'), readFile(p2, 'utf8')])
    const linesA = a.split('\n')
    const linesB = b.split('\n')
    const out = [`${ansi.dim('--- ' + f1)}`, `${ansi.dim('+++ ' + f2)}`]
    const maxLen = Math.max(linesA.length, linesB.length)
    let changes = 0
    for (let i = 0; i < maxLen; i++) {
      const la = linesA[i]
      const lb = linesB[i]
      if (la === lb) continue
      if (la !== undefined) out.push(ansi.red(`- ${la}`))
      if (lb !== undefined) out.push(ansi.green(`+ ${lb}`))
      changes++
      if (changes > 80) { out.push(ansi.dim('… truncated')); break }
    }
    if (changes === 0) return ok(ansi.dim('Files are identical'))
    return ok(out.join('\r\n'))
  }
}

// ---------- count ----------
export const count = {
  name: 'count',
  description: 'Count lines, words, and characters in a file',
  usage: 'count <file>',
  async run([file], ctx) {
    if (!file) return err('count: missing file')
    const path = resolve(ctx.cwd, file)
    if (!existsSync(path)) return err(`count: no such file: ${file}`)
    const content = await readFile(path, 'utf8')
    const lines = content.split('\n').length
    const words = content.trim().split(/\s+/).filter(Boolean).length
    const chars = content.length
    return ok([
      `${ansi.cyan('File  ')} ${file}`,
      `${ansi.cyan('Lines ')} ${lines}`,
      `${ansi.cyan('Words ')} ${words}`,
      `${ansi.cyan('Chars ')} ${chars}`
    ].join('\r\n'))
  }
}

// ---------- hash ----------
export const hash = {
  name: 'hash',
  description: 'Hash a string or file (md5 / sha256)',
  usage: 'hash [md5|sha256] <text or file>',
  async run([algo, ...rest], ctx) {
    let alg = algo
    let input = rest.join(' ')
    if (!['md5', 'sha256'].includes(algo)) {
      alg = 'sha256'
      input = [algo, ...rest].join(' ')
    }
    if (!input) return err('hash: missing input')
    const path = resolve(ctx.cwd, input)
    let data
    if (existsSync(path) && statSync(path).isFile()) {
      data = await readFile(path)
    } else {
      data = Buffer.from(input, 'utf8')
    }
    const digest = createHash(alg).update(data).digest('hex')
    return ok(`${ansi.dim(alg.toUpperCase() + ':')} ${ansi.cyan(digest)}`)
  }
}

// ---------- b64 ----------
export const b64 = {
  name: 'b64',
  description: 'Base64 encode or decode',
  usage: 'b64 [encode|decode] <text>',
  async run([sub, ...rest]) {
    if (sub !== 'encode' && sub !== 'decode') {
      // called as b64 <text> or b64 <multi word text>
      const raw = [sub, ...rest].filter(Boolean).join(' ')
      if (!raw) return err('b64: missing text')
      return ok(Buffer.from(raw, 'utf8').toString('base64'))
    }
    const text = rest.join(' ')
    if (!text) return err('b64: missing text')
    if (sub === 'encode') return ok(Buffer.from(text, 'utf8').toString('base64'))
    if (sub === 'decode') {
      try {
        return ok(Buffer.from(text, 'base64').toString('utf8'))
      } catch {
        return err('b64: invalid base64 input')
      }
    }
    return err('b64: usage: b64 [encode|decode] <text>')
  }
}

const MATH_FUNCTIONS = new Set(['sqrt', 'pow', 'abs', 'floor', 'ceil', 'round', 'log', 'sin', 'cos', 'tan', 'min', 'max'])
const MATH_CONSTANTS = new Map([['pi', 'Math.PI'], ['e', 'Math.E']])

function toSafeMathExpression(expr) {
  const input = String(expr ?? '').replace(/\bMath\./g, '')
  if (/[^0-9+\-*/%.,()\sA-Za-z_]/.test(input)) {
    throw new Error('unsupported character')
  }
  return input.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (name) => {
    const key = name.toLowerCase()
    if (MATH_CONSTANTS.has(key)) return MATH_CONSTANTS.get(key)
    if (MATH_FUNCTIONS.has(key)) return `Math.${key}`
    throw new Error(`unsupported token '${name}'`)
  })
}

// ---------- calc ----------
export const calc = {
  name: 'calc',
  description: 'Evaluate a math expression',
  usage: 'calc <expression>',
  aliases: ['math'],
  async run(args) {
    const expr = args.join(' ').trim()
    if (!expr) return err('calc: missing expression')
    try {
      const safe = toSafeMathExpression(expr)
      // eslint-disable-next-line no-new-func
      const result = Function('Math', `"use strict"; return (${safe})`)(Math)
      return ok(`${ansi.dim(expr + ' =')} ${ansi.pink(String(result))}`)
    } catch (e) {
      return err(`calc: cannot evaluate: ${expr}${e.message ? ` (${e.message})` : ''}`)
    }
  }
}

// ---------- timer ----------
const activeTimers = new Map()

// Bug fix: expose cleanup so tab-close events can purge stale timer entries.
export function clearTabTimer(tabId) {
  if (!tabId) return
  const id = activeTimers.get(tabId)
  if (id) { clearTimeout(id); activeTimers.delete(tabId) }
}

export const timer = {
  name: 'timer',
  description: 'Start a countdown timer',
  usage: 'timer <seconds>',
  async run([secs], ctx) {
    const n = parseInt(secs, 10)
    if (!secs || isNaN(n) || n < 1) return err('timer: usage: timer <seconds>')
    const key = ctx.tabId || 'global'
    if (activeTimers.has(key)) {
      clearTimeout(activeTimers.get(key))
      activeTimers.delete(key)
      return ok(ansi.yellow('Timer cancelled.'))
    }
    const id = setTimeout(() => {
      activeTimers.delete(key)
    }, n * 1000)
    activeTimers.set(key, id)
    return ok(ansi.green(`Timer started: ${n}s`))
  }
}

// ---------- todo ----------
function getTodoPath(cwd) {
  return join(cwd, '.sush-todo.json')
}

function loadTodos(cwd) {
  try { return JSON.parse(readFileSync(getTodoPath(cwd), 'utf8')) } catch { return [] }
}

export const todo = {
  name: 'todo',
  description: 'Manage a per-project todo list',
  usage: 'todo [add|done|del|clear|list] [text/index]',
  async run([sub, ...rest], ctx) {
    const todos = loadTodos(ctx.cwd)
    const text = rest.join(' ').trim()

    if (!sub || sub === 'list') {
      if (!todos.length) return ok(ansi.dim('No todos. Add one with: todo add <task>'))
      const lines = todos.map((t, i) =>
        `${ansi.dim(String(i + 1).padStart(2))}  ${t.done ? ansi.dim('[✓] ' + t.text) : '[ ] ' + ansi.white(t.text)}`
      )
      return ok(lines.join('\r\n'))
    }

    if (sub === 'add') {
      if (!text) return err('todo add: missing task text')
      todos.push({ text, done: false, at: Date.now() })
      await writeFile(getTodoPath(ctx.cwd), JSON.stringify(todos, null, 2))
      return ok(ansi.green(`Added: ${text}`))
    }

    const idx = parseInt(sub === 'done' || sub === 'del' ? rest[0] : sub, 10) - 1
    if (sub === 'done') {
      if (isNaN(idx) || idx < 0 || idx >= todos.length) return err('todo done: invalid index')
      todos[idx].done = true
      await writeFile(getTodoPath(ctx.cwd), JSON.stringify(todos, null, 2))
      return ok(ansi.green(`Done: ${todos[idx].text}`))
    }

    if (sub === 'del') {
      if (isNaN(idx) || idx < 0 || idx >= todos.length) return err('todo del: invalid index')
      const [removed] = todos.splice(idx, 1)
      await writeFile(getTodoPath(ctx.cwd), JSON.stringify(todos, null, 2))
      return ok(ansi.yellow(`Removed: ${removed.text}`))
    }

    if (sub === 'clear') {
      await writeFile(getTodoPath(ctx.cwd), '[]')
      return ok(ansi.yellow('All todos cleared.'))
    }

    return err('todo: usage: todo [add|done|del|clear|list] [text/index]')
  }
}

// ---------- snippet ----------
function getSnippetPath() {
  return join(homedir(), '.sush', 'snippets.json')
}

function loadSnippets() {
  try { return JSON.parse(readFileSync(getSnippetPath(), 'utf8')) } catch { return {} }
}

async function saveSnippets(snips) {
  const dir = join(homedir(), '.sush')
  await mkdir(dir, { recursive: true })
  await writeFile(getSnippetPath(), JSON.stringify(snips, null, 2))
}

export const snippet = {
  name: 'snippet',
  description: 'Save and recall command snippets',
  usage: 'snippet [set|get|del|list] [name] [value...]',
  aliases: ['snip'],
  async run([sub, name, ...rest], ctx) {
    const snips = loadSnippets()
    const value = rest.join(' ').trim()

    if (!sub || sub === 'list') {
      const keys = Object.keys(snips)
      if (!keys.length) return ok(ansi.dim('No snippets. Add with: snippet set <name> <command>'))
      return ok(keys.map(k => `${ansi.cyan(k.padEnd(20))} ${snips[k]}`).join('\r\n'))
    }

    if (sub === 'set') {
      if (!name) return err('snippet set: missing name')
      if (!value) return err('snippet set: missing command value')
      snips[name] = value
      await saveSnippets(snips)
      return ok(ansi.green(`Snippet saved: ${name} → ${value}`))
    }

    if (sub === 'get') {
      if (!name) return err('snippet get: missing name')
      if (!snips[name]) return err(`snippet: no snippet named "${name}"`)
      // Echo the expanded command so the user can see it, and trigger passthrough.
      return {
        ...ok(snips[name]),
        action: { name: 'passthrough', input: snips[name], cwd: ctx.cwd }
      }
    }

    if (sub === 'del' || sub === 'delete') {
      if (!name || !snips[name]) return err(`snippet del: no snippet named "${name}"`)
      delete snips[name]
      await saveSnippets(snips)
      return ok(ansi.yellow(`Deleted snippet: ${name}`))
    }

    return err('snippet: usage: snippet [set|get|del|list] [name] [value...]')
  }
}

// ---------- note ----------
export const note = {
  name: 'note',
  description: 'Quickly add a memory note',
  usage: 'note <text>',
  async run(args, ctx) {
    const text = args.join(' ').trim()
    if (!text) return err('note: missing text')
    const noteDir = join(ctx.cwd, '.sushmemory')
    await mkdir(noteDir, { recursive: true })
    const file = join(noteDir, 'Quick Notes.md')
    let existing = ''
    try { existing = await readFile(file, 'utf8') } catch {}
    if (!existing) existing = '# Quick Notes\n\n'
    const ts = new Date().toLocaleString()
    const appended = existing + `- ${text}  *(${ts})*\n`
    await writeFile(file, appended, 'utf8')
    return ok(ansi.green(`Note saved: ${text}`))
  }
}

// ---------- history ----------
export const historyCmd = {
  name: 'history',
  description: 'Show command history for this session',
  usage: 'history [n]',
  aliases: ['hist'],
  async run([n], ctx) {
    const max = n ? parseInt(n, 10) : 50
    const hist = (ctx.history || []).slice(-Math.max(1, max))
    if (!hist.length) return ok(ansi.dim('No history yet.'))
    const lines = hist.map((cmd, i) => `${ansi.dim(String(i + 1).padStart(4))}  ${cmd}`)
    return ok(lines.join('\r\n'))
  }
}

// ---------- alias ----------
export const alias = {
  name: 'alias',
  description: 'Set or list session command aliases',
  usage: 'alias [name=command]',
  async run(args, ctx) {
    if (!args.length) {
      const entries = Object.entries(ctx.aliases || {})
      if (!entries.length) return ok(ansi.dim('No aliases set.'))
      return ok(entries.map(([k, v]) => `${ansi.cyan(k)} = ${v}`).join('\r\n'))
    }
    const raw = args.join(' ')
    const m = raw.match(/^([a-z_][a-z0-9_-]*)=(.+)$/i)
    if (!m) return err(`alias: invalid format. Use: alias name=command`)
    ctx.aliases = ctx.aliases || {}
    ctx.aliases[m[1]] = m[2]
    return ok(ansi.green(`alias ${m[1]} = ${m[2]}`))
  }
}

export const unalias = {
  name: 'unalias',
  description: 'Remove a session alias',
  usage: 'unalias <name>',
  async run([name], ctx) {
    if (!name) return err('unalias: missing name')
    if (!ctx.aliases?.[name]) return err(`unalias: no alias "${name}"`)
    delete ctx.aliases[name]
    return ok(ansi.yellow(`Removed alias: ${name}`))
  }
}

// ---------- scripts ----------
export const scripts = {
  name: 'scripts',
  description: 'List npm/package.json scripts',
  usage: 'scripts',
  async run(_, ctx) {
    const pkgPath = resolve(ctx.cwd, 'package.json')
    if (!existsSync(pkgPath)) return err('scripts: no package.json in current directory')
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
      const s = pkg.scripts || {}
      const keys = Object.keys(s)
      if (!keys.length) return ok(ansi.dim('No scripts defined in package.json'))
      const header = ansi.bold(ansi.pink(pkg.name || 'package.json') + ' scripts')
      const rows = keys.map(k => `  ${ansi.cyan(('npm run ' + k).padEnd(28))} ${ansi.dim(s[k])}`)
      return ok([header, ansi.dim('─'.repeat(50)), ...rows].join('\r\n'))
    } catch (e) {
      return err(`scripts: ${e.message}`)
    }
  }
}

// ---------- ping ----------
export const ping = {
  name: 'ping',
  description: 'Ping a host and show latency',
  usage: 'ping <host>',
  async run([host], ctx) {
    if (!host) return err('ping: missing host')
    const safeHost = host.replace(/[^a-z0-9.\-_]/gi, '')
    if (!safeHost) return err('ping: invalid hostname')
    try {
      const args = process.platform === 'win32' ? ['-n', '4', safeHost] : ['-c', '4', safeHost]
      const { stdout, stderr } = await execFileAsync('ping', args, { encoding: 'utf8', timeout: 15000, windowsHide: true })
      return ok((stdout + stderr).trim())
    } catch (e) {
      return err(`ping: ${e.stderr || e.message}`)
    }
  }
}

// ---------- fetch ----------
export const fetchCmd = {
  name: 'fetch',
  description: 'Make an HTTP GET request',
  usage: 'fetch <url>',
  async run([url]) {
    if (!url) return err('fetch: missing URL')
    if (!/^https?:\/\//i.test(url)) return err('fetch: URL must start with http:// or https://')
    try {
      const res = await global.fetch(url, { headers: { 'User-Agent': 'Sush/1.0' }, signal: AbortSignal.timeout(10000) })
      const body = await res.text()
      const preview = body.slice(0, 2000)
      return ok([
        `${ansi.cyan('Status')} ${res.status} ${res.statusText}`,
        `${ansi.cyan('Type  ')} ${res.headers.get('content-type') || 'unknown'}`,
        ansi.dim('─'.repeat(40)),
        preview.length < body.length ? preview + ansi.dim('\n… truncated') : preview
      ].join('\r\n'))
    } catch (e) {
      return err(`fetch: ${e.message}`)
    }
  }
}

// ---------- weather ----------
export const weather = {
  name: 'weather',
  description: 'Show weather for a city',
  usage: 'weather [city]',
  async run(args) {
    const city = args.join('+') || ''
    const url = `https://wttr.in/${city}?format=3`
    try {
      const res = await global.fetch(url, { headers: { 'User-Agent': 'curl/7.0' }, signal: AbortSignal.timeout(8000) })
      const text = await res.text()
      return ok(ansi.cyan(text.trim()))
    } catch (e) {
      return err(`weather: ${e.message}`)
    }
  }
}

// ---------- time ----------
export const timeCmd = {
  name: 'time',
  description: 'Time the execution of a command',
  usage: 'time <command...>',
  async run(args, ctx) {
    if (!args.length) return err('time: missing command')
    const input = args.join(' ')
    const start = performance.now()
    // Lazy-import to avoid circular dep with registry.
    try {
      const { registry } = await import('../shell/registry.js')
      const { parseInput } = await import('../shell/parser.js')
      const parsed = parseInput(input)
      if (!parsed) return err('time: empty command')
      const cmd = registry.get(parsed.cmd)
      if (!cmd) return err(`time: command not found: ${parsed.cmd}`)
      const result = await cmd.run(parsed.args, ctx)
      const ms = (performance.now() - start).toFixed(1)
      return {
        ...result,
        output: (result?.output || '') + `\r\n${ansi.dim('──')} ${ansi.cyan(ms + 'ms')}`
      }
    } catch (e) {
      const ms = (performance.now() - start).toFixed(1)
      return { ...err(e.message), output: err(e.message).output + `\r\n${ansi.dim(ms + 'ms')}` }
    }
  }
}

// ---------- ask ----------
export const ask = {
  name: 'ask',
  description: 'Open Seducia with a question',
  usage: 'ask <question...>',
  async run(args) {
    const question = args.join(' ').trim()
    return {
      ...ok(question ? `Asking Seducia: "${question}"` : 'Opening Seducia…'),
      action: { name: 'open-seducia', question }
    }
  }
}

// ---------- zen ----------
export const zen = {
  name: 'zen',
  description: 'Toggle zen mode (hide all panels)',
  usage: 'zen',
  async run() {
    return { ...ok('Toggling zen mode'), action: { name: 'toggle-zen' } }
  }
}

// ---------- palette ----------
export const palette = {
  name: 'palette',
  description: 'Open the command palette',
  usage: 'palette',
  async run() {
    return { ...ok('Opening command palette'), action: { name: 'open-palette' } }
  }
}

// ---------- shortcuts ----------
export const shortcuts = {
  name: 'shortcuts',
  description: 'Show keyboard shortcuts reference',
  usage: 'shortcuts',
  async run() {
    return { ...ok('Keyboard shortcuts'), action: { name: 'open-shortcuts' } }
  }
}

// ---------- reload ----------
export const reload = {
  name: 'reload',
  description: 'Reload the Sush app',
  usage: 'reload',
  async run() {
    return { ...ok('Reloading…'), action: { name: 'reload-app' } }
  }
}

// ---------- duplicate ----------
export const duplicate = {
  name: 'duplicate',
  description: 'Duplicate the active terminal session',
  usage: 'duplicate',
  aliases: ['dup'],
  async run(_, ctx) {
    return {
      ...ok('Duplicating session…'),
      action: { name: 'duplicate-tab', cwd: ctx.cwd }
    }
  }
}

// ---------- session-info ----------
export const sessionInfo = {
  name: 'session-info',
  description: 'Show info about the current session',
  usage: 'session-info',
  aliases: ['sinfo'],
  async run(_, ctx) {
    const uptime = Math.floor(process.uptime())
    const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024)
    const lines = [
      ansi.bold(ansi.pink('Session Info')),
      ansi.dim('─'.repeat(36)),
      `${ansi.cyan('Tab ID  ')} ${ctx.tabId || 'n/a'}`,
      `${ansi.cyan('CWD     ')} ${ctx.cwd || homedir()}`,
      `${ansi.cyan('Aliases ')} ${Object.keys(ctx.aliases || {}).length}`,
      `${ansi.cyan('History ')} ${(ctx.history || []).length} commands`,
      ansi.dim('─'.repeat(36)),
      `${ansi.cyan('App uptime')} ${uptime}s`,
      `${ansi.cyan('Memory    ')} ${memMB} MB (main process)`
    ]
    return ok(lines.join('\r\n'))
  }
}

// ---------- handoff ----------
export const handoff = {
  name: 'handoff',
  description: 'Hand off this session to another',
  usage: 'handoff',
  async run() {
    return { ...ok('Opening handoff…'), action: { name: 'handoff' } }
  }
}
