import { app } from 'electron'
import { accessSync, existsSync, readdirSync } from 'fs'
import { join, extname, basename } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { ok, err, ansi } from './_helpers'
import { resolveExecutable } from '../exec'

const execFileAsync = promisify(execFile)

export function toolExtensions(platform = process.platform) {
  return platform === 'win32'
    ? ['.py', '.ps1', '.bat', '.exe']
    : ['.sh', '.py']
}

function toolNamesIn(dir, platform = process.platform) {
  const extensions = toolExtensions(platform)
  try {
    return [...new Set(readdirSync(dir)
      .filter(f => extensions.includes(extname(f).toLowerCase()) && !f.startsWith('_'))
      .map(f => basename(f, extname(f))))]
  } catch {
    return []
  }
}

function resolveToolsDir() {
  if (process.env.SUSH_TOOLS_DIR) return process.env.SUSH_TOOLS_DIR

  const candidates = [
    process.resourcesPath ? join(process.resourcesPath, 'tools') : null,
    join(app.getAppPath(), 'resources', 'tools'),
    join(process.cwd(), 'resources', 'tools')
  ].filter(Boolean)

  return candidates.find(dir => toolNamesIn(dir).length > 0) ?? candidates[0] ?? ''
}

// SUSH_TOOLS_DIR env var overrides; otherwise use packaged extraResources or the
// repo's resources/tools folder during electron-vite dev.
const TOOLS_DIR = resolveToolsDir()

function listTools() {
  return toolNamesIn(TOOLS_DIR)
}

function resolveToolPath(name, platform = process.platform) {
  for (const ext of toolExtensions(platform)) {
    const full = join(TOOLS_DIR, name + ext)
    try { accessSync(full); return { path: full, ext } } catch {}
  }
  return null
}

export function buildToolCommand({ path, ext }, args, {
  platform = process.platform,
  findExecutable = resolveExecutable
} = {}) {
  if (ext === '.sh') {
    const sh = findExecutable('sh') || (existsSync('/bin/sh') ? '/bin/sh' : null)
    return sh
      ? { file: sh, args: [path, ...args] }
      : { error: 'a POSIX shell runtime (`sh`) was not found on PATH' }
  }
  if (ext === '.py') {
    const python = findExecutable('python3') || findExecutable('python')
    return python
      ? { file: python, args: [path, ...args] }
      : { error: 'Python 3 was not found on PATH (`python3` or `python`)' }
  }
  if (ext === '.ps1') {
    const powershell = findExecutable(platform === 'win32' ? 'powershell.exe' : 'powershell') ||
      findExecutable(platform === 'win32' ? 'pwsh.exe' : 'pwsh')
    return powershell
      ? { file: powershell, args: ['-ExecutionPolicy', 'Bypass', '-File', path, ...args] }
      : { error: 'PowerShell was not found on PATH (`powershell` or `pwsh`)' }
  }
  if (ext === '.bat') {
    // .bat must go through cmd.exe, which re-parses its metacharacters — never
    // hand it a shell with raw args; refuse anything cmd would interpret.
    if (args.some(a => /[&|<>^%"]/.test(a))) {
      return { error: 'arguments contain cmd.exe metacharacters, which .bat tools cannot receive safely' }
    }
    return { file: 'cmd', args: ['/c', path, ...args] }
  }
  return { file: path, args }
}

export const vibe = {
  name: 'vibe',
  description: 'Launch a tool from the VibeHacking TOOLS directory',
  usage: 'vibe <toolname> [args...]  |  vibe list',
  async run([sub, ...args]) {
    if (!sub || sub === 'list') {
      const tools = listTools()
      if (!tools.length) return err(`vibe: TOOLS directory not found or empty\r\n${ansi.dim(TOOLS_DIR)}`)
      const cols = tools.map(t => ansi.cyan(t))
      const rows = []
      for (let i = 0; i < cols.length; i += 4) rows.push(cols.slice(i, i + 4).map(t => t.padEnd(30)).join(''))
      return ok([
        ansi.bold(ansi.pink('VIBE TOOLS')),
        ansi.dim(`${TOOLS_DIR}`),
        ansi.dim('─'.repeat(50)),
        ...rows
      ].join('\r\n'))
    }

    const resolved = resolveToolPath(sub)
    if (!resolved) return err(`vibe: tool '${sub}' not found\r\n${ansi.dim('Run vibe list to see available tools')}`)

    const cmd = buildToolCommand(resolved, args)
    if (cmd.error) return err(`vibe: ${cmd.error}`)
    try {
      const { stdout, stderr } = await execFileAsync(cmd.file, cmd.args, {
        cwd: TOOLS_DIR,
        timeout: 30000,
        windowsHide: true
      })
      const out = (stdout + stderr).trimEnd()
      return ok(out || ansi.dim('(tool ran with no output)'))
    } catch (e) {
      return err(`vibe: ${(e.stderr || e.message).trim()}`)
    }
  }
}
