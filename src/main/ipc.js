import { ipcMain, app, clipboard } from 'electron'
import { exec, execFile, execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { fileURLToPath } from 'url'

const execFileAsync = promisify(execFile)
import * as pty from 'node-pty'
import { registry } from './shell/registry'
import { parseInput } from './shell/parser'
import { ShellContext } from './shell/context'
import { homedir } from 'os'

const contexts = new Map()
const abortControllers = new Map()
const ptySessions = new Map()
const OSC7_CWD_PATTERN = /\x1b\]7;([^\x07\x1b]*)(?:\x07|\x1b\\)/g

const WELCOME_BANNER = [
  '\x1b[38;2;255;107;157m\x1b[1m',
  '   _____ _    _  _____ _    _',
  '  / ____| |  | |/ ____| |  | |',
  ' | (___ | |  | | (___ | |__| |',
  '  \\___ \\| |  | |\\___ \\|  __  |',
  '  ____) | |__| |____) | |  | |',
  ' |_____/ \\____/|_____/|_|  |_|',
  '\x1b[0m',
  ''
].join('\r\n')

function commandExists(file) {
  if (process.platform !== 'win32') return true
  try {
    execFileSync('where.exe', [file], { stdio: 'ignore', windowsHide: true })
    return true
  } catch {
    return false
  }
}

