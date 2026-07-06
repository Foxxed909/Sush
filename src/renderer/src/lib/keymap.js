// THE registry of app-owned keyboard chords. Two sides must agree on this
// list: App.jsx's window-level handlers (which perform the actions) and
// useTerminal's xterm key filter (which stops the same chords from reaching
// the PTY). They used to be two hand-maintained tables and drifted twice —
// Ctrl+Shift+H was blocked with no handler, Ctrl+Shift+E had a handler but
// leaked ^E into focused terminals. Change a chord? Change it HERE and in
// the matching App.jsx handler; the filter follows automatically.

// Ctrl(/Cmd) + key — no shift.
//   k Seducia · b panel · p palette · t new tab · w close tab · , settings
export const APP_CTRL = new Set(['k', 'b', 'p', 't', 'w', ','])

// Ctrl(/Cmd) + Shift + key.
//   n launcher · t reopen closed · z zen · b broadcast · m mission control
//   s dictation · g grid · d duplicate · e power saver
export const APP_CTRL_SHIFT = new Set(['n', 't', 'z', 'b', 'm', 's', 'g', 'd', 'e'])

// Does the app own this keydown? (Used by the terminal to decide what NOT to
// forward. Ctrl+Shift+C/V are deliberately absent — the terminal handles
// copy/paste itself before consulting this.)
export function isAppChord(e) {
  if (e.key === 'F2') return true                                  // rename session
  const ctrl = e.ctrlKey || e.metaKey
  if (!ctrl) return false
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (key === 'Tab') return true                                   // MRU switcher
  if (key === '\\') return true                                    // split toggle (^\ is SIGQUIT — never forward)
  if (key === '?' || (e.shiftKey && key === '/')) return true      // shortcuts help
  if (e.shiftKey) return APP_CTRL_SHIFT.has(key) || key === 'Home' // Home = go home
  if (APP_CTRL.has(key)) return true
  if (!e.altKey && /^[1-9]$/.test(key)) return true                // jump to session
  if (key === 'PageDown' || key === 'PageUp') return true          // next/prev session
  if (key === '=' || key === '+' || key === '-' || key === '0') return true  // zoom
  return false
}
