import { paint, width } from './ansi.mjs'

// The Sush wordmark in block letters (OpenCode's ▄█▀ language). Pink, always:
// lighter pink on top shading to a deep pink, so it glows like the app.
const GLYPHS = {
  S: ['█▀▀▀', '▀▀▀█', '▀▀▀▀'],
  U: ['█  █', '█  █', '▀▀▀▀'],
  H: ['█  █', '█▀▀█', '▀  ▀']
}
// Large variant for wide terminals: each cell doubled horizontally.
const BIG = {
  S: ['▄█▀▀▀▀▀', '▀█▄▄▄▄▖', '     ▐█', '▀▀▀▀▀▀▘'],
  U: ['█▌   ▐█', '█▌   ▐█', '█▌   ▐█', '▝▀▀▀▀▀▘'],
  H: ['█▌   ▐█', '█▙▄▄▄▟█', '█▌   ▐█', '▀▘   ▝▀']
}
export const PINKS = ['#ffc2dd', '#ff8fb8', '#ff6b9d', '#e2477f']
export const ACCENT = '#ff6b9d'
export const MUTED = '#9d7f92'

export function logoLines({ big = false, word = 'SUSH' } = {}) {
  const set = big ? BIG : GLYPHS
  const rows = set.S.length
  const out = []
  for (let r = 0; r < rows; r++) {
    const line = [...word].map(ch => set[ch][r]).join(big ? '  ' : ' ')
    const colour = PINKS[Math.min(PINKS.length - 1, Math.round(r * (PINKS.length - 1) / Math.max(1, rows - 1)))]
    out.push(paint(colour, line))
  }
  return out
}

export function logoWidth(opts) { return width(logoLines(opts)[0]) }
