// Terminal notifications: the bell, plus OSC 9 (iTerm2, Windows Terminal,
// Ghostty, WezTerm) and OSC 777 (kitty, foot, urxvt). Inside tmux the
// sequences are wrapped so they reach the outer terminal.
export function notification(title, body, env = process.env) {
  const clean = s => String(s || '').replace(/[\x00-\x1f\x7f;]/g, ' ').slice(0, 180)
  const seqs = [`\x1b]9;${clean(title)}: ${clean(body)}\x07`, `\x1b]777;notify;${clean(title)};${clean(body)}\x07`]
  const wrap = s => (env.TMUX ? `\x1bPtmux;${s.replace(/\x1b/g, '\x1b\x1b')}\x1b\\` : s)
  return '\x07' + seqs.map(wrap).join('')
}
export function notify(title, body, out = process.stdout) {
  try { out.write(notification(title, body)) } catch {}
}
