// Per-file git diff for the Changes pane.
//
// The path comes from the renderer (and originally from `git status`), so it is
// validated before it reaches a git argument list: repo-relative only, no
// parent traversal, nothing that git could read as an option. `--` is always
// passed before it as well.

export const MAX_DIFF_CHARS = 80_000

export function safeRelativePath(path) {
  if (typeof path !== 'string') return null
  const p = path.replace(/\\/g, '/')
  if (!p || p.length > 1024 || p.includes('\0')) return null
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null       // absolute
  if (p.startsWith('-')) return null                                 // option-shaped
  if (p.split('/').some(seg => seg === '..')) return null           // traversal
  return p
}

export function diffArgs({ path, staged = false, untracked = false, nullDevice = '/dev/null' } = {}) {
  const rel = safeRelativePath(path)
  if (!rel) return null
  if (untracked) return ['diff', '--no-index', '--no-color', '--', nullDevice, rel]
  return ['diff', ...(staged ? ['--cached'] : []), '--no-color', '--', rel]
}

export function clipDiff(text, max = MAX_DIFF_CHARS) {
  const s = String(text ?? '')
  return s.length > max ? { diff: s.slice(0, max), truncated: true } : { diff: s, truncated: false }
}
