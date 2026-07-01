// Developer text/net toolkit: small, dependency-free commands that answer the
// "I just need to..." moments without leaving the terminal.
import { promises as dns } from 'dns'
import { ok, err, ansi } from './_helpers'

// ---------- case ----------
const CASES = ['upper', 'lower', 'title', 'camel', 'snake', 'kebab', 'constant']
function words(text) {
  return String(text)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')     // camel boundaries
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
}
function toCase(mode, text) {
  const w = words(text)
  switch (mode) {
    case 'upper': return text.toUpperCase()
    case 'lower': return text.toLowerCase()
    case 'title': return w.map(x => x[0].toUpperCase() + x.slice(1).toLowerCase()).join(' ')
    case 'camel': return w.map((x, i) => i === 0 ? x.toLowerCase() : x[0].toUpperCase() + x.slice(1).toLowerCase()).join('')
    case 'snake': return w.map(x => x.toLowerCase()).join('_')
    case 'kebab': return w.map(x => x.toLowerCase()).join('-')
    case 'constant': return w.map(x => x.toUpperCase()).join('_')
    default: return text
  }
}
export const caseCmd = {
  name: 'case',
  description: 'Convert text between cases (camel, snake, kebab, …)',
  usage: `case <${CASES.join('|')}> <text>`,
  async run([mode, ...rest]) {
    const m = String(mode || '').toLowerCase()
    const text = rest.join(' ').trim()
    if (!CASES.includes(m)) return err(`case: pick one of ${CASES.join(', ')}`)
    if (!text) return err('case: missing text')
    return ok(ansi.cyan(toCase(m, text)))
  }
}

// ---------- slug ----------
export const slug = {
  name: 'slug',
  description: 'Slugify text for URLs and filenames',
  usage: 'slug <text>',
  async run(args) {
    const text = args.join(' ').trim()
    if (!text) return err('slug: missing text')
    const s = text
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')  // strip diacritics
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return ok(ansi.cyan(s || '(nothing slugifiable)'))
  }
}

// ---------- lorem ----------
const LOREM = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum').split(' ')
export const lorem = {
  name: 'lorem',
  description: 'Generate lorem ipsum placeholder text',
  usage: 'lorem [words=30]',
  async run([n]) {
    const count = Math.max(1, Math.min(500, parseInt(n, 10) || 30))
    const out = []
    for (let i = 0; i < count; i++) out.push(LOREM[i % LOREM.length])
    const text = out.join(' ')
    return ok(text[0].toUpperCase() + text.slice(1) + '.')
  }
}

// ---------- regex ----------
export const regex = {
  name: 'regex',
  description: 'Test a regular expression against text',
  usage: 'regex <pattern> <text>',
  aliases: ['re'],
  async run([pattern, ...rest]) {
    const text = rest.join(' ')
    if (!pattern || !text) return err('regex: usage: regex <pattern> <text>')
    let re
    try { re = new RegExp(pattern, 'g') } catch (e) { return err(`regex: invalid pattern — ${e.message}`) }
    const matches = [...text.matchAll(re)]
    if (!matches.length) return ok(ansi.dim(`No match for /${pattern}/ in the text.`))
    const shown = matches.slice(0, 20).map((m, i) => {
      const groups = m.length > 1 ? ansi.dim(`  groups: ${m.slice(1).map(g => JSON.stringify(g ?? null)).join(', ')}`) : ''
      return `  ${ansi.dim(String(i + 1).padStart(2))}  ${ansi.pink(m[0])}${ansi.dim(` @ ${m.index}`)}${groups}`
    })
    const highlighted = text.replace(re, m => ansi.pink(m))
    return ok([
      ansi.dim(`${matches.length} match${matches.length === 1 ? '' : 'es'} for /${pattern}/`),
      ...shown,
      '',
      `  ${highlighted}`
    ].join('\r\n'))
  }
}

