import { shell as electronShell } from 'electron'
import { execFile, spawn } from 'child_process'
import { existsSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { basename, resolve } from 'path'
import { promisify } from 'util'
import { ok, err, ansi } from './_helpers'
import { getListeningPorts } from './system'
import { activeUserEnv } from '../users'
import { resolveExecutable } from '../exec'

const execFileAsync = promisify(execFile)
const SERVE_SCRIPT_PRIORITY = ['dev', 'start', 'serve', 'preview']

function expandPath(target, cwd) {
  if (!target || target === '~') return homedir()
  if (target.startsWith('~/') || target.startsWith('~\\')) {
    return resolve(homedir(), target.slice(2))
  }
  return resolve(cwd, target)
}

function directoryOrError(target, cwd, commandName) {
  const next = expandPath(target, cwd)
  if (!existsSync(next)) return { error: `${commandName}: no such directory: ${target || next}` }
  try {
    if (!statSync(next).isDirectory()) return { error: `${commandName}: not a directory: ${target || next}` }
  } catch {
    return { error: `${commandName}: cannot access: ${target || next}` }
  }
  return { cwd: next }
}

function commandPath(tool) {
  const name = String(tool ?? '').trim()
  if (!name) return null
  // resolveExecutable runs where.exe/which via execFile — no shell. The old
  // POSIX branch interpolated the name into `sh -lc "command -v \"<name>\""`,
  // where JSON.stringify's double quotes still allow $(...)/backtick command
  // substitution, so `where "$(cmd)"` (or `edit`/`doctor` on such a name)
  // executed the substitution.
  return resolveExecutable(name)
}

export function canLaunchEditorDirectly(executable, platform = process.platform) {
  if (!executable) return false
  // cmd.exe reparses .cmd/.bat argv. A user-controlled file path must never be
  // routed through that shim because characters such as &, | and % gain shell
  // semantics. Let the OS association open the file instead.
  return !(platform === 'win32' && /\.(cmd|bat)$/i.test(executable))
}

function launchDetached(executable, args, options) {
  return new Promise(resolveLaunch => {
    let child
    try {
      child = spawn(executable, args, { ...options, detached: true, stdio: 'ignore', shell: false })
    } catch {
      resolveLaunch(false)
      return
    }
    let settled = false
    const finish = ok => {
      if (settled) return
      settled = true
      if (ok) child.unref()
      resolveLaunch(ok)
    }
    child.once('spawn', () => finish(true))
    child.once('error', () => finish(false))
  })
}

export function doctorToolsForPlatform(platform = process.platform, shell = process.env.SHELL) {
  const common = ['node', 'npm', 'git', 'gh']
  if (platform === 'win32') return ['powershell.exe', 'pwsh.exe', 'cmd.exe', ...common]
  const current = shell ? basename(shell) : null
  const shells = platform === 'darwin' ? ['zsh', 'bash', 'sh'] : ['bash', 'zsh', 'sh']
  return [...new Set([current, ...shells, ...common].filter(Boolean))]
}

function readPackage(cwd) {
  const file = resolve(cwd, 'package.json')
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function listeningPorts() {
  return getListeningPorts()
}

export const home = {
  name: 'home',
  description: 'Open the Sush dashboard',
  usage: 'home',
  async run() {
    return {
      ...ok('Dashboard'),
      action: { name: 'open-home' }
    }
  }
}

export const work = {
  name: 'work',
  description: 'Open or switch to a working directory',
  usage: 'work <path>',
  async run(args, ctx) {
    const target = args.join(' ')
    const result = directoryOrError(target, ctx.cwd, 'work')
    if (result.error) return err(result.error)
    return {
      ...ok(`workspace: ${result.cwd}`),
      cwd: result.cwd,
      action: { name: 'open-workspace', cwd: result.cwd, label: basename(result.cwd) || result.cwd }
    }
  }
}

export const recent = {
  name: 'recent',
  description: 'Show recent Sush sessions',
  usage: 'recent',
  aliases: ['recents'],
  async run() {
    return {
      ...ok('Recent sessions'),
      action: { name: 'show-recents' }
    }
  }
}

export const open = {
  name: 'open',
  description: 'Open a file or folder with the default app',
  usage: 'open <path>',
  async run(args, ctx) {
    const target = args.join(' ')
    if (!target) return err('open: missing path')
    const path = expandPath(target, ctx.cwd)
    if (!existsSync(path)) return err(`open: path not found: ${target}`)
    const message = await electronShell.openPath(path)
    if (message) return err(`open: ${message}`)
    return ok(`opened: ${path}`)
  }
}

export const edit = {
  name: 'edit',
  description: 'Open a file or folder in an editor',
  usage: 'edit <path>',
  async run(args, ctx) {
    const target = args.join(' ')
    if (!target) return err('edit: missing path')
    const path = expandPath(target, ctx.cwd)
    if (!existsSync(path)) return err(`edit: path not found: ${target}`)

    const codePath = commandPath('code')
    if (canLaunchEditorDirectly(codePath)) {
      const launched = await launchDetached(codePath, [path], {
        cwd: ctx.cwd,
        windowsHide: true
      })
      if (launched) {
        return ok(`editing: ${path}`)
      }
    }

    // On Windows VS Code is commonly exposed only as code.cmd. Passing the
    // user's path through cmd.exe would be unsafe, so use the registered OS
    // file association in that case (and whenever direct launch fails).
    const message = await electronShell.openPath(path)
    if (message) return err(`edit: ${message}`)
    return ok(`opened: ${path}`)
  }
}

export const serve = {
  name: 'serve',
  description: 'Start the detected project dev server',
  usage: 'serve',
  async run(_, ctx) {
    const pkg = readPackage(ctx.cwd)
    if (!pkg?.scripts) return err('serve: no package.json scripts found in this directory')
    const script = SERVE_SCRIPT_PRIORITY.find(name => pkg.scripts[name])
    if (!script) return err(`serve: no script found (${SERVE_SCRIPT_PRIORITY.join(', ')})`)
    const input = `npm run ${script}`
    return {
      ...ok(`starting: ${input}`),
      action: { name: 'passthrough', input, cwd: ctx.cwd }
    }
  }
}

export const ports = {
  name: 'ports',
  description: 'List listening TCP ports',
  usage: 'ports',
  aliases: ['port'],
  async run() {
    try {
      const entries = listeningPorts()
      if (!entries.length) return ok(ansi.dim('No listening ports found'))
      const rows = entries
        .sort((a, b) => Number(a.port) - Number(b.port))
        .map(entry => `${ansi.cyan(entry.port.padEnd(6))} ${(entry.address ?? '').padEnd(28)} PID ${entry.pid ?? ''}`)
      return ok([ansi.bold(ansi.pink('LISTENING PORTS')), ...rows].join('\r\n'))
    } catch (e) {
      return err(`ports: ${e.message}`)
    }
  }
}

export const clone = {
  name: 'clone',
  description: 'Clone a GitHub repository',
  usage: 'clone <owner/repo> [dir]',
  async run(args, ctx) {
    if (!args.length) return err('clone: missing repository')
    // activeUserEnv() makes gh use the signed-in identity's login, not the
    // host's. Without gh, fall back to plain git over https — public repos
    // work everywhere; private ones need gh (we never put a token in argv).
    const hasGh = !!resolveExecutable('gh')
    try {
      if (hasGh) {
        const { stdout, stderr } = await execFileAsync('gh', ['repo', 'clone', ...args], {
          cwd: ctx.cwd,
          timeout: 120000,
          encoding: 'utf8',
          windowsHide: true,
          env: { ...process.env, ...activeUserEnv() }
        })
        return ok((stdout + stderr).trimEnd() || `cloned: ${args[0]}`)
      }
      const [repo, dir] = args
      if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo))) {
        return err('clone: expected <owner/repo>')
      }
      const gitArgs = ['clone', `https://github.com/${repo}.git`]
      if (dir) gitArgs.push(dir)
      const { stdout, stderr } = await execFileAsync('git', gitArgs, {
        cwd: ctx.cwd,
        timeout: 120000,
        encoding: 'utf8',
        windowsHide: true,
        env: { ...process.env, ...activeUserEnv() }
      })
      return ok((stdout + stderr).trimEnd() || `cloned: ${repo}`)
    } catch (e) {
      const msg = (e.stderr || e.message || '').trim()
      if (!hasGh && /authentication|could not read|403|terminal prompts disabled/i.test(msg)) {
        return err(`clone: ${msg}\r\n${ansi.dim('Private repos need the gh CLI (winget install GitHub.cli) logged in as you')}`)
      }
      return err(`clone: ${msg}`)
    }
  }
}

