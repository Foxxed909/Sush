import { ipcMain, app, clipboard, Tray, Menu, nativeImage } from 'electron'
import { execFile, execFileSync, spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync, watch as fsWatch } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { fileURLToPath } from 'url'

const execFileAsync = promisify(execFile)
import * as pty from 'node-pty'
import si from 'systeminformation'
import { registry } from './shell/registry'
import { clearTabTimer } from './commands/extras'
import { parseInput } from './shell/parser'
import { ShellContext } from './shell/context'
import { loadSushrc, readSushrcRaw, writeSushrcRaw, sushrcPath } from './shell/sushrc'
import { ScrollbackStore } from './shell/scrollback'
import { homedir } from 'os'
import {
  initUsers, listUsers, getActiveUser, getLastUserId, createUser, updateUser,
  deleteUser, activateUser, signOut, activeUserEnv, linkProvider, unlinkProvider
} from './users'
import {
  listAccounts, addAccount, switchAccount, removeAccount, renameAccount, nextAccount, peekNextAccount, markLimitHit,
  getLimitPolicy, setLimitPolicy, setAccountUsage, slotEnv
} from './accounts'
import {
  setClaudePanelSender, startClaudePanelRun, stopClaudePanelRun, stopAllClaudePanelRuns,
  getClaudeLimits, checkClaudeLimits, probeClaudeUsage
} from './claudePanel'
import { getTtsConfigPublic, setTtsConfig, synthesizeTts } from './tts'
import { resolveExecutable, shimSpawnSpec } from './exec'
import { setOauthConfig, publicOauthConfig } from './oauth/config'
import { saveToken, deleteToken, encryptionAvailable } from './oauth/tokenStore'
import { startGitHubFlow, cancelGitHubFlow } from './oauth/github'
import { startGoogleFlow, cancelGoogleFlow } from './oauth/google'
import { consumeTicket, peekTicket } from './oauth/tickets'
import { setOauthEventSender } from './oauth/events'
import {
  getGitHubStatus, listRepos, getWork, getNotifications,
  markNotificationRead, clearGitHubCache
} from './github-api'

const contexts = new Map()
const abortControllers = new Map()
const ptySessions = new Map()
const fileWatchers = new Map()
const tabMeta = new Map()   // pin/rename metadata; cleared when its tab closes
let scrollback = null  // ScrollbackStore, initialized in registerIpcHandlers
const OSC7_CWD_PATTERN = /\x1b\]7;([^\x07\x1b]*)(?:\x07|\x1b\\)/g
const SAFE_EXTERNAL_URL = /^https?:\/\//i

// Static art block sent immediately; boot lines are staggered in sendStaggeredBanner().
const WELCOME_ART = [
  '\x1b[38;2;255;107;157m\x1b[1m',
  '   _____ _    _  _____ _    _',
  '  / ____| |  | |/ ____| |  | |',
  ' | (___ | |  | | (___ | |__| |',
  '  \\___ \\| |  | |\\___ \\|  __  |',
  '  ____) | |__| |____) | |  | |',
  ' |_____/ \\____/|_____/|_|  |_|',
  '\x1b[0m'
].join('\r\n')

function buildBootLines(shellLabel, cwd) {
  const folder = cwd.split(/[\\/]/).filter(Boolean).pop() || cwd
  const dim = '\x1b[2m', reset = '\x1b[0m', pink = '\x1b[38;2;255;107;157m', cyan = '\x1b[36m', green = '\x1b[32m'
  // Read the version dynamically so the banner never drifts from package.json.
  let version = ''
  try { version = `v${app.getVersion()}` } catch { version = 'v3' }
  return [
    `${dim}  ╭──────────────────────────────────────╮${reset}`,
    `${dim}  │${reset}  ${pink}${version}${reset}  ${dim}·${reset}  ${cyan}Helm    ${reset}  ${dim}│${reset}`,
    `${dim}  │${reset}  ${green}✓${reset} ${shellLabel}  ${dim}·${reset}  ${pink}${folder}${reset}  ${dim}│${reset}`,
    `${dim}  ╰──────────────────────────────────────╯${reset}`,
    ''
  ]
}

function sendStaggeredBanner(win, tabId, shellLabel, cwd) {
  if (!win.isDestroyed()) win.webContents.send('sush:pty-data', { tabId, data: WELCOME_ART + '\r\n' })
  const lines = buildBootLines(shellLabel, cwd)
  lines.forEach((line, i) => {
    setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.send('sush:pty-data', { tabId, data: line + '\r\n' })
    }, 60 + i * 55)
  })
}

function commandExists(file) {
  if (process.platform !== 'win32') return true
  try {
    execFileSync('where.exe', [file], { stdio: 'ignore', windowsHide: true })
    return true
  } catch {
    return false
  }
}

// Non-interactive AI engines for Seducia. The entire prompt goes over STDIN
// so no untrusted text ever lands on the command line (no shell, and for
// .cmd shims cmd.exe re-parses argv — stdin is the only safe channel). Each
// uses the user's existing CLI login — no API key required.
const SEDUCIA_ENGINES = {
  // --strict-mcp-config with no --mcp-config = load ZERO MCP servers. A chat
  // reply needs none of them, and on a slow machine their startup alone was
  // blowing the old 90s timeout.
  claude: { args: ['-p', '--strict-mcp-config'] },
  codex: { args: ['exec', '--skip-git-repo-check', '-'] },
  gemini: { args: [] }
}
const CLI_TIMEOUT_MS = 180000   // weak-CPU headroom; was 90s and timing out

