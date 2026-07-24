import pty from 'node-pty'
import { existsSync } from 'fs'
import { join, delimiter } from 'path'

// Air's PTY layer. It used to import Sush's, back when Air was a window inside
// Sush. It is a copy now, and that is the correct trade: a shared module is a
// coupling, and the whole claim Air makes is that you can uninstall Sush and
// Air keeps working. Ninety lines duplicated is cheaper than a dependency
// between two products.
//
// `useConptyDll` is deliberately never set. Enabling it makes node-pty load its
// bundled conpty.dll, which fails with "error 267 (ERROR_DIRECTORY)" on stock
// Windows 11 installs. The ConPTY that ships with the OS works. This comment is
// the only thing standing between the next reader and "fixing" it.

function commandExists(name) {
  const paths = (process.env.PATH || '').split(delimiter).filter(Boolean)
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
    : ['']
  for (const dir of paths) {
    for (const ext of exts) {
      try {
        if (existsSync(join(dir, name.endsWith(ext) ? name : name + ext))) return true
      } catch {}
    }
  }
  return false
}

function resolveExecutable(name) {
  const paths = (process.env.PATH || '').split(delimiter).filter(Boolean)
  for (const dir of paths) {
    const candidate = join(dir, name)
    try {
      if (existsSync(candidate)) return candidate
    } catch {}
  }
  return null
}

// Which shell to run. Air has no profile system and no identity, so this is a
// pure function of the platform and what is installed — no config file gets
// consulted, and there is nothing to migrate when you reinstall.
export function resolveShell(shellId) {
  if (process.env.SUSH_AIR_SHELL) {
    const file = process.env.SUSH_AIR_SHELL
    return { id: 'custom', label: file.split(/[\\/]/).pop(), file, args: [] }
  }

  if (process.platform === 'win32') {
    if (shellId === 'cmd') {
      return { id: 'cmd', label: 'Command Prompt', file: 'cmd.exe', args: [] }
    }
    const wantsPwsh = shellId === 'pwsh' && commandExists('pwsh.exe')
    return {
      id: wantsPwsh ? 'pwsh' : 'powershell',
      label: wantsPwsh ? 'PowerShell 7' : 'Windows PowerShell',
      file: wantsPwsh ? 'pwsh.exe' : 'powershell.exe',
      // -NoProfile is deliberate and it is *not* the same choice Sush makes.
      // Sush loads a bootstrap script because it has a prompt, aliases and a
      // smart command bar that depend on one. Air has none of that, so loading
      // a profile would only slow the first paint.
      args: ['-NoLogo', '-NoExit', '-ExecutionPolicy', 'Bypass']
    }
  }

  const allowed = new Set(['bash', 'zsh', 'sh'])
  const selected = allowed.has(shellId) ? resolveExecutable(shellId) : null
  const file = selected || process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
  const name = file.split('/').pop()
  // Login shell, so your PATH, nvm and rc files are the ones you expect.
  return { id: name, label: name, file, args: ['-l'] }
}

// Enumerate the shells worth offering, deduped on what actually resolved rather
// than on what we asked for — resolveShell falls back when a shell is missing,
// so asking for pwsh on a machine without it returns powershell twice.
export function listShells() {
  const ids = process.platform === 'win32' ? ['powershell', 'pwsh', 'cmd'] : ['zsh', 'bash', 'sh']
  const seen = new Set()
  const shells = []
  for (const id of ids) {
    try {
      const resolved = resolveShell(id)
      if (seen.has(resolved.id)) continue
      seen.add(resolved.id)
      shells.push({ id: resolved.id, label: resolved.label })
    } catch {}
  }
  return { shells, defaultId: shells[0]?.id ?? null }
}

export function spawnPty(shell, { cols, rows, cwd, env }) {
  const base = {
    name: 'xterm-256color',
    cols: Number(cols) || 80,
    rows: Number(rows) || 24,
    cwd,
    env
  }

  const attempts = [
    { shell, opts: base },                          // system ConPTY (default)
    { shell, opts: { ...base, useConpty: false } }  // bundled winpty fallback
  ]
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
