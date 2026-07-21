import { execFileSync } from 'child_process'
import { existsSync } from 'fs'

// Resolve the absolute path of a CLI on PATH. Returns null if not found.
// On Windows, `where` also lists extensionless POSIX shims (npm installs a sh
// wrapper next to the .cmd one) which spawn() can't execute — prefer a hit
// with a real executable extension, then a runnable sibling of a shim.
export function resolveExecutable(name) {
  const finder = process.platform === 'win32' ? 'where.exe' : 'which'
  let hits
  try {
    const out = execFileSync(finder, [name], {
      encoding: 'utf8',
      windowsHide: true,
      // A missing optional CLI is a normal probe result, not an app error.
      // Keep where.exe/which diagnostics out of Electron's console and tests.
      stdio: ['ignore', 'pipe', 'ignore']
    })
    hits = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  } catch {
    return null
  }
  if (!hits.length) return null
  if (process.platform !== 'win32') return hits[0]
  const runnable = /\.(exe|cmd|bat|com)$/i
  const direct = hits.find(h => runnable.test(h))
  if (direct) return direct
  for (const hit of hits) {
    for (const ext of ['.cmd', '.exe', '.bat']) {
      if (existsSync(hit + ext)) return hit + ext
    }
  }
  return hits[0]
}

// Node can't exec a .cmd/.bat shim directly — route it through cmd.exe.
// Only safe for trusted args (resolved paths + constant flags): cmd.exe
// re-parses its command line, so untrusted text must never land here.
export function shimSpawnSpec(bin, args = []) {
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)) {
    return { file: process.env.ComSpec || 'cmd.exe', args: ['/c', bin, ...args] }
  }
  return { file: bin, args }
}
