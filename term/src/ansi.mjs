// Tiny ANSI toolkit: truecolor with a 256-colour fallback, NO_COLOR aware.
const env = typeof process !== 'undefined' ? process.env : {}
// Colour only on a real terminal (or when forced), never into pipes/files.
const ttyOut = typeof process !== 'undefined' && !!process.stdout?.isTTY
export const COLOR = !env.NO_COLOR && env.TERM !== 'dumb' && (ttyOut || !!env.FORCE_COLOR)
export const TRUECOLOR = /truecolor|24bit/i.test(env.COLORTERM || '') || /iTerm|WezTerm|vscode|Hyper|Apple_Terminal|ghostty|WarpTerminal/i.test(env.TERM_PROGRAM || '') || !!env.WT_SESSION

const ESC = '\x1b['
export const reset = COLOR ? `${ESC}0m` : ''

function hexRgb(hex) {
  const h = hex.replace('#', '')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
}
function to256([r, g, b]) {
  const q = v => (v < 48 ? 0 : v < 115 ? 1 : Math.floor((v - 35) / 40))
  return 16 + 36 * q(r) + 6 * q(g) + q(b)
}
export function fg(hex) {
  if (!COLOR) return ''
  const rgb = hexRgb(hex)
  return TRUECOLOR ? `${ESC}38;2;${rgb.join(';')}m` : `${ESC}38;5;${to256(rgb)}m`
}
export function bg(hex) {
  if (!COLOR) return ''
  const rgb = hexRgb(hex)
  return TRUECOLOR ? `${ESC}48;2;${rgb.join(';')}m` : `${ESC}48;5;${to256(rgb)}m`
}
export const bold = s => (COLOR ? `${ESC}1m${s}${ESC}22m` : s)
export const dim = s => (COLOR ? `${ESC}2m${s}${ESC}22m` : s)
export const paint = (hex, s) => (COLOR ? `${fg(hex)}${s}${ESC}39m` : s)

// Visible width: strip escape sequences; count wide CJK/emoji as 2.
export function stripAnsi(s) { return String(s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '') }
export function width(s) {
  let w = 0
  for (const ch of stripAnsi(s)) {
    const cp = ch.codePointAt(0)
    w += (cp >= 0x1100 && (cp <= 0x115f || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0x1f300 && cp <= 0x1faff))) ? 2 : 1
  }
  return w
}
export function padEnd(s, n) { return s + ' '.repeat(Math.max(0, n - width(s))) }
export function center(s, cols) { return ' '.repeat(Math.max(0, Math.floor((cols - width(s)) / 2))) + s }
export function truncate(s, n) {
  const plain = stripAnsi(s)
  return width(plain) <= n ? s : plain.slice(0, Math.max(0, n - 1)) + '…'
}

export const screen = {
  alt: '\x1b[?1049h', main: '\x1b[?1049l', hide: '\x1b[?25l', show: '\x1b[?25h',
  clear: '\x1b[2J', home: '\x1b[H', move: (row, col) => `\x1b[${row};${col}H`, eraseDown: '\x1b[J'
}