export const doctor = {
  name: 'doctor',
  description: 'Check the Sush workspace environment',
  usage: 'doctor',
  async run(_, ctx) {
    const tools = doctorToolsForPlatform()
    const lines = [
      ansi.bold(ansi.pink('SUSH DOCTOR')),
      `${ansi.cyan('cwd')} ${existsSync(ctx.cwd) ? ctx.cwd : `${ctx.cwd} (missing)`}`
    ]

    for (const tool of tools) {
      const found = commandPath(tool)
      lines.push(`${ansi.cyan(tool.padEnd(14))} ${found ? found.split(/\r?\n/)[0] : ansi.red('missing')}`)
    }

    try {
      const count = listeningPorts().length
      lines.push(`${ansi.cyan('listening ports')} ${count}`)
    } catch (e) {
      lines.push(`${ansi.cyan('listening ports')} ${ansi.red(e.message)}`)
    }

    // Identity isolation: shows whether CLI logins are fenced to the
    // signed-in Sush profile or shared with the host (~/.claude). Note this
    // reads main's CURRENT user — a session opened before a profile switch
    // still carries the env it spawned with.
    const identEnv = activeUserEnv()
    lines.push('')
    if (identEnv.SUSH_USER) {
      lines.push(ansi.bold(ansi.pink('IDENTITY')))
      lines.push(`${ansi.cyan('signed in as'.padEnd(14))} ${identEnv.SUSH_USER}`)
      lines.push(`${ansi.cyan('claude config'.padEnd(14))} ${identEnv.CLAUDE_CONFIG_DIR}`)
      const credFile = resolve(identEnv.CLAUDE_CONFIG_DIR, '.credentials.json')
      lines.push(`${ansi.cyan('claude login'.padEnd(14))} ${existsSync(credFile) ? ansi.green('isolated to this profile') : ansi.red('none yet - run claude /login in a NEW session to put one here')}`)
    } else {
      lines.push(`${ansi.cyan('identity'.padEnd(14))} ${ansi.red('NO Sush profile active - sessions share the HOST CLI logins (~/.claude)')}`)
    }

    return ok(lines.join('\r\n'))
  }
}

export const where = {
  name: 'where',
  description: 'Resolve an executable path',
  usage: 'where <tool>',
  async run([tool]) {
    if (!tool) return err('where: missing tool name')
    const found = commandPath(tool)
    return found ? ok(found) : err(`where: ${tool} not found`)
  }
}

export const sushrc = {
  name: 'sushrc',
  description: 'Edit your .sushrc profile (aliases, env, startup)',
  usage: 'sushrc',
  aliases: ['profile'],
  async run() {
    return { ...ok('Opening .sushrc'), action: { name: 'open-sushrc' } }
  }
}