function getDefaultShell(shellId = 'powershell') {
  if (process.env.SUSH_SHELL) {
    return { id: 'custom', label: process.env.SUSH_SHELL, file: process.env.SUSH_SHELL, args: [] }
  }

  if (process.platform === 'win32') {
    if (shellId === 'cmd') {
      return {
        id: 'cmd',
        label: 'Command Prompt',
        file: 'cmd.exe',
        args: ['/K', 'prompt @ $P $G ']
      }
    }

    const wantsPwsh = shellId === 'pwsh' && commandExists('pwsh.exe')
    const file = wantsPwsh ? 'pwsh.exe' : 'powershell.exe'
    const bootstrapPath = ensurePowerShellBootstrap()
    return {
      id: wantsPwsh ? 'pwsh' : 'powershell',
      label: wantsPwsh ? 'PowerShell 7' : 'Windows PowerShell',
      file,
      args: ['-NoLogo', '-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', `. ${psQuote(bootstrapPath)}`]
    }
  }

  return {
    id: 'shell',
    label: process.env.SHELL || 'Shell',
    file: process.env.SHELL || '/bin/bash',
    args: []
  }
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function ensurePowerShellBootstrap() {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const file = join(dir, 'sush-profile.ps1')
  const script = getPowerShellBootstrapScript()
  let current = null
  try { current = readFileSync(file, 'utf8') } catch {}
  if (current !== script) writeFileSync(file, script, 'utf8')
  return file
}

function getPowerShellBootstrapScript() {
  return `
function global:Split-SushAndAnd([string]$Line) {
  $parts = New-Object 'System.Collections.Generic.List[string]'
  $builder = [System.Text.StringBuilder]::new()
  $quote = [char]0

  for ($i = 0; $i -lt $Line.Length; $i++) {
    $ch = $Line[$i]

    if ($ch -eq '"' -or $ch -eq "'") {
      if ($quote -eq [char]0) {
        $quote = $ch
      } elseif ($quote -eq $ch) {
        $quote = [char]0
      }
      [void]$builder.Append($ch)
      continue
    }

    if ($quote -eq [char]0 -and $ch -eq '&' -and ($i + 1) -lt $Line.Length -and $Line[$i + 1] -eq '&') {
      $parts.Add($builder.ToString().Trim())
      [void]$builder.Clear()
      $i++
      continue
    }

    [void]$builder.Append($ch)
  }

  $parts.Add($builder.ToString().Trim())
  return $parts
}

function global:Convert-SushAndAnd([string]$Line) {
  $parts = Split-SushAndAnd $Line
  if ($parts.Count -le 1) { return $Line }

  $result = $parts[0]
  for ($idx = 1; $idx -lt $parts.Count; $idx++) {
    $segment = $parts[$idx].Trim()
    if ($segment) {
      $result += '; if ($?) { ' + $segment + ' }'
    }
  }
  return $result
}

function global:Enable-SushPowerShellCompatibility {
  if ($PSVersionTable.PSVersion.Major -ge 7) { return }
  if (-not (Get-Command Set-PSReadLineKeyHandler -ErrorAction SilentlyContinue)) { return }

  try {
    Set-PSReadLineKeyHandler -Key Enter -ScriptBlock {
      $line = ''
      $cursor = 0
      [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)
      if ($line -like '*&&*') {
        $rewritten = Convert-SushAndAnd $line
        if ($rewritten -ne $line) {
          [Microsoft.PowerShell.PSConsoleReadLine]::Delete(0, $line.Length)
          [Microsoft.PowerShell.PSConsoleReadLine]::Insert($rewritten)
        }
      }
      [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
    }
  } catch {}
}

function global:prompt {
  $previousOk = $?
  $previousExitCode = $LASTEXITCODE
  $path = (Get-Location).ProviderPath
  if (-not $path) { $path = (Get-Location).Path }
  $folder = Split-Path -Leaf $path
  if (-not $folder) { $folder = $path }
  $esc = [char]27
  $bel = [char]7
  try { $uri = [Uri]::new($path).AbsoluteUri } catch { $uri = 'file:///' + ($path -replace '\\\\', '/') }
  try { $Host.UI.RawUI.WindowTitle = "Sush - $path" } catch {}
  $status = if ($previousOk -and (($null -eq $previousExitCode) -or ($previousExitCode -eq 0))) { '' } else { "$esc[31m!$esc[0m " }
  return "$esc]0;Sush - $path$bel$esc]7;$uri$bel$status$esc[38;2;255;107;157m@ $folder \`$ $esc[0m"
}

Enable-SushPowerShellCompatibility
`.trimStart()
}

// ConPTY can throw "Cannot create process, error code: 267" (ERROR_DIRECTORY)
// when the working directory does not exist or is not a directory. Validate first
// and fall back to the home directory so a stale/typo'd path can never crash a
// session.
function resolveStartCwd(cwd) {
  const home = homedir()
  const candidate = cwd && String(cwd).trim()
  if (!candidate) return home
  try {
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate
  } catch {}
  return home
}

// Spawn a PTY robustly on every platform.
//
// The "Cannot create process, error code: 267" failures on Windows came from the
// experimental `useConptyDll` option: it makes node-pty host the pseudoconsole
// with its own bundled OpenConsole.exe agent, whose image/working-directory can't
// be resolved inside Electron's GUI (no-console) process, so CreateProcess fails
// with ERROR_DIRECTORY. The system ConPTY that ships with Windows 10 1809+/11 is
// integrated with conhost and works in GUI processes, so we use that instead and
// never touch useConptyDll. We then degrade gracefully (winpty, then cmd.exe) so a
// single bad shell/option can never hard-crash a session, and surface an
// actionable error if everything fails.
function spawnPty(shell, { cols, rows, cwd, env }) {
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

async function getGitStatus(cwd) {
  const dir = resolveStartCwd(cwd)
  try {
    const branch = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, windowsHide: true, encoding: 'utf8' })
      .then(r => r.stdout.trim())
      .catch(() => null)
    if (!branch) return { repo: false, dir, files: [] }

    const { stdout } = await execFileAsync('git', ['-c', 'core.quotepath=false', 'status', '--porcelain', '--untracked-files=all'], {
      cwd: dir, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 * 4
    })
    const files = stdout.split('\n').filter(Boolean).map(line => ({
      status: (line.slice(0, 2).trim() || '??'),
      path: line.slice(3).replace(/^"|"$/g, '')
    }))
    return { repo: true, dir, branch, files }
  } catch (err) {
    return { repo: false, dir, files: [], error: err.message }
  }
}

function isDirectory(target) {
  const candidate = target && String(target).trim()
  if (!candidate) return false
  try {
    return existsSync(candidate) && statSync(candidate).isDirectory()
  } catch {
    return false
  }
}