// codex exec logs a banner + thinking lines; the final reply follows the
// last "] codex" marker. Fall back to the raw text if the format changes.
function cleanCliOutput(engine, raw) {
  const text = String(raw ?? '').trim()
  if (engine !== 'codex') return text
  const marker = /\[[^\]]*\]\s*codex\s*\r?\n/g
  let last = -1
  let m
  while ((m = marker.exec(text))) last = m.index + m[0].length
  if (last === -1) return text
  const out = text.slice(last).replace(/\r?\n\[[^\]]*\]\s*tokens used:[\s\S]*$/, '').trim()
  return out || text
}

// Session/usage-limit signatures across the agent CLIs. When one of these
// shows up, rotating to another account slot may unblock the engine.
const LIMIT_RE = /(session|usage|rate)\s*limit|limit\s+(reached|exceeded)|too many requests|quota exceeded|429/i

function runCliEngine(engine, { prompt, cwd }) {
  const spec = SEDUCIA_ENGINES[engine]
  if (!spec) return Promise.resolve({ ok: false, engine, error: `Unknown AI engine: ${engine}` })
  const bin = resolveExecutable(engine)
  if (!bin) return Promise.resolve({ ok: false, engine, error: `The \`${engine}\` CLI was not found on your PATH.` })

  const { file, args } = shimSpawnSpec(bin, spec.args)
  const dir = isDirectory(cwd) ? cwd : undefined

  return new Promise(resolve => {
    let stdout = '', stderr = '', settled = false
    const done = (result) => { if (!settled) { settled = true; clearTimeout(timer); resolve(result) } }
    let child
    try {
      // Identity env LAST so the active user's CLI login (CLAUDE_CONFIG_DIR,
      // CODEX_HOME, ...) wins over the host's — same rule as PTY spawns.
      child = spawn(file, args, { cwd: dir, windowsHide: true, env: { ...process.env, ...activeUserEnv() } })
    } catch (e) {
      return resolve({ ok: false, engine, error: e.message })
    }
    const timer = setTimeout(() => { try { child.kill() } catch {} ; done({ ok: false, engine, error: `${engine} CLI timed out (${CLI_TIMEOUT_MS / 1000}s).` }) }, CLI_TIMEOUT_MS)
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('error', e => done({ ok: false, engine, error: e.message }))
    child.on('close', code => {
      if (code === 0) done({ ok: true, engine, text: cleanCliOutput(engine, stdout) })
      else {
        const error = (stderr.trim() || stdout.trim() || `${engine} exited with code ${code}`).slice(0, 500)
        done({ ok: false, engine, error, limitHit: LIMIT_RE.test(error) })
      }
    })
    try { child.stdin.write(prompt); child.stdin.end() } catch (e) { done({ ok: false, engine, error: e.message }) }
  })
}

// Limit-aware wrapper: on a limit hit, consult the policy — 'auto' rotates to
// the next account slot and retries once; 'ask' reports the available slot so
// the renderer can offer the switch; 'never' just reports the failure.
async function runCliEngineWithAccounts(engine, opts, policy = 'ask') {
  const first = await runCliEngine(engine, opts)
  if (first.ok || !first.limitHit) return first
  const user = getActiveUser()
  if (!user) return first
  // Remember the hit on the slot that took it — rotation prefers the slot
  // that has rested longest, and the Accounts panel shows "limited Xh ago".
  markLimitHit(user.id, engine)
  if (policy === 'never') return first
  if (policy === 'auto') {
    const rotated = nextAccount(user.id, engine)
    if (!rotated.ok) return first
    const retry = await runCliEngine(engine, opts)
    return retry.ok
      ? { ...retry, switchedTo: rotated.label }
      : { ...retry, switchedTo: rotated.label, limitHit: retry.limitHit ?? false }
  }
  const alt = peekNextAccount(user.id, engine)
  return alt ? { ...first, canSwitch: { provider: engine, slotId: alt.id, label: alt.label } } : first
}

