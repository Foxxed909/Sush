// One switch for reduced motion. <html> gets .sush-motion-reduced when the OS
// asks for it, the user turns on Reduce motion, or eco / power saver is on.
// CSS (index.css "Motion policy") zeroes travel and scale but keeps feedback.
const osQuery = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null
let last = {}

export function applyMotionPolicy(next = last) {
  last = next || {}
  if (typeof document === 'undefined') return false
  const reduced = !!(last.userReduce || last.eco || last.saver || osQuery?.matches)
  document.documentElement.classList.toggle('sush-motion-reduced', reduced)
  return reduced
}

osQuery?.addEventListener?.('change', () => applyMotionPolicy())
applyMotionPolicy()