// ---------- pick ----------
export const pick = {
  name: 'pick',
  description: 'Randomly pick one of the given options (or flip / roll)',
  usage: 'pick <a> <b> [c…]  ·  pick flip  ·  pick d20',
  async run(args) {
    if (!args.length) return err('pick: give me options — pick tea coffee, pick flip, pick d6')
    if (args.length === 1 && args[0].toLowerCase() === 'flip') {
      return ok(`🪙  ${ansi.pink(Math.random() < 0.5 ? 'Heads' : 'Tails')}`)
    }
    const die = args.length === 1 && args[0].match(/^d(\d{1,4})$/i)
    if (die) {
      const sides = Math.max(2, parseInt(die[1], 10))
      return ok(`🎲  ${ansi.pink(String(1 + Math.floor(Math.random() * sides)))} ${ansi.dim(`(d${sides})`)}`)
    }
    if (args.length === 1) return err('pick: give me at least two options')
    const choice = args[Math.floor(Math.random() * args.length)]
    return ok(`→  ${ansi.pink(choice)}`)
  }
}

// ---------- dns ----------
export const dnsCmd = {
  name: 'dns',
  description: 'DNS lookup for a hostname (A/AAAA/CNAME/MX/TXT)',
  usage: 'dns <host> [type]',
  async run([host, type]) {
    if (!host) return err('dns: missing hostname')
    const safe = String(host).trim().replace(/^https?:\/\//i, '').split('/')[0]
    if (!/^[a-z0-9.-]+$/i.test(safe)) return err('dns: invalid hostname')
    const wanted = String(type || '').toUpperCase()
    const lines = [ansi.bold(ansi.pink(safe))]
    const tryResolve = async (label, fn) => {
      if (wanted && wanted !== label) return
      try {
        const res = await fn()
        if (Array.isArray(res) && res.length) {
          const fmt = res.slice(0, 8).map(r =>
            typeof r === 'string' ? r
            : Array.isArray(r) ? r.join('')
            : r.exchange ? `${r.exchange} (prio ${r.priority})`
            : JSON.stringify(r)
          )
          lines.push(`  ${ansi.cyan(label.padEnd(6))} ${fmt.join(`\r\n  ${' '.repeat(7)}`)}`)
        }
      } catch {}
    }
    await Promise.all([
      tryResolve('A', () => dns.resolve4(safe)),
      tryResolve('AAAA', () => dns.resolve6(safe)),
      tryResolve('CNAME', () => dns.resolveCname(safe)),
      tryResolve('MX', () => dns.resolveMx(safe)),
      tryResolve('TXT', () => dns.resolveTxt(safe))
    ])
    if (lines.length === 1) return err(`dns: no records found for ${safe}`)
    return ok(lines.join('\r\n'))
  }
}

// ---------- headers ----------
export const headers = {
  name: 'headers',
  description: 'Show the HTTP response headers of a URL (HEAD request)',
  usage: 'headers <url>',
  async run([url]) {
    if (!url) return err('headers: missing URL')
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`
    try {
      let res = await global.fetch(target, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Sush/1.0' } })
      // Some servers reject HEAD — retry with GET but discard the body.
      if (res.status === 405 || res.status === 501) {
        res = await global.fetch(target, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Sush/1.0' } })
        try { res.body?.cancel?.() } catch {}
      }
      const rows = [...res.headers.entries()].map(([k, v]) => `  ${ansi.cyan(k.padEnd(28))} ${v.length > 120 ? v.slice(0, 120) + '…' : v}`)
      return ok([
        `${ansi.bold(ansi.pink(String(res.status)))} ${res.statusText || ''}  ${ansi.dim(target)}`,
        ansi.dim('─'.repeat(48)),
        ...rows
      ].join('\r\n'))
    } catch (e) {
      return err(`headers: ${e.message}`)
    }
  }
}

// ---------- title ----------
export const title = {
  name: 'title',
  description: 'Rename the current session',
  usage: 'title <name>',
  async run(args) {
    const label = args.join(' ').trim().slice(0, 40)
    if (!label) return err('title: missing name')
    return { ...ok(ansi.green(`Session renamed: ${label}`)), action: { name: 'rename-tab', label } }
  }
}
