import pty from 'node-pty'

// The one place that spawns a PTY. Both the full app and Sush Air go through
// this, so the Windows degradation ladder below is written once instead of
// drifting between two copies.
//
// `useConptyDll` is deliberately never set. Enabling it made node-pty load its
// bundled conpty.dll, which failed with "error 267 (ERROR_DIRECTORY)" on stock
// Windows 11 installs — the system ConPTY that ships with the OS works, so we
// use it and fall back to winpty rather than to a bundled DLL.
export function spawnPty(shell, { cols, rows, cwd, env }) {
  const base = {
    name: 'xterm-256color',
    cols: Number(cols) || 80,
    rows: Number(rows) || 24,
    cwd,
    env
  }

  const attempts = [
    { shell, opts: base },                               // system ConPTY (default)
    { shell, opts: { ...base, useConpty: false } }       // bundled winpty fallback
  ]
  // Last resort on Windows: a guaranteed-present shell with the default backend.
  if (process.platform === 'win32' && shell.file.toLowerCase() !== 'cmd.exe') {
    attempts.push({ shell: { id: 'cmd', label: 'Command Prompt', file: 'cmd.exe', args: [] }, opts: base })
  }

  const errors = []
  for (const attempt of attempts) {
    try {
      return { proc: pty.spawn(attempt.shell.file, attempt.shell.args, attempt.opts), shell: attempt.shell }
    } catch (err) {
      errors.push(`${attempt.shell.file}: ${err.message}`)
    }
  }
  throw new Error(`Could not start a terminal. Tried: ${errors.join(' | ')}`)
}
