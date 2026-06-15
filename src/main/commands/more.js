// More built-ins (v3.1) - developer utilities that round out the Sush toolkit.
// Each command follows the same contract as the rest of the registry:
//   run(args, ctx) -> { output, type } | { ...ok, action }
import { readFile } from 'fs/promises'
import { existsSync, statSync, readdirSync } from 'fs'
import { resolve, join, basename } from 'path'
import { randomUUID, randomInt } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { networkInterfaces } from 'os'
import { ok, err, ansi } from './_helpers'

const execFileAsync = promisify(execFile)

// ---------- uuid ----------
export const uuid = {
  name: 'uuid',
  description: 'Generate one or more random UUIDs (v4)',
  usage: 'uuid [count]',
  aliases: ['guid'],
  async run([count]) {
    const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 100)
    const ids = Array.from({ length: n }, () => ansi.cyan(randomUUID()))
    return ok(ids.join('\r\n'))
  }
}

// ---------- genpass ----------
const PASS_CHARS = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+'
export const genpass = {
  name: 'genpass',
  description: 'Generate a cryptographically strong random password',
  usage: 'genpass [length]',
  aliases: ['pw', 'pass'],
  async run([length]) {
    const len = Math.min(Math.max(parseInt(length, 10) || 20, 6), 256)
    let out = ''
    for (let i = 0; i < len; i++) out += PASS_CHARS[randomInt(PASS_CHARS.length)]
    return ok(`${ansi.pink(out)}  ${ansi.dim(`(${len} chars)`)}`)
  }
}

// ---------- head ----------
export const head = {
  name: 'head',
  description: 'Show the first N lines of a file (default 10)',
  usage: 'head <file> [n]',
  async run([file, n], ctx) {
    if (!file) return err('head: missing file')
    const path = resolve(ctx.cwd, file)
    if (!existsSync(path)) return err(`head: no such file: ${file}`)
    try {
      const count = Math.max(parseInt(n, 10) || 10, 1)
      const lines = (await readFile(path, 'utf8')).split('\n')
      return ok(lines.slice(0, count).join('\r\n') || ansi.dim('(empty)'))
    } catch (e) {
      return err(`head: ${e.message}`)
    }
  }
}

// ---------- tail ----------
export const tail = {
  name: 'tail',
  description: 'Show the last N lines of a file (default 10)',
  usage: 'tail <file> [n]',
  async run([file, n], ctx) {
    if (!file) return err('tail: missing file')
    const path = resolve(ctx.cwd, file)
    if (!existsSync(path)) return err(`tail: no such file: ${file}`)
    try {
      const count = Math.max(parseInt(n, 10) || 10, 1)
      const lines = (await readFile(path, 'utf8')).replace(/\n$/, '').split('\n')
      return ok(lines.slice(-count).join('\r\n') || ansi.dim('(empty)'))
    } catch (e) {
      return err(`tail: ${e.message}`)
    }
  }
}

// ---------- tree ----------
const TREE_SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'out', '.cache'])
export const tree = {
  name: 'tree',
  description: 'Print a directory tree (skips node_modules/.git)',
  usage: 'tree [dir] [depth]',
  async run([dir, depth], ctx) {
    const root = resolve(ctx.cwd, dir ?? '.')
    if (!existsSync(root)) return err(`tree: no such directory: ${dir ?? '.'}`)
    const maxDepth = Math.min(Math.max(parseInt(depth, 10) || 3, 1), 8)
    const lines = [ansi.cyan(basename(root) || root)]
    let count = 0

    const walk = (current, prefix, level) => {
      if (level > maxDepth || count > 1000) return
      let entries
      try {
        entries = readdirSync(current, { withFileTypes: true })
          .filter(e => !TREE_SKIP.has(e.name) && !e.name.startsWith('.'))
          .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1))
      } catch { return }

      entries.forEach((e, i) => {
        if (count++ > 1000) return
        const last = i === entries.length - 1
        const branch = last ? '`-- ' : '|-- '
        const name = e.isDirectory() ? ansi.cyan(e.name + '/') : e.name
        lines.push(`${prefix}${ansi.dim(branch)}${name}`)
        if (e.isDirectory()) walk(join(current, e.name), prefix + (last ? '    ' : ansi.dim('|   ')), level + 1)
      })
    }

    walk(root, '', 1)
    if (count > 1000) lines.push(ansi.dim('... truncated (1000+ entries)'))
    return ok(lines.join('\r\n'))
  }
}