// Read one account's live usage by probing the CLI with that slot's env layered
// on top of the active identity env (so only this provider's config dir moves).
// Claude only for now — it's the CLI whose stream-json carries a rate-limit
// snapshot; codex/gemini have no equivalent we can read cheaply.
async function readAccountUsage(userId, provider, slotId) {
  if (provider !== 'claude') return { ok: false, error: 'Live usage is only available for Claude right now.' }
  const overlay = { ...activeUserEnv(), ...slotEnv(userId, provider, slotId) }
  return probeClaudeUsage(overlay)
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

  // macOS / Linux: honour $SHELL (zsh default on macOS), spawn as a login
  // shell so the user's rc files (PATH, nvm, etc.) load — agent CLIs are
  // almost always installed via a PATH set up there.
  const file = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
  const name = file.split('/').pop()
  return {
    id: name,
    label: name,
    file,
    args: ['-l']
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
      rawStatus: line.slice(0, 2),
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

function buildRestoreBanner(text) {
  const bar = '\x1b[38;2;120;130;140m' + '─'.repeat(20) + ' restored history ' + '─'.repeat(20) + '\x1b[0m'
  const body = String(text).replace(/\n/g, '\r\n')
  return `\r\n${bar}\r\n\x1b[2m${body}\x1b[0m\r\n${bar.replace('restored history', '─────────────────')}\r\n\r\n`
}

function normalizeBootCommand(command) {
  const value = String(command ?? '').replace(/[\r\n]+/g, ' ').trim()
  return value || null
}

function writeShellCommands(proc, commands) {
  for (const command of commands.map(normalizeBootCommand).filter(Boolean)) {
    try { proc.write(`${command}\r`) } catch {}
  }
}

function startPtySession(win, { tabId, cols, rows, cwd, shellId, profileId, restoreKey, persistScrollback = true, bootCommand } = {}) {
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

  // Load the user's .sushrc profile (aliases / env / startup / default cwd).
  const sushrc = loadSushrc()

  const requestedShell = getDefaultShell(shellId)
  const shellCwd = resolveStartCwd(cwd ?? sushrc.settings.cwd)
  sendStaggeredBanner(win, tabId, requestedShell.label, shellCwd)

  // Replay persisted scrollback for this workspace, if any.
  if (persistScrollback && scrollback) {
    const restored = scrollback.restoreFor(restoreKey)
    if (restored && !win.isDestroyed()) {
      win.webContents.send('sush:pty-data', { tabId, data: buildRestoreBanner(restored) })
    }
  }

  const sushrcEnv = {}
  for (const [k, v] of Object.entries(sushrc.env || {})) sushrcEnv[k] = String(v)

  const { proc, shell } = spawnPty(requestedShell, {
    cols,
    rows,
    cwd: shellCwd,
    env: {
      ...process.env,
      ...sushrcEnv,
      // Identity isolation: when a Sush user is signed in, point CLI config
      // dirs (claude/codex/gh/XDG, optionally HOME itself) at their private
      // tree so logins never bleed between users. Wins over .sushrc env.
      ...activeUserEnv(),
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
  session.restoreKey = restoreKey || null
  session.persistScrollback = !!persistScrollback
  ptySessions.set(tabId, session)
  const ctx = new ShellContext({ cwd: shellCwd, tabId })
  ctx.aliases = { ...sushrc.alias }   // .sushrc aliases feed the smart-command bar
  contexts.set(tabId, ctx)
  if (persistScrollback && scrollback) scrollback.attach(tabId, restoreKey)
  sendPtyState(win, session)

  // Run .sushrc [startup] commands once the shell is ready.
  const startupCmds = (sushrc.startup || []).filter(Boolean)
  const bootCmd = normalizeBootCommand(bootCommand)
  const queuedBootCommands = [...startupCmds, bootCmd].filter(Boolean)
  if (queuedBootCommands.length) {
    setTimeout(() => {
      if (session.status !== 'running') return
      writeShellCommands(proc, queuedBootCommands)
    }, 900)
  }

  proc.onData((data) => {
    session.lastActiveAt = Date.now()
    if (session.persistScrollback && scrollback) scrollback.append(tabId, data)
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
    if (session.persistScrollback && scrollback) scrollback.persist(tabId)
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

function closePtySession(tabId, { sync = false } = {}) {
  const session = ptySessions.get(tabId)
  if (!session) return
  if (session.persistScrollback && scrollback) scrollback.persist(tabId)
  clearTabTimer(tabId)   // Bug fix: clean up any pending timer for this session
  ptySessions.delete(tabId)
  if (process.platform === 'win32' && session.pid) {
    // Fire-and-forget async kill: the old execFileSync froze the main process
    // (UI + every other PTY) for the duration of each taskkill — closing a
    // 16-session swarm meant seconds of dead app. Sync is only used on quit,
    // where blocking is fine because the process is going away anyway.
    try {
      if (sync) {
        execFileSync('taskkill', ['/PID', String(session.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      } else {
        const killer = spawn('taskkill', ['/PID', String(session.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
        killer.on('error', () => { try { session.proc.kill() } catch {} })
      }
      return
    } catch {}
  }
  try { session.proc.kill() } catch {}
}

function closeAllFileWatchers() {
  for (const watcher of fileWatchers.values()) {
    try { watcher.close() } catch {}
  }
  fileWatchers.clear()
}

function closeAllPtySessions({ sync = false } = {}) {
  for (const tabId of [...ptySessions.keys()]) closePtySession(tabId, { sync })
}


function getContext(tabId) {
  const session = ptySessions.get(tabId)
  if (!contexts.has(tabId)) {
    const ctx = new ShellContext({ cwd: session?.cwd ?? homedir(), tabId })
    // Populate aliases so alias expansion works even before the PTY session boots.
    try { ctx.aliases = { ...loadSushrc().alias } } catch {}
    contexts.set(tabId, ctx)
  }
  const ctx = contexts.get(tabId)
  if (ctx.tabId !== tabId) ctx.tabId = tabId
  if (session?.cwd && ctx.cwd !== session.cwd) ctx.setCwd(session.cwd)
  return ctx
}

async function runRegisteredCommand({ tabId, input, passthroughUnknown = false }) {
  const trimmed = String(input ?? '').trim()
  const ctx = getContext(tabId)
  // Expand session aliases before parsing.
  const expanded = ctx.expandAliases(trimmed)
  const parsed = parseInput(expanded)
  if (!parsed) return { type: 'empty', output: '', handled: true }

  const { cmd, args } = parsed
  const command = registry.get(cmd)

  if (!command) {
    if (passthroughUnknown) {
      return {
        type: 'passthrough',
        handled: false,
        action: { name: 'passthrough', input: expanded, cwd: ctx.cwd },
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

let handlersRegistered = false
let mainWin = null
const cliPresence = new Map()   // CLI name -> found on PATH (see sush:check-clis)

// ── Tray (minimize-to-tray, opt-in via Settings) ─────────────────────────────
// Created lazily on the first tray-minimize; the icon is a tiny embedded PNG
// (pink Sush dot) so no asset file is needed.
let tray = null
const TRAY_ICON_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAEpSURBVDhPY2CgJfifM1/jf/Zsh/9ZswzQ5XCC//HzOf5lz2n/lz3n+//suf+R8b+sucv/Z82XQNcDByCb/mXNuY6uEcWQ7DnPQa5C1wuz+T66Bmz4X9ac9xgu+Zczdzq6wpsx7f8PBVf9vxjZhGlI9tzt6Laj+HmyY/x/Lh4BOC4z88Mw5H/6fAWIAVmzDNBtRtYMw7sCylANyJwTAHF+5pwMZInZLikYmkG4xToM3RUNEBeA4hpJAuRvdM0gvNgjA9WArDkJEAPy5wugmfzfX90CRbODgv7/7xkz0QxASmD/subuRzcE5BWQs0EBiq4ZFOVwzWBX5MzXQI8J/BhLYvqXPSeCGEP+Zc8tQNcLBxCXzD2OrgmiEUcyxgb+ZcyygEZvA8hGXBoB+PrDpt9y53MAAAAASUVORK5CYII='

function trayIcon() {
  // Real icon when present (resources/icon.ico, dev + packaged); the embedded
  // base64 dot stays as the can-never-fail fallback.
  for (const p of [
    join(__dirname, '../../resources/icon.ico'),
    join(process.resourcesPath || '', 'icon.ico')
  ]) {
    try { if (p && existsSync(p)) return nativeImage.createFromPath(p) } catch {}
  }
  return nativeImage.createFromDataURL(TRAY_ICON_DATA)
}

function hideToTray() {
  if (!mainWin || mainWin.isDestroyed()) return
  if (!tray) {
    tray = new Tray(trayIcon())
    tray.setToolTip('Sush')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show Sush', click: () => restoreFromTray() },
      { type: 'separator' },
      { label: 'Quit Sush', click: () => app.quit() }
    ]))
    tray.on('click', () => restoreFromTray())
  }
  mainWin.hide()
}

function restoreFromTray() {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.show()
    mainWin.focus()
  }
}

export function registerIpcHandlers(win) {
  // ipcMain.handle throws on duplicate channel registration — guard the
  // re-entry path (macOS dock "activate" recreates the window) but keep the
  // bound window fresh so PTY events reach the new renderer.
  mainWin = win
  if (handlersRegistered) return
  handlersRegistered = true

  scrollback = new ScrollbackStore(app.getPath('userData'))
  initUsers()
  app.once('before-quit', () => {
    scrollback?.flush()
    closeAllFileWatchers()
    closeAllPtySessions({ sync: true })
    cancelGitHubFlow()
    cancelGoogleFlow()
    stopAllClaudePanelRuns()
    try { tray?.destroy() } catch {}
  })
  if (process.platform === 'win32') ensurePowerShellBootstrap()

  ipcMain.handle('sush:pty-start', (event, payload) => {
    return startPtySession(mainWin, payload)
  })

  ipcMain.on('sush:pty-input', (event, { tabId, data }) => {
    // node-pty throws if the PTY died between the renderer's check and this
    // write — an uncaught throw here takes down the whole main process.
    try { ptySessions.get(tabId)?.proc.write(data) } catch {}
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
    // Expand aliases before parsing so alias commands route correctly.
    const expanded = ctx.expandAliases(String(input ?? '').trim())
    const parsed = parseInput(expanded)
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

    return runRegisteredCommand({ tabId, input: expanded, passthroughUnknown: false })
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
    contexts.set(tabId, new ShellContext({ cwd: initialCwd, tabId }))
    return { cwd: initialCwd }
  })

  ipcMain.handle('sush:close-tab', (event, { tabId }) => {
    try {
      closePtySession(tabId)
    } finally {
      // Even if the PTY teardown throws, the per-tab maps must not leak.
      contexts.delete(tabId)
      tabMeta.delete(tabId)
    }
  })

  ipcMain.handle('sush:window-control', (event, action) => {
    const win = event.sender.getOwnerBrowserWindow()
    if (action === 'minimize') win.minimize()
    else if (action === 'minimize-tray') hideToTray()
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize()
    else if (action === 'close') win.close()
  })

  // Real OS-level window opacity. The old approach put CSS `opacity` on the
  // renderer root, which faded the terminal TEXT into unreadability; setting it
  // on the window translucent-ifies the whole window uniformly (the expected
  // "ghost the window" behaviour) without touching legibility relative to the
  // rest of the UI. Clamped so you can never make the window invisible.
  ipcMain.handle('sush:set-opacity', (event, value) => {
    const win = event.sender.getOwnerBrowserWindow()
    if (!win) return
    const v = Math.max(0.4, Math.min(1, Number(value) || 1))
    try { win.setOpacity(v) } catch {}
  })

  ipcMain.handle('sush:git-status', (event, { cwd }) => getGitStatus(cwd))
  ipcMain.handle('sush:list-dir', (event, { path }) => listDirectory(path))
  ipcMain.handle('sush:dir-exists', (event, { path }) => ({ path, exists: isDirectory(path) }))
  ipcMain.handle('sush:memory-list', (event, { cwd }) => listMemoryNotes(cwd))
  ipcMain.handle('sush:memory-read', (event, { cwd, name }) => readMemoryNote(cwd, name))
  ipcMain.handle('sush:memory-write', (event, { cwd, name, content }) => writeMemoryNote(cwd, name, content))

  ipcMain.handle('sush:app-version', () => app.getVersion())
  ipcMain.handle('sush:home-dir', () => homedir())

  // ── Sush Identities (multi-user isolation) ────────────────────────────────
  ipcMain.handle('sush:users-list', () => ({ users: listUsers(), active: getActiveUser(), lastUserId: getLastUserId() }))
  ipcMain.handle('sush:users-create', (event, payload) => {
    const { providerTicket, ...form } = payload ?? {}
    let ticket = null
    if (providerTicket) {
      // Validate before creating so a dead ticket can't leave a half-linked user.
      ticket = peekTicket(providerTicket)
      if (!ticket) return { ok: false, error: 'Sign-in expired, try again' }
    }
    const created = createUser(form)
    if (!created.ok || !ticket) return created
    consumeTicket(providerTicket)
    const linked = linkProvider({ id: created.user.id, provider: ticket.provider, profile: ticket.profile })
    if (ticket.provider === 'github' && ticket.token) {
      saveToken(created.user.id, 'github', ticket.token, { login: ticket.profile.login })
    }
    return { ok: true, user: linked.ok ? linked.user : created.user }
  })
  ipcMain.handle('sush:users-update', (event, payload) => updateUser(payload ?? {}))
  ipcMain.handle('sush:users-delete', (event, payload) => deleteUser(payload ?? {}))
  ipcMain.handle('sush:users-activate', (event, payload) => {
    clearGitHubCache()
    return activateUser(payload ?? {})
  })
  ipcMain.handle('sush:users-signout', () => {
    // Sessions belong to the signed-in identity — never leave them running
    // for the next person.
    closeAllPtySessions()
    clearGitHubCache()
    return signOut()
  })

  // ── OAuth providers (Google / GitHub sign-in) ─────────────────────────────
  setOauthEventSender((payload) => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('sush:oauth-event', payload)
  })
  ipcMain.handle('sush:oauth-config-get', () => ({ ...publicOauthConfig(), safeStorage: encryptionAvailable() }))
  ipcMain.handle('sush:oauth-config-set', (event, payload) => setOauthConfig(payload ?? {}))
  ipcMain.handle('sush:oauth-github-start', (event, payload) => startGitHubFlow(payload ?? {}))
  ipcMain.handle('sush:oauth-github-cancel', () => cancelGitHubFlow())
  ipcMain.handle('sush:oauth-google-start', (event, payload) => startGoogleFlow(payload ?? {}))
  ipcMain.handle('sush:oauth-google-cancel', () => cancelGoogleFlow())
  ipcMain.handle('sush:oauth-unlink', (event, { userId, provider } = {}) => {
    const res = unlinkProvider({ id: userId, provider })
    if (res.ok && provider === 'github') {
      deleteToken(userId, 'github')
      clearGitHubCache()
    }
    return res
  })

  // ── GitHub data (active identity only; tokens never leave main) ──────────
  ipcMain.handle('sush:github-status', () => getGitHubStatus())
  ipcMain.handle('sush:github-repos', (event, payload) => listRepos(payload ?? {}))
  ipcMain.handle('sush:github-work', () => getWork())
  ipcMain.handle('sush:github-notifications', (event, payload) => getNotifications(payload ?? {}))
  ipcMain.handle('sush:github-notification-read', (event, { id } = {}) => markNotificationRead(id))

  // ── Open in OS / editor ───────────────────────────────────────────────────
  ipcMain.handle('sush:open-path', async (event, { path: target }) => {
    if (!isDirectory(target) && !existsSync(String(target ?? ''))) return { ok: false, error: 'Path does not exist' }
    const { shell: sh } = await import('electron')
    const result = await sh.openPath(String(target))
    return result ? { ok: false, error: result } : { ok: true }
  })

  ipcMain.handle('sush:open-in-editor', (event, { cwd }) => {
    const dir = resolveStartCwd(cwd)
    const bin = resolveExecutable('code')
    if (!bin) return { ok: false, error: 'VS Code (`code`) not found on PATH' }
    const { file, args } = shimSpawnSpec(bin, ['.'])
    try {
      const child = spawn(file, args, { cwd: dir, detached: true, stdio: 'ignore', windowsHide: true })
      child.unref()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // ── Seducia via local agent CLIs (no API key) ─────────────────────────────
  ipcMain.handle('sush:seducia-cli', (event, { prompt, cwd, engine, limitPolicy }) => {
    const id = ['claude', 'codex', 'gemini'].includes(engine) ? engine : 'claude'
    // The renderer only sends limitPolicy for an explicit override (helpers
    // force 'never' so they never burn a rotation). Otherwise the policy is
    // per-CLI and lives with the account data — read it straight from there.
    const user = getActiveUser()
    const policy = ['never', 'ask', 'auto'].includes(limitPolicy)
      ? limitPolicy
      : (user ? getLimitPolicy(user.id, id) : 'ask')
    return runCliEngineWithAccounts(id, { prompt: String(prompt ?? ''), cwd }, policy)
  })

  // ── CLI account slots (multi-account per identity) ────────────────────────
  const requireUser = (fn) => (event, payload = {}) => {
    const user = getActiveUser()
    if (!user) return { ok: false, error: 'no-user' }
    return fn(user, payload)
  }
  ipcMain.handle('sush:accounts-list', requireUser((user) => listAccounts(user.id)))
  ipcMain.handle('sush:accounts-add', requireUser((user, { provider, label }) => addAccount(user.id, provider, label)))
  ipcMain.handle('sush:accounts-switch', requireUser((user, { provider, slotId }) => switchAccount(user.id, provider, slotId)))
  ipcMain.handle('sush:accounts-remove', requireUser((user, { provider, slotId }) => removeAccount(user.id, provider, slotId)))
  ipcMain.handle('sush:accounts-rename', requireUser((user, { provider, slotId, label }) => renameAccount(user.id, provider, slotId, label)))
  ipcMain.handle('sush:accounts-set-policy', requireUser((user, { provider, policy }) => setLimitPolicy(user.id, provider, policy)))
  // On-demand usage scrape for one account slot. Spawns the CLI with that
  // slot's env, reads its usage view, caches the parsed bars. Never auto-polled
  // (one real CLI spawn per call) — only the per-account refresh button calls it.
  ipcMain.handle('sush:accounts-usage-read', requireUser(async (user, { provider, slotId }) => {
    const parsed = await readAccountUsage(user.id, provider, slotId)
    if (!parsed.ok) return parsed
    return setAccountUsage(user.id, provider, slotId, parsed.usage)
  }))

  // ── Claude Code panel (stream-json driver) ────────────────────────────────
  setClaudePanelSender((payload) => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('sush:claude-panel-event', payload)
  })
  ipcMain.handle('sush:claude-panel-start', (event, payload) => startClaudePanelRun(payload ?? {}))
  ipcMain.handle('sush:claude-panel-stop', (event, payload) => stopClaudePanelRun(payload ?? {}))
  ipcMain.handle('sush:claude-limits-get', () => getClaudeLimits())
  ipcMain.handle('sush:claude-limits-check', () => checkClaudeLimits())

  // ── Cloud TTS (Seducia's voice) ───────────────────────────────────────────
  // The user's own OpenAI/ElevenLabs key lives here and never reaches the
  // renderer; the renderer sends text, main returns audio bytes to play.
  ipcMain.handle('sush:tts-config-get', () => getTtsConfigPublic())
  ipcMain.handle('sush:tts-config-set', (event, payload) => setTtsConfig(payload ?? {}))
  ipcMain.handle('sush:tts-synthesize', (event, payload) => synthesizeTts(payload ?? {}))

  // ── Usage snapshot (the Usage settings panel) ─────────────────────────────
  // Cheap, spawn-free aggregate the Usage panel polls on a timer: per-CLI
  // install state (cached presence), the active account slot + when it last hit
  // a limit (from accounts.json), and the LAST CAPTURED Claude rate-limit window
  // (passive — getClaudeLimits never spawns). The live Claude probe stays on
  // its own handler (claude-limits-check) so auto-refresh can't hammer a weak
  // CPU with real `claude` runs every tick.
  ipcMain.handle('sush:usage-snapshot', () => {
    const user = getActiveUser()
    const providers = (user ? listAccounts(user.id) : {}).providers || {}
    const activeOf = (p) => {
      const st = providers[p]
      if (!st) return null
      const slot = st.slots?.find(s => s.id === st.active)
      return slot ? { label: slot.label, lastLimitAt: slot.lastLimitAt || null, count: st.slots.length } : null
    }
    const present = (name) => {
      if (!cliPresence.has(name)) cliPresence.set(name, !!resolveExecutable(name))
      return cliPresence.get(name)
    }
    return {
      ok: true,
      signedIn: !!user,
      claude: { installed: present('claude'), account: activeOf('claude'), limits: getClaudeLimits() },
      codex: { installed: present('codex'), account: activeOf('codex') },
      gemini: { installed: present('gemini'), account: null }
    }
  })

  // ── CLI availability (locked tiles in the launcher) ──────────────────────
  // Each name costs one where.exe spawn the first time, then it's cached for
  // the app's lifetime; pass refresh:true after installing something new.
  ipcMain.handle('sush:check-clis', (event, { names, refresh } = {}) => {
    const list = (Array.isArray(names) ? names : [])
      .map(n => String(n ?? '').trim())
      .filter(n => n && n.length <= 64)
      .slice(0, 64)
    if (refresh) list.forEach(n => cliPresence.delete(n))
    const found = {}
    for (const name of list) {
      if (!cliPresence.has(name)) cliPresence.set(name, !!resolveExecutable(name))
      found[name] = cliPresence.get(name)
    }
    return { found }
  })

  // ── Scrollback (for session handoff cards) ────────────────────────────────
  ipcMain.handle('sush:get-scrollback', (event, { tabId, chars }) => {
    return { tabId, text: scrollback?.tail(tabId, chars) ?? '' }
  })

  // ── .sushrc profile ───────────────────────────────────────────────────────
  ipcMain.handle('sush:sushrc-read', () => readSushrcRaw())
  ipcMain.handle('sush:sushrc-write', (event, { content }) => writeSushrcRaw(content))
  ipcMain.handle('sush:sushrc-path', () => ({ path: sushrcPath() }))

  // ── File operations ──────────────────────────────────────────────────────
  ipcMain.handle('sush:read-file', async (event, { path: filePath }) => {
    const { readFile: rf } = await import('fs/promises')
    try {
      const content = await rf(String(filePath ?? ''), 'utf8')
      return { ok: true, content }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('sush:write-file', async (event, { path: filePath, content }) => {
    const { writeFile: wf } = await import('fs/promises')
    try {
      await wf(String(filePath ?? ''), String(content ?? ''), 'utf8')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('sush:delete-file', async (event, { path: filePath }) => {
    const { rm: rmf } = await import('fs/promises')
    try {
      await rmf(String(filePath ?? ''), { recursive: true, force: true })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('sush:open-external', async (event, { url }) => {
    const { shell: sh } = await import('electron')
    const target = String(url ?? '')
    if (!SAFE_EXTERNAL_URL.test(target)) return { ok: false, error: 'Only http(s) URLs can be opened externally' }
    try {
      await sh.openExternal(target)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('sush:get-npm-scripts', async (event, { cwd }) => {
    const { readFile: rf } = await import('fs/promises')
    const pkgPath = join(resolveStartCwd(cwd), 'package.json')
    try {
      const pkg = JSON.parse(await rf(pkgPath, 'utf8'))
      return { ok: true, name: pkg.name, scripts: pkg.scripts || {} }
    } catch (e) {
      return { ok: false, scripts: {}, error: e.message }
    }
  })

  ipcMain.handle('sush:get-all-commands', () => {
    return registry.all().map(c => ({
      name: c.name,
      description: c.description || '',
      usage: c.usage || c.name,
      aliases: c.aliases || []
    }))
  })

  ipcMain.handle('sush:session-stats', () => {
    return {
      sessions: ptySessions.size,
      uptime: Math.floor(process.uptime()),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
    }
  })

  ipcMain.handle('sush:get-system-stats', async () => {
    try {
      const [load, mem, graphics, netStats, wifi, processes] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.graphics().catch(() => ({ controllers: [] })),
        si.networkStats().catch(() => []),
        si.wifiConnections().catch(() => []),
        si.processes().catch(() => ({ list: [] }))
      ])

      const sessionStats = {}
      for (const [tabId, session] of ptySessions) {
        const proc = (processes.list || []).find(p => p.pid === session.pid)
        sessionStats[tabId] = {
          pid: session.pid,
          label: session.label,
          cwd: session.cwd,
          cpu: proc?.cpu ?? 0,
          mem: proc?.mem ?? 0,
          memRss: proc?.memRss ?? 0
        }
      }

      return {
        cpu: {
          load: load.currentLoad ?? 0,
          cores: (load.cpus ?? []).map(c => c.load ?? 0)
        },
        memory: {
          total: mem.total ?? 0,
          used: mem.used ?? 0,
          available: mem.available ?? 0,
          swapUsed: mem.swapused ?? 0,
          swapTotal: mem.swaptotal ?? 0
        },
        gpu: (graphics.controllers ?? []).map(g => ({
          name: g.model || 'GPU',
          utilizationGpu: g.utilizationGpu ?? null,
          memUsed: g.memUsed ?? null,
          memTotal: g.memTotal ?? null,
          temperatureGpu: g.temperatureGpu ?? null
        })),
        network: (Array.isArray(netStats) ? netStats : []).map(n => ({
          iface: n.iface,
          rx_bytes: n.rx_bytes ?? 0,
          tx_bytes: n.tx_bytes ?? 0,
          rx_sec: Math.max(0, n.rx_sec ?? 0),
          tx_sec: Math.max(0, n.tx_sec ?? 0)
        })),
        wifi: (Array.isArray(wifi) ? wifi : []).map(w => ({
          ssid: w.ssid,
          signalLevel: w.signalLevel ?? null,
          quality: w.quality ?? null,
          txRate: w.txRate ?? null
        })),
        sessions: sessionStats,
        uptime: Math.floor(process.uptime())
      }
    } catch (e) {
      return { error: e.message }
    }
  })

  // Lightweight stats for the always-on status bar: CPU + memory only.
  // Deliberately avoids si.graphics()/wifiConnections()/processes()/networkStats()
  // — on Windows each of those spawns a child process (wmic/netsh/enumeration),
  // and polling the heavy combined call every few seconds was a major CPU drain.
  // The full get-system-stats stays for the (on-demand, gated) Stats panel.
  ipcMain.handle('sush:get-system-stats-lite', async () => {
    try {
      const [load, mem] = await Promise.all([si.currentLoad(), si.mem()])
      return {
        cpu: { load: load.currentLoad ?? 0 },
        memory: { total: mem.total ?? 0, used: mem.used ?? 0, available: mem.available ?? 0 },
        uptime: Math.floor(process.uptime())
      }
    } catch (e) {
      return { error: e.message }
    }
  })

  // Pin/rename tab metadata (stored in main so it survives renderer reloads)
  ipcMain.handle('sush:set-tab-meta', (event, { tabId, meta }) => {
    tabMeta.set(tabId, { ...(tabMeta.get(tabId) ?? {}), ...meta })
    return { ok: true }
  })
  ipcMain.handle('sush:get-tab-meta', (event, { tabId }) => tabMeta.get(tabId) ?? {})

  // ── Port Manager ─────────────────────────────────────────────────────────
  ipcMain.handle('sush:get-ports', async () => {
    try {
      const [connections, procs] = await Promise.all([
        si.networkConnections().catch(() => []),
        si.processes().catch(() => ({ list: [] }))
      ])
      const procMap = new Map((procs.list || []).map(p => [p.pid, p.name]))
      const seen = new Set()
      const ports = []

      for (const c of connections) {
        const isListening = c.state === 'LISTEN' || c.state === 'listening'
        if (!isListening) continue
        const port = String(c.localPort || '')
        if (!port || seen.has(port)) continue
        seen.add(port)
        const pid = c.pid ? Number(c.pid) : null
        ports.push({
          port,
          address: c.localAddress || '*',
          pid,
          process: c.process || (pid ? (procMap.get(pid) ?? '') : ''),
          protocol: (c.protocol || 'tcp').toLowerCase()
        })
      }

      return { ok: true, ports: ports.sort((a, b) => Number(a.port) - Number(b.port)) }
    } catch (e) {
      return { ok: false, ports: [], error: e.message }
    }
  })

  ipcMain.handle('sush:kill-pid', async (event, { pid }) => {
    const n = Number(pid)
    if (!n || !Number.isInteger(n) || n <= 1) return { ok: false, error: 'Invalid PID' }
    try {
      if (process.platform === 'win32') {
        await execFileAsync('taskkill', ['/PID', String(n), '/F'], { windowsHide: true, encoding: 'utf8' })
      } else {
        process.kill(n, 'SIGTERM')
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // ── Git Commit Helpers ────────────────────────────────────────────────────
  ipcMain.handle('sush:git-stage', async (event, { cwd, file }) => {
    const dir = resolveStartCwd(cwd)
    try {
      await execFileAsync('git', ['-c', 'core.quotepath=false', 'add', '--', String(file || '')], { cwd: dir, windowsHide: true, encoding: 'utf8' })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('sush:git-unstage', async (event, { cwd, file }) => {
    const dir = resolveStartCwd(cwd)
    try {
      await execFileAsync('git', ['-c', 'core.quotepath=false', 'restore', '--staged', '--', String(file || '')], { cwd: dir, windowsHide: true, encoding: 'utf8' })
      return { ok: true }
    } catch (e) {
      try {
        await execFileAsync('git', ['reset', 'HEAD', '--', String(file || '')], { cwd: dir, windowsHide: true, encoding: 'utf8' })
        return { ok: true }
      } catch (e2) {
        return { ok: false, error: e2.message }
      }
    }
  })

  ipcMain.handle('sush:git-commit', async (event, { cwd, message }) => {
    const dir = resolveStartCwd(cwd)
    const msg = String(message || '').trim()
    if (!msg) return { ok: false, error: 'Empty commit message' }
    try {
      const { stdout } = await execFileAsync('git', ['commit', '-m', msg], { cwd: dir, windowsHide: true, encoding: 'utf8' })
      return { ok: true, output: stdout.trim() }
    } catch (e) {
      const out = ((e.stdout || '') + (e.stderr || '')).trim()
      return { ok: false, error: out || e.message }
    }
  })

  ipcMain.handle('sush:git-diff-staged', async (event, { cwd }) => {
    const dir = resolveStartCwd(cwd)
    try {
      const { stdout } = await execFileAsync('git', ['diff', '--cached', '--stat'], { cwd: dir, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 })
      return { ok: true, diff: stdout.trim() }
    } catch (e) {
      return { ok: false, diff: '', error: e.message }
    }
  })

  // ── Docker ────────────────────────────────────────────────────────────────
  ipcMain.handle('sush:docker-ps', async () => {
    try {
      const { stdout } = await execFileAsync('docker', ['ps', '--format', '{{json .}}'], { windowsHide: true, encoding: 'utf8', timeout: 10000 })
      const containers = stdout.trim().split('\n').filter(Boolean).map(line => {
        try { return JSON.parse(line) } catch { return null }
      }).filter(Boolean)
      return { ok: true, containers }
    } catch (e) {
      return { ok: false, containers: [], error: e.message }
    }
  })

  ipcMain.handle('sush:docker-stop', async (event, { id }) => {
    if (!id || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(String(id))) return { ok: false, error: 'Invalid container ID' }
    try {
      await execFileAsync('docker', ['stop', String(id)], { windowsHide: true, encoding: 'utf8', timeout: 30000 })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('sush:docker-logs', async (event, { id, tail = 100 }) => {
    if (!id || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(String(id))) return { ok: false, logs: '', error: 'Invalid container ID' }
    try {
      const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', String(Math.min(500, Math.max(1, Number(tail) || 100))), String(id)], { windowsHide: true, encoding: 'utf8', timeout: 10000 })
      return { ok: true, logs: (stdout + stderr).trim() }
    } catch (e) {
      const out = ((e.stdout || '') + (e.stderr || '')).trim()
      return { ok: false, logs: out, error: e.message }
    }
  })

  // ── File Watcher ──────────────────────────────────────────────────────────
  ipcMain.handle('sush:watch-path', (event, { watchId, path: watchPath }) => {
    if (!watchId || !watchPath) return { ok: false, error: 'Missing watchId or path' }
    if (fileWatchers.has(watchId)) {
      try { fileWatchers.get(watchId).close() } catch {}
      fileWatchers.delete(watchId)
    }
    try {
      const watcher = fsWatch(watchPath, { recursive: false }, (eventType, filename) => {
        if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('sush:file-changed', { watchId, path: watchPath, filename, eventType })
      })
      fileWatchers.set(watchId, watcher)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('sush:unwatch-path', (event, { watchId }) => {
    if (fileWatchers.has(watchId)) {
      try { fileWatchers.get(watchId).close() } catch {}
      fileWatchers.delete(watchId)
    }
    return { ok: true }
  })
}

