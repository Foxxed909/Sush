import { readdirSync } from 'fs'
import { join, extname, basename } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { ok, err, ansi } from './_helpers'

const execFileAsync = promisify(execFile)
const TOOLS_DIR = 'C:\\Users\\WhitePC\\Rooms\\Coderoom\\Vibe\\VibeHacking\\TOOLS'

function listTools() {
  try {
    return readdirSync(TOOLS_DIR)
      .filter(f => ['.py', '.ps1', '.bat', '.exe'].includes(extname(f)) && !f.startsWith('_'))
      .map(f => basename(f, extname(f)))
  } catch {
    return []
  }
}

function resolveToolPath(name) {
  const exts = ['.bat', '.py', '.ps1', '.exe']
  for (const ext of exts) {
    const full = join(TOOLS_DIR, name + ext)
    try { require('fs').accessSync(full); return { path: full, ext } } catch {}
  }
  return null
}

function buildCommand({ path, ext }, args) {
  if (ext === '.py') return { file: 'python', args: [path, ...args] }
  if (ext === '.ps1') return { file: 'powershell', args: ['-ExecutionPolicy', 'Bypass', '-File', path, ...args] }
  if (ext === '.bat') return { file: path, args, shell: true }
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

    const cmd = buildCommand(resolved, args)
    try {
      const { stdout, stderr } = await execFileAsync(cmd.file, cmd.args, {
        cwd: TOOLS_DIR,
        timeout: 30000,
        windowsHide: true,
        shell: cmd.shell === true
      })
      const out = (stdout + stderr).trimEnd()
      return ok(out || ansi.dim('(tool ran with no output)'))
    } catch (e) {
      return err(`vibe: ${(e.stderr || e.message).trim()}`)
    }
  }
}