// ---------- now ----------
export const now = {
  name: 'now',
  description: 'Show the current date/time, or convert a Unix timestamp',
  usage: 'now [epoch]',
  aliases: ['date'],
  async run([epoch]) {
    if (epoch != null && /^\d+$/.test(String(epoch))) {
      // Treat <=11-digit values as seconds, longer as milliseconds.
      const raw = Number(epoch)
      const ms = String(epoch).length <= 11 ? raw * 1000 : raw
      const d = new Date(ms)
      if (Number.isNaN(d.getTime())) return err('now: invalid timestamp')
      return ok([
        `${ansi.cyan('Local ')} ${d.toLocaleString()}`,
        `${ansi.cyan('UTC   ')} ${d.toUTCString()}`,
        `${ansi.cyan('ISO   ')} ${d.toISOString()}`
      ].join('\r\n'))
    }
    const d = new Date()
    return ok([
      `${ansi.cyan('Local ')} ${d.toLocaleString()}`,
      `${ansi.cyan('UTC   ')} ${d.toUTCString()}`,
      `${ansi.cyan('ISO   ')} ${d.toISOString()}`,
      `${ansi.cyan('Epoch ')} ${Math.floor(d.getTime() / 1000)} ${ansi.dim('s')}  |  ${d.getTime()} ${ansi.dim('ms')}`
    ].join('\r\n'))
  }
}

// ---------- url ----------
export const url = {
  name: 'url',
  description: 'URL-encode or decode text',
  usage: 'url <encode|decode> <text>',
  async run([sub, ...rest]) {
    const text = rest.join(' ')
    if (sub !== 'encode' && sub !== 'decode') return err('url: usage: url <encode|decode> <text>')
    if (!text) return err('url: missing text')
    try {
      return ok(sub === 'encode' ? encodeURIComponent(text) : decodeURIComponent(text))
    } catch {
      return err('url: invalid input for decode')
    }
  }
}

// ---------- ip ----------
export const ip = {
  name: 'ip',
  description: 'Show local network interfaces and public IP',
  usage: 'ip',
  async run() {
    const lines = [ansi.bold(ansi.pink('NETWORK')), ansi.dim('-'.repeat(40))]
    const ifaces = networkInterfaces()
    for (const [name, addrs] of Object.entries(ifaces)) {
      for (const addr of addrs ?? []) {
        if (addr.family === 'IPv4' && !addr.internal) {
          lines.push(`${ansi.cyan(name.padEnd(16))} ${addr.address}`)
        }
      }
    }
    if (lines.length === 2) lines.push(ansi.dim('No external IPv4 interfaces'))
    try {
      const res = await global.fetch('https://api.ipify.org', { signal: AbortSignal.timeout(5000) })
      const pub = (await res.text()).trim()
      if (pub) lines.push(`${ansi.cyan('public'.padEnd(16))} ${ansi.green(pub)}`)
    } catch {
      lines.push(`${ansi.cyan('public'.padEnd(16))} ${ansi.dim('(unavailable)')}`)
    }
    return ok(lines.join('\r\n'))
  }
}

// ---------- gitlog ----------
export const gitlog = {
  name: 'gitlog',
  description: 'Show a compact, recent git log',
  usage: 'gitlog [count]',
  aliases: ['glog'],
  async run([count], ctx) {
    const n = Math.min(Math.max(parseInt(count, 10) || 15, 1), 100)
    try {
      // %x1f tells git to emit the 0x1F unit-separator byte between fields, which
      // is safe to split on (commit subjects never contain it).
      const { stdout } = await execFileAsync(
        'git',
        ['log', `-n${n}`, '--pretty=format:%h%x1f%s%x1f%an%x1f%ar'],
        { cwd: ctx.cwd, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 }
      )
      const rows = stdout.split('\n').filter(Boolean).map(line => {
        const [hash, subject, author, when] = line.split('\x1f')
        return `${ansi.yellow(hash)}  ${subject}  ${ansi.dim(`- ${author}, ${when}`)}`
      })
      if (!rows.length) return ok(ansi.dim('No commits yet'))
      return ok(rows.join('\r\n'))
    } catch (e) {
      const msg = (e.stderr || e.message || '').trim()
      if (/not a git repository/i.test(msg)) return err('gitlog: not a git repository')
      return err(`gitlog: ${msg}`)
    }
  }
}

// ---------- json ----------
export const json = {
  name: 'json',
  description: 'Validate and pretty-print a JSON file',
  usage: 'json <file>',
  aliases: ['jsonf'],
  async run([file], ctx) {
    if (!file) return err('json: missing file')
    const path = resolve(ctx.cwd, file)
    if (!existsSync(path) || !statSync(path).isFile()) return err(`json: no such file: ${file}`)
    let raw
    try {
      raw = await readFile(path, 'utf8')
    } catch (e) {
      return err(`json: ${e.message}`)
    }
    try {
      const pretty = JSON.stringify(JSON.parse(raw), null, 2)
      return ok(`${ansi.green('[ok] valid JSON')}\r\n${ansi.dim('-'.repeat(30))}\r\n${pretty}`)
    } catch (e) {
      return err(`json: invalid JSON - ${e.message}`)
    }
  }
}
