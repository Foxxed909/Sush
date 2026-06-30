// Developer-focused built-ins: things you'd otherwise paste into a sketchy
// online tool. All local, no network, no dependencies. Same registry contract
// as the rest: run(args, ctx) -> { output, type }.
import { ok, err, ansi } from './_helpers'

// ---------- jwt ----------
// Decode (NOT verify) a JSON Web Token: header + payload, with the standard
// time claims rendered as human dates and an at-a-glance expiry status. No
// secret is involved, so the signature is deliberately not checked — this is a
// "what's in this token" inspector, and it says so.
function b64urlDecode(segment) {
  const b64 = String(segment).replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
  return Buffer.from(b64 + pad, 'base64').toString('utf8')
}

function formatClaimTimes(payload) {
  const lines = []
  const now = Math.floor(Date.now() / 1000)
  const labels = { iat: 'Issued', nbf: 'Not before', exp: 'Expires' }
  for (const [key, label] of Object.entries(labels)) {
    const v = payload[key]
    if (typeof v !== 'number') continue
    const when = new Date(v * 1000).toLocaleString()
    if (key === 'exp') {
      const expired = v < now
      const status = expired
        ? ansi.red(`EXPIRED ${Math.floor((now - v) / 60)}m ago`)
        : ansi.green(`valid for ${Math.floor((v - now) / 60)}m`)
      lines.push(`${ansi.cyan(label.padEnd(11))} ${when}  ${status}`)
    } else {
      lines.push(`${ansi.cyan(label.padEnd(11))} ${when}`)
    }
  }
  return lines
}

export const jwt = {
  name: 'jwt',
  description: 'Decode a JSON Web Token (header + payload, no signature check)',
  usage: 'jwt <token>',
  async run([token]) {
    if (!token) return err('jwt: usage: jwt <token>')
    const parts = token.split('.')
    if (parts.length < 2) return err('jwt: not a JWT (expected header.payload.signature)')
    let header, payload
    try {
      header = JSON.parse(b64urlDecode(parts[0]))
      payload = JSON.parse(b64urlDecode(parts[1]))
    } catch {
      return err('jwt: could not decode — segments are not valid base64url JSON')
    }
    const out = [
      ansi.bold(ansi.pink('JWT')) + ansi.dim('  (signature not verified)'),
      ansi.dim('-'.repeat(46)),
      ansi.bold('Header'),
      ansi.dim(JSON.stringify(header, null, 2)),
      '',
      ansi.bold('Payload'),
      JSON.stringify(payload, null, 2)
    ]
    const times = formatClaimTimes(payload)
    if (times.length) {
      out.push('', ansi.dim('-'.repeat(46)), ...times)
    }
    return ok(out.join('\r\n'))
  }
}

// ---------- color ----------
function parseColor(input) {
  const s = String(input).trim().toLowerCase()
  let m
  if ((m = s.match(/^#?([0-9a-f]{6})$/))) {
    const n = parseInt(m[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  if ((m = s.match(/^#?([0-9a-f]{3})$/))) {
    const [c1, c2, c3] = m[1]
    return { r: parseInt(c1 + c1, 16), g: parseInt(c2 + c2, 16), b: parseInt(c3 + c3, 16) }
  }
  if ((m = s.match(/^(?:rgb\()?\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)?$/))) {
    const r = +m[1], g = +m[2], b = +m[3]
    if ([r, g, b].some(v => v > 255)) return null
    return { r, g, b }
  }
  return null
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  const d = max - min
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0))
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

// ---------- base ----------
// Convert an integer between bases. `base ff` auto-detects (0x / 0b / 0o
// prefixes, else decimal) and shows all four; `base 255 10 2` converts
// explicitly from base 10 to base 2.
function detectRadix(raw) {
  if (/^0x/i.test(raw)) return { radix: 16, digits: raw.slice(2) }
  if (/^0b/i.test(raw)) return { radix: 2, digits: raw.slice(2) }
  if (/^0o/i.test(raw)) return { radix: 8, digits: raw.slice(2) }
  return { radix: 10, digits: raw }
}

export const base = {
  name: 'base',
  description: 'Convert an integer between bases (bin/oct/dec/hex)',
  usage: 'base <number> [fromBase] [toBase]',
  async run([value, from, to]) {
    if (!value) return err('base: usage: base <number> [fromBase] [toBase]')
    const fromBase = from ? parseInt(from, 10) : null
    const { radix, digits } = fromBase ? { radix: fromBase, digits: value } : detectRadix(value)
    if (radix < 2 || radix > 36) return err('base: fromBase must be between 2 and 36')
    const n = parseInt(digits, radix)
    if (Number.isNaN(n)) return err(`base: "${value}" is not a valid base-${radix} integer`)

    if (to) {
      const toBase = parseInt(to, 10)
      if (toBase < 2 || toBase > 36) return err('base: toBase must be between 2 and 36')
      return ok(`${ansi.dim(`base ${radix} → ${toBase}:`)} ${ansi.pink(n.toString(toBase))}`)
    }
    return ok([
      `${ansi.cyan('DEC')}  ${n}`,
      `${ansi.cyan('HEX')}  0x${n.toString(16)}`,
      `${ansi.cyan('OCT')}  0o${n.toString(8)}`,
      `${ansi.cyan('BIN')}  0b${n.toString(2)}`
    ].join('\r\n'))
  }
}

export const color = {
  name: 'color',
  description: 'Convert a color between hex / rgb / hsl and preview it',
  usage: 'color <#hex | r,g,b | rgb(r,g,b)>',
  aliases: ['colour'],
  async run(args) {
    const input = args.join(' ').trim()
    if (!input) return err('color: usage: color <#hex | r,g,b | rgb(r,g,b)>')
    const rgb = parseColor(input)
    if (!rgb) return err(`color: could not parse "${input}" — try #ff6b9d, 255,107,157, or rgb(255,107,157)`)
    const { r, g, b } = rgb
    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
    const { h, s, l } = rgbToHsl(rgb)
    const swatch = `\x1b[48;2;${r};${g};${b}m        \x1b[0m`
    return ok([
      `${swatch}  ${ansi.bold(hex)}`,
      ansi.dim('-'.repeat(30)),
      `${ansi.cyan('HEX')}  ${hex}`,
      `${ansi.cyan('RGB')}  rgb(${r}, ${g}, ${b})`,
      `${ansi.cyan('HSL')}  hsl(${h}, ${s}%, ${l}%)`
    ].join('\r\n'))
  }
}