// List the children of an EXACT path. Unlike resolveStartCwd this never falls
// back to the home directory — a partial or non-existent path (e.g. while the
// user is still typing) returns no entries instead of silently listing ~,
// which previously surfaced as "fake" suggestions unrelated to the typed path.
function listDirectory(target) {
  const candidate = target == null ? '' : String(target).trim()
  if (!isDirectory(candidate)) {
    return { path: candidate, entries: [], exists: false }
  }
  try {
    const entries = readdirSync(candidate, { withFileTypes: true })
      .filter(entry => entry.name !== '.git' && entry.name !== 'node_modules')
      .map(entry => ({ name: entry.name, dir: entry.isDirectory() }))
      .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1))
    return { path: candidate, entries, exists: true }
  } catch (err) {
    return { path: candidate, entries: [], exists: false, error: err.message }
  }
}

// BridgeMemory-style local notes: markdown files in <cwd>/.sushmemory linked via [[wikilinks]].
function memoryDir(cwd) {
  return join(resolveStartCwd(cwd), '.sushmemory')
}

function listMemoryNotes(cwd) {
  const dir = memoryDir(cwd)
  try {
    if (!existsSync(dir)) return { dir, notes: [] }
    const notes = readdirSync(dir)
      .filter(file => file.toLowerCase().endsWith('.md'))
      .map(file => {
        const name = file.replace(/\.md$/i, '')
        let content = ''
        try { content = readFileSync(join(dir, file), 'utf8') } catch {}
        const links = [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].trim())
        const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || name
        return { name, file, title, links, excerpt: content.replace(/^#.*$/m, '').trim().slice(0, 120) }
      })
    return { dir, notes }
  } catch (err) {
    return { dir, notes: [], error: err.message }
  }
}

function readMemoryNote(cwd, name) {
  const safe = String(name || '').replace(/[\\/]/g, '')
  const file = join(memoryDir(cwd), `${safe}.md`)
  try {
    return { name: safe, content: existsSync(file) ? readFileSync(file, 'utf8') : '' }
  } catch (err) {
    return { name: safe, content: '', error: err.message }
  }
}

function writeMemoryNote(cwd, name, content) {
  const safe = String(name || '').replace(/[\\/]/g, '').trim() || 'note'
  const dir = memoryDir(cwd)
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${safe}.md`), String(content ?? ''), 'utf8')
    return { name: safe, ok: true }
  } catch (err) {
    return { name: safe, ok: false, error: err.message }
  }
}

function parseCwdFromOsc7(data) {
  let cwd = null
  const text = String(data ?? '')
  OSC7_CWD_PATTERN.lastIndex = 0
  for (const match of text.matchAll(OSC7_CWD_PATTERN)) {
    const value = match[1]
    try {
      cwd = fileURLToPath(value)
    } catch {
      try { cwd = decodeURIComponent(value.replace(/^file:\/+/, '')) } catch {}
    }
  }
  OSC7_CWD_PATTERN.lastIndex = 0
  return cwd
}

function sendPtyState(win, session) {
  if (win.isDestroyed()) return
  win.webContents.send('sush:pty-state', {
    tabId: session.tabId,
    label: session.label,
    pid: session.pid,
    shell: session.shell,
    shellId: session.shellId,
    shellLabel: session.shellLabel,
    cwd: session.cwd,
    profileId: session.profileId,
    status: session.status,
    lastActiveAt: session.lastActiveAt
  })
}

function startPtySession(win, { tabId, cols, rows, cwd, shellId, profileId } = {}) {
  if (!tabId) throw new Error('Missing terminal tab id')
  const existing = ptySessions.get(tabId)
  if (existing) {
    return {
      pid: existing.pid,
      shell: existing.shell,
      shellId: existing.shellId,
      shellLabel: existing.shellLabel,
      cwd: existing.cwd,
      profileId: existing.profileId,
      status: existing.status,
      lastActiveAt: existing.lastActiveAt
    }
  }

  const requestedShell = getDefaultShell(shellId)
  const shellCwd = resolveStartCwd(cwd)
  if (!win.isDestroyed()) win.webContents.send('sush:pty-data', { tabId, data: WELCOME_BANNER })

  const { proc, shell } = spawnPty(requestedShell, {
    cols,
    rows,
    cwd: shellCwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      SUSH: '1',
      SUSH_PROFILE_ID: profileId ?? '',
      SUSH_SHELL_ID: requestedShell.id
    }
  })

  const session = {
    tabId,
    label: shellCwd.split(/[\\/]/).filter(Boolean).pop() || shell.label,
    pid: proc.pid,
    shell: [shell.file, ...shell.args].join(' '),
    shellId: shell.id,
    shellLabel: shell.label,
    cwd: shellCwd,
    profileId,
    status: 'running',
    lastActiveAt: Date.now(),
    proc
  }
  ptySessions.set(tabId, session)
  contexts.set(tabId, new ShellContext({ cwd: shellCwd }))
  sendPtyState(win, session)

  proc.onData((data) => {
    session.lastActiveAt = Date.now()
    const nextCwd = parseCwdFromOsc7(data)
    if (nextCwd && nextCwd !== session.cwd) {
      session.cwd = nextCwd
      session.label = nextCwd.split(/[\\/]/).filter(Boolean).pop() || session.label
      contexts.get(tabId)?.setCwd(nextCwd)
      sendPtyState(win, session)
    }
    if (!win.isDestroyed()) win.webContents.send('sush:pty-data', { tabId, data })
  })

  proc.onExit(({ exitCode, signal }) => {
    session.status = 'exited'
    session.lastActiveAt = Date.now()
    sendPtyState(win, session)
    ptySessions.delete(tabId)
    if (!win.isDestroyed()) win.webContents.send('sush:pty-exit', { tabId, exitCode, signal })
  })

  return {
    pid: session.pid,
    shell: session.shell,
    shellId: session.shellId,
    shellLabel: session.shellLabel,
    cwd: session.cwd,
    profileId: session.profileId,
    status: session.status,
    lastActiveAt: session.lastActiveAt
  }
}

function closePtySession(tabId) {
  const session = ptySessions.get(tabId)
  if (!session) return
  ptySessions.delete(tabId)
  try { session.proc.kill() } catch {}
}

function closeAllPtySessions() {
  for (const tabId of ptySessions.keys()) closePtySession(tabId)
}

function execWithAbort(cmd, options) {
  return new Promise((resolve, reject) => {
    const proc = exec(cmd, { ...options, shell: true, windowsHide: true }, (error, stdout, stderr) => {
      if (error) { error.stdout = stdout; error.stderr = stderr; reject(error) }
      else resolve({ stdout, stderr })
    })
    options.signal?.addEventListener('abort', () => { try { proc.kill() } catch {} })
  })
}

function getContext(tabId) {
  const session = ptySessions.get(tabId)
  if (!contexts.has(tabId)) {
    contexts.set(tabId, new ShellContext({ cwd: session?.cwd ?? homedir() }))
  }
  const ctx = contexts.get(tabId)
  if (session?.cwd && ctx.cwd !== session.cwd) ctx.setCwd(session.cwd)
  return ctx
}

async function runRegisteredCommand({ tabId, input, passthroughUnknown = false }) {
  const trimmed = String(input ?? '').trim()
  const parsed = parseInput(trimmed)
  if (!parsed) return { type: 'empty', output: '', handled: true }

  const ctx = getContext(tabId)
  const { cmd, args } = parsed
  const command = registry.get(cmd)

  if (!command) {
    if (passthroughUnknown) {
      return {
        type: 'passthrough',
        handled: false,
        action: { name: 'passthrough', input: trimmed, cwd: ctx.cwd },
        cwd: ctx.cwd
      }
    }
    return null
  }

  const ac = new AbortController()
  abortControllers.set(tabId, ac)
  try {
    ctx.pushHistory(trimmed)
    const beforeCwd = ctx.cwd
    const result = await command.run(args, ctx)
    const session = ptySessions.get(tabId)
    if (session && ctx.cwd !== beforeCwd) {
      session.cwd = ctx.cwd
      session.label = ctx.cwd.split(/[\\/]/).filter(Boolean).pop() || session.label
      session.lastActiveAt = Date.now()
    }
    return {
      type: result?.type ?? 'success',
      output: result?.output ?? '',
      action: result?.action,
      cwd: result?.cwd ?? ctx.cwd,
      handled: true
    }
  } catch (err) {
    return { output: `\x1b[31mError: ${err.message}\x1b[0m`, type: 'error', handled: true, cwd: ctx.cwd }
  } finally {
    abortControllers.delete(tabId)
  }
}

export function registerIpcHandlers(win) {
  app.once('before-quit', closeAllPtySessions)
  if (process.platform === 'win32') ensurePowerShellBootstrap()

  ipcMain.handle('sush:pty-start', (event, payload) => {
    return startPtySession(win, payload)
  })

  ipcMain.on('sush:pty-input', (event, { tabId, data }) => {
    ptySessions.get(tabId)?.proc.write(data)
  })

  ipcMain.on('sush:pty-resize', (event, { tabId, cols, rows }) => {
    const session = ptySessions.get(tabId)
    if (!session) return
    try {
      session.proc.resize(Math.max(2, Number(cols) || 80), Math.max(2, Number(rows) || 24))
    } catch {}
  })

  ipcMain.handle('sush:copy-text', (event, text) => {
    clipboard.writeText(String(text ?? ''))
    return true
  })

  ipcMain.handle('sush:read-clipboard', () => clipboard.readText())

  ipcMain.handle('sush:run-smart-input', async (event, { tabId, input }) => {
    return runRegisteredCommand({ tabId, input, passthroughUnknown: true })
  })

  ipcMain.handle('sush:run-command', async (event, { tabId, input, profileId }) => {
    const ctx = getContext(tabId)
    const parsed = parseInput(input.trim())
    if (!parsed) return { output: '', type: 'empty' }

    const { cmd, args } = parsed
    const command = registry.get(cmd)

    if (!command) {
      // Passthrough — run as real system command (no shell: prevents injection via metacharacters)
      const ac = new AbortController()
      abortControllers.set(tabId, ac)
      try {
        const { stdout, stderr } = await execFileAsync(cmd, args, {
          cwd: ctx.cwd,
          timeout: 30000,
          signal: ac.signal,
          encoding: 'utf8',
          windowsHide: true
        })
        return { output: (stdout + stderr).trimEnd() || '\x1b[2m(no output)\x1b[0m', type: 'success' }
      } catch (e) {
        if (e.code === 'ABORT_ERR') return { output: '\x1b[33m^C\x1b[0m', type: 'cancelled' }
        const out = ((e.stdout || '') + (e.stderr || '')).trimEnd()
        if (!out && (e.message.includes('not recognized') || e.message.includes('not found') || e.code === 'ENOENT')) {
          return { output: `\x1b[31msush: command not found: ${cmd}\x1b[0m`, type: 'error' }
        }
        return { output: out || `\x1b[31m${e.message}\x1b[0m`, type: 'error' }
      } finally {
        abortControllers.delete(tabId)
      }
    }

    return runRegisteredCommand({ tabId, input, passthroughUnknown: false })
  })

  ipcMain.handle('sush:cancel-command', (event, { tabId }) => {
    const session = ptySessions.get(tabId)
    if (session) {
      session.proc.write('\x03')
      return
    }
    abortControllers.get(tabId)?.abort()
  })

  ipcMain.handle('sush:get-cwd', (event, { tabId }) => {
    return ptySessions.get(tabId)?.cwd ?? contexts.get(tabId)?.cwd ?? homedir()
  })

  ipcMain.handle('sush:new-tab', (event, { tabId, cwd }) => {
    const initialCwd = cwd || homedir()
    contexts.set(tabId, new ShellContext({ cwd: initialCwd }))
    return { cwd: initialCwd }
  })

  ipcMain.handle('sush:close-tab', (event, { tabId }) => {
    closePtySession(tabId)
    contexts.delete(tabId)
  })

  ipcMain.handle('sush:window-control', (event, action) => {
    const win = event.sender.getOwnerBrowserWindow()
    if (action === 'minimize') win.minimize()
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize()
    else if (action === 'close') win.close()
  })

  ipcMain.handle('sush:git-status', (event, { cwd }) => getGitStatus(cwd))
  ipcMain.handle('sush:list-dir', (event, { path }) => listDirectory(path))
  ipcMain.handle('sush:dir-exists', (event, { path }) => ({ path, exists: isDirectory(path) }))
  ipcMain.handle('sush:memory-list', (event, { cwd }) => listMemoryNotes(cwd))
  ipcMain.handle('sush:memory-read', (event, { cwd, name }) => readMemoryNote(cwd, name))
  ipcMain.handle('sush:memory-write', (event, { cwd, name, content }) => writeMemoryNote(cwd, name, content))

  ipcMain.handle('sush:app-version', () => app.getVersion())
  ipcMain.handle('sush:home-dir', () => homedir())
}

