// Small UI helpers shared across the renderer.

const HEX3 = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i
const HEX6 = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i

/** Parse a hex color (#rgb or #rrggbb) into {r,g,b}. Falls back to the pink accent. */
export function hexToRgb(hex) {
  const value = String(hex ?? '').trim()
  const m6 = value.match(HEX6)
  if (m6) return { r: parseInt(m6[1], 16), g: parseInt(m6[2], 16), b: parseInt(m6[3], 16) }
  const m3 = value.match(HEX3)
  if (m3) return { r: parseInt(m3[1] + m3[1], 16), g: parseInt(m3[2] + m3[2], 16), b: parseInt(m3[3] + m3[3], 16) }
  return { r: 255, g: 107, b: 157 }
}

/** Build an rgba() string from a hex color and alpha (0..1). Safe for any accent. */
export function rgba(hex, alpha = 1) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** A set of CSS custom properties derived from the accent, for hover/focus styling in CSS. */
export function accentVars(accent) {
  return {
    '--accent': accent,
    '--accent-a06': rgba(accent, 0.06),
    '--accent-a10': rgba(accent, 0.10),
    '--accent-a16': rgba(accent, 0.16),
    '--accent-a22': rgba(accent, 0.22),
    '--accent-a35': rgba(accent, 0.35),
    '--accent-a55': rgba(accent, 0.55)
  }
}

// Glass themes can tune the frosted-panel tint via --glass-surface / --glass-omni
// (the CSS falls back to the default glass values when these are absent).
export function glassVars(ui) {
  const out = {}
  if (ui?.glassTint) out['--glass-surface'] = ui.glassTint
  if (ui?.glassOmni) out['--glass-omni'] = ui.glassOmni
  return out
}
