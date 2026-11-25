// Terminal font and line-height preferences, resolved once for every pane.

// Each platform ships a different monospace face, so a single saved family
// such as 'Cascadia Code' (the old default) gets a fallback stack: macOS
// and Linux then land on a real monospace font instead of the browser default.
export const FONT_FALLBACKS = "'Cascadia Code', 'Fira Code', 'SF Mono', 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', 'DejaVu Sans Mono', monospace"

export const LINE_HEIGHT_DEFAULT = 1.4
export const LINE_HEIGHT_MIN = 1
export const LINE_HEIGHT_MAX = 1.8

export function resolveFontFamily(saved) {
  const value = typeof saved === 'string' ? saved.trim() : ''
  if (!value) return FONT_FALLBACKS
  if (/\bmonospace\s*$/i.test(value)) return value
  return `${value}, ${FONT_FALLBACKS}`
}

export function clampLineHeight(saved) {
  const n = Number(saved)
  if (saved == null || saved === '' || !Number.isFinite(n)) return LINE_HEIGHT_DEFAULT
  return Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, n))
}
