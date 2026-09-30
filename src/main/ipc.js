import { ipcMain, app, clipboard, Tray, Menu, nativeImage, powerMonitor } from 'electron'
import { execFile, execFileSync, spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync, watch as fsWatch } from 'fs'
import { join, parse, resolve } from 'path'
import { promisify } from 'util'
import { fileURLToPath } from 'url'

const execFileAsync = promisify(execFile)
import { spawnPty } from './shell/spawn'
import si from 'systeminformation'
import { registry } from './shell/registry'
import { clearTabTimer, loadSnippets, saveSnippets } from './commands/extras'
import { parseInput } from './shell/parser'
import { ShellContext } from './shell/context'
import { loadSushrc, readSushrcRaw, writeSushrcRaw, sushrcPath } from './shell/sushrc'
import { ScrollbackStore } from './shell/scrollback'
import { runtime } from './shell/runtime'
import { homedir } from 'os'
import {
  initUsers, listUsers, getActiveUser, getLastUserId, createUser, updateUser,
  deleteUser, activateUser, signOut, activeUserEnv, linkProvider, unlinkProvider,
  setIdentityTransitionHandler
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
import { getSttConfigPublic, setSttConfig, transcribe } from './stt'
import { getCredits, resetCredits } from './credits'
import { licensePublic, redeemCode, clearLicense, featuresOf, can, setLicenseChangeSender } from './license'
import { resolveExecutable, shimSpawnSpec } from './exec'
import { createCapabilityCache } from './provider-capabilities'
import { parseGitPorcelainZ } from './git-porcelain'
import { clipDiff, diffArgs } from './git-diff'
import { sensitiveWritePath } from './fs-guard'
import {
  augmentClaudeCommand, claudeConfigRoots, cleanupThreadEventFile, ensureClaudeThreadSettings,
  prepareThreadEventFile, readThread, sweepThreadEventFiles
} from './thread-bridge'
import {
  augmentCodexCommand, codexConfigRoots, codexHome, ensureThreadSink, geminiConfigRoots,
  geminiThreadHooksEnabled, readGeminiSettings, setGeminiCompressionThreshold, setGeminiThreadHooks
} from './thread-providers'
import { setOauthConfig, publicOauthConfig } from './oauth/config'
import { saveToken, deleteToken, encryptionAvailable } from './oauth/tokenStore'
import { startGitHubFlow, cancelGitHubFlow } from './oauth/github'
import { startGoogleFlow, cancelGoogleFlow } from './oauth/google'
import { startConnectFlow, cancelConnectFlow, finishConnectFlow, connectStatus, disconnectProvider, testProvider } from './oauth/connect'
import { consumeTicket, peekTicket } from './oauth/tickets'
import { setOauthEventSender } from './oauth/events'
import { resetSushUserData } from './factory-reset'
import {
  getGitHubStatus, listRepos, getWork, getNotifications,
  markNotificationRead, clearGitHubCache
} from './github-api'

const contexts = new Map()
// tabId -> Set<AbortController>. A Set, not a single controller: the smart bar
// and the terminal can both have a built-in in flight on the same tab, and a
// plain `set(tabId, ac)` let the second command overwrite the first's handle —
// the first became uncancelable, and the loser's `finally` then deleted the
// WINNER's entry, so `cancel-command` silently fell through to writing ^C into
// a PTY that wasn't running the command at all.
const abortControllers = new Map()

function trackAbort(tabId, controller) {
  let set = abortControllers.get(tabId)
  if (!set) { set = new Set(); abortControllers.set(tabId, set) }
  set.add(controller)
}

function untrackAbort(tabId, controller) {
  const set = abortControllers.get(tabId)
  if (!set) return
  set.delete(controller)
  if (!set.size) abortControllers.delete(tabId)
}

// Abort every in-flight command on a tab. Returns true if anything was aborted,
// so the caller knows whether to fall through to the PTY's ^C.
function abortTab(tabId) {
  const set = abortControllers.get(tabId)
  if (!set?.size) return false
  for (const controller of set) {
    try { controller.abort() } catch {}
  }
  return true
}
const cliEngineChildren = new Set()
const ptySessions = new Map()

// Hard ceiling on concurrently live PTYs, enforced in MAIN. The renderer has
// its own tier-aware grid cap, but that is a UI affordance: a renderer bug (or
// a crew launch that loops) could ask for hundreds of shells and main would
// spawn every one. 64 is far above any real tier's grid cap and far below
// "your machine stops responding".
const MAX_LIVE_PTYS = 64

// Cap for sush:read-file. See the handler for why this exists.
const READ_FILE_MAX_BYTES = 8 * 1024 * 1024

function formatBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = Number(n) || 0
  let i = 0
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++ }
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`
}
const fileWatchers = new Map()
const tabMeta = new Map()   // pin/rename metadata; cleared when its tab closes
const threadRoots = new Map() // tabId -> { provider, roots } its PTY env points at
let scrollback = null  // ScrollbackStore, initialized in registerIpcHandlers
let identityRuntimeGeneration = 0
const OSC7_CWD_PATTERN = /\x1b\]7;([^\x07\x1b]*)(?:\x07|\x1b\\)/g
const SAFE_EXTERNAL_URL = /^https?:\/\//i

function guardedFsTarget(raw, { blockHome = false } = {}) {
  const text = String(raw ?? '').trim()
  if (!text) return { ok: false, error: 'Missing path' }
  const target = resolve(text)
  const root = parse(target).root
  const protectedPaths = [root]
  if (blockHome) {
    protectedPaths.push(homedir())
    try { protectedPaths.push(app.getPath('userData')) } catch {}
  }
  const lower = target.toLowerCase()
  const blocked = protectedPaths
    .filter(Boolean)
    .map(p => resolve(p).toLowerCase())
    .includes(lower)
  if (blocked) return { ok: false, error: 'Refusing to operate on a protected path' }
  return { ok: true, path: target }
}

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
  if (win && !win.isDestroyed()) win.webContents.send('sush:pty-data', { tabId, data: WELCOME_ART + '\r\n' })
  const lines = buildBootLines(shellLabel, cwd)
  lines.forEach((line, i) => {
    setTimeout(() => {
      if (win && !win.isDestroyed()) win.webContents.send('sush:pty-data', { tabId, data: line + '\r\n' })
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

function launchDetached(file, args, options = {}) {
  return new Promise(resolveLaunch => {
    let child
    try {
      child = spawn(file, args, { ...options, detached: true, stdio: 'ignore' })
    } catch (error) {
      resolveLaunch({ ok: false, error: error.message })
      return
    }
    let settled = false
    const finish = result => {
      if (settled) return
      settled = true
      if (result.ok) child.unref()
      resolveLaunch(result)
    }
    child.once('spawn', () => finish({ ok: true }))
    child.once('error', error => finish({ ok: false, error: error.message }))
  })
}

// Non-interactive AI engines for Seducia. The entire prompt goes over STDIN
// so no untrusted text ever lands on the command line (no shell, and for
// .cmd shims cmd.exe re-parses argv — stdin is the only safe channel). Each
// uses the user's existing CLI login — no API key required.
//
// An engine may live here ONLY if it can read its prompt from stdin. That's
// why OpenCode is deliberately absent: it has no stdin mode (`opencode run`
// takes the prompt as an argv argument only), and pushing a multi-line prompt
// through argv would be mangled/injected by cmd.exe on Windows .cmd shims.
// OpenCode stays a first-class *launchable agent* and *account provider*
// (see lib/agents.js) — it just can't drive the Seducia chat.
const SEDUCIA_ENGINES = {
  // --strict-mcp-config with no --mcp-config = load ZERO MCP servers. A chat
  // reply needs none of them, and on a slow machine their startup alone was
  // blowing the old 90s timeout.
  claude: { args: ['-p', '--strict-mcp-config'] },
  codex: { args: ['exec', '--skip-git-repo-check', '-'] },
  // Empty args + piped stdin: Gemini runs headless when stdin is non-TTY and
  // reads the piped text as its prompt (google-gemini/gemini-cli headless mode).
  gemini: { args: [] }
}
// Engines that can actually drive Seducia chat — derived from the table above
// so the IPC allow-list can never drift from what's wired.
const CHAT_ENGINES = Object.keys(SEDUCIA_ENGINES)
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

function runCliEngine(engine, { prompt, cwd }, generation = identityRuntimeGeneration) {
  if (generation !== identityRuntimeGeneration) {
    return Promise.resolve({ ok: false, engine, error: 'Identity changed; request cancelled.' })
  }
  const spec = SEDUCIA_ENGINES[engine]
  if (!spec) return Promise.resolve({ ok: false, engine, error: `Unknown AI engine: ${engine}` })
  const bin = resolveExecutable(engine)
  if (!bin) return Promise.resolve({ ok: false, engine, error: `The \`${engine}\` CLI was not found on your PATH.` })

  const { file, args } = shimSpawnSpec(bin, spec.args)
  const dir = isDirectory(cwd) ? cwd : undefined

  return new Promise(resolve => {
    let stdout = '', stderr = '', settled = false
    let child
    const done = (result) => {
      if (!settled) {
        settled = true
        if (child) cliEngineChildren.delete(child)
        clearTimeout(timer)
        resolve(result)
      }
    }
    try {
      // Identity env LAST so the active user's CLI login (CLAUDE_CONFIG_DIR,
      // CODEX_HOME, ...) wins over the host's — same rule as PTY spawns.
      child = spawn(file, args, { cwd: dir, windowsHide: true, env: { ...process.env, ...activeUserEnv() } })
      cliEngineChildren.add(child)
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
  const generation = identityRuntimeGeneration
  const first = await runCliEngine(engine, opts, generation)
  if (generation !== identityRuntimeGeneration) {
    return { ok: false, engine, error: 'Identity changed; request cancelled.' }
  }
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
    const retry = await runCliEngine(engine, opts, generation)
    return retry.ok
      ? { ...retry, switchedTo: rotated.label }
      : { ...retry, switchedTo: rotated.label, limitHit: retry.limitHit ?? false }
  }
  const alt = peekNextAccount(user.id, engine)
  return alt ? { ...first, canSwitch: { provider: engine, slotId: alt.id, label: alt.label } } : first
}

function firstUsefulLine(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line && !/^\W*$/.test(line)) || ''
}

function readCodexHealth(env, { doctor = false } = {}) {
  const home = env.CODEX_HOME || join(homedir(), '.codex')
  const signedIn = existsSync(join(home, 'auth.json'))
  if (!doctor) {
    return Promise.resolve({
      ok: true,
      usage: {
        kind: 'health',
        status: signedIn ? 'signed in' : 'not signed in',
        note: 'Codex does not report usage limits',
        signedIn
      }
    })
  }

  const bin = resolveExecutable('codex')
  if (!bin) {
    return Promise.resolve({
      ok: true,
      usage: {
        kind: 'health',
        status: 'not found',
        note: 'codex CLI was not found',
        signedIn: false
      }
    })
  }

  const { file, args } = shimSpawnSpec(bin, ['doctor'])
  return new Promise(resolve => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let child
    let timer = null
    const done = (usage) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      try { child?.kill() } catch {}
      resolve({ ok: true, usage })
    }
    try {
      child = spawn(file, args, { windowsHide: true, env: { ...process.env, ...env } })
    } catch (e) {
      return done({
        kind: 'health',
        status: 'doctor failed',
        note: e.message,
        signedIn
      })
    }
    timer = setTimeout(() => done({
      kind: 'health',
      status: 'doctor timed out',
      note: 'codex doctor exceeded 45s',
      signedIn
    }), 45000)
    child.stdout.on('data', d => { stdout = (stdout + d).slice(-6000) })
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-6000) })
    child.on('error', e => done({
      kind: 'health',
      status: 'doctor failed',
      note: e.message,
      signedIn
    }))
    child.on('close', code => {
      const out = `${stdout}\n${stderr}`.trim()
      done({
        kind: 'health',
        status: code === 0 ? 'doctor ok' : 'doctor failed',
        note: signedIn ? 'signed in' : 'not signed in',
        detail: firstUsefulLine(out) || `codex doctor exited ${code}`,
        signedIn,
        doctorCode: code
      })
    })
  })
}

// Gemini and OpenCode do not expose a stable, machine-readable quota API like
// Claude's stream-json rate_limit_event. A bounded version run still proves the
// selected slot can launch its CLI, and the config-root check shows whether that
// slot has been configured. We intentionally label this as health, not usage.
function providerConfigPresent(provider, env) {
  const home = env.HOME || env.USERPROFILE || homedir()
  if (provider === 'gemini') return existsSync(join(home, '.gemini'))
  if (provider === 'opencode') {
    const configHome = env.XDG_CONFIG_HOME || join(home, '.config')
    return existsSync(join(configHome, 'opencode'))
  }
  return false
}

function readCliHealth(provider, env) {
  const label = provider === 'gemini' ? 'Gemini' : 'OpenCode'
  const configured = providerConfigPresent(provider, env)
  const bin = resolveExecutable(provider)
  if (!bin) {
    return Promise.resolve({
      ok: true,
      usage: {
        kind: 'health',
        status: 'not found',
        note: `${label} CLI was not found`,
        healthy: false,
        configured
      }
    })
  }

  const { file, args } = shimSpawnSpec(bin, ['--version'])
  return new Promise(resolve => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let child
    let timer = null
    const done = (usage) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      try { child?.kill() } catch {}
      resolve({ ok: true, usage })
    }
    try {
      child = spawn(file, args, { windowsHide: true, env: { ...process.env, ...env } })
    } catch (e) {
      return done({
        kind: 'health',
        status: 'CLI check failed',
        note: e.message,
        healthy: false,
        configured
      })
    }
    timer = setTimeout(() => done({
      kind: 'health',
      status: 'CLI check timed out',
      note: `${label} did not answer within 10s`,
      healthy: false,
      configured
    }), 10000)
    child.stdout.on('data', d => { stdout = (stdout + d).slice(-2000) })
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-2000) })
    child.on('error', e => done({
      kind: 'health',
      status: 'CLI check failed',
      note: e.message,
      healthy: false,
      configured
    }))
    child.on('close', code => {
      const detail = firstUsefulLine(`${stdout}\n${stderr}`)
      done({
        kind: 'health',
        status: code === 0 ? 'CLI ready' : 'CLI check failed',
        note: configured ? 'slot configuration found' : 'no slot configuration found yet',
        detail: detail || `${provider} --version exited ${code}`,
        healthy: code === 0,
        configured,
        checkCode: code
      })
    })
  })
}

// Read one account's "usage" by probing the CLI with that slot's env layered on
// top of the active identity env (so only this provider's config dir moves).
//   • Claude: a real rate-limit snapshot from its stream-json `rate_limit_event`.
//   • Codex: default stays spawn-free (auth.json). The optional doctor flag is
//     button-only and bounded, for richer health when the user asks for it.
//   • Gemini/OpenCode: bounded local CLI health checks; they never pretend to
//     be quota figures because those CLIs do not report a portable quota API.
async function readAccountUsage(userId, provider, slotId, options = {}) {
  if (provider === 'claude') {
    const overlay = { ...activeUserEnv(), ...slotEnv(userId, provider, slotId) }
    return probeClaudeUsage(overlay)
  }
  if (provider === 'codex') {
    const env = { ...activeUserEnv(), ...slotEnv(userId, provider, slotId) }
    return readCodexHealth(env, { doctor: options.doctor === true })
  }
  if (provider === 'gemini' || provider === 'opencode' || provider === 'grok') {
    const env = { ...activeUserEnv(), ...slotEnv(userId, provider, slotId) }
    return readCliHealth(provider, env)
  }
  return { ok: false, error: 'Usage isn’t available for this CLI.' }
}

// Exported so Sush Air resolves shells through exactly this logic — including
// the PowerShell bootstrap that makes `&&` work and emits the OSC 7 sequence
// cwd tracking depends on. A second, simpler resolver in Air would have been a
// second thing to keep correct on Windows.
export function getDefaultShell(shellId = 'powershell') {
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

  // macOS / Linux: honour an explicit profile shell when it is installed,
  // otherwise fall back to $SHELL (zsh by default on macOS). Spawn as a login
  // shell so the user's rc files (PATH, nvm, etc.) load.
  const allowed = new Set(['bash', 'zsh', 'sh'])
  const selected = allowed.has(shellId) ? resolveExecutable(shellId) : null
  const file = selected || process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
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

function existingDirectory(cwd) {
  const candidate = cwd && resolve(String(cwd).trim())
  if (!candidate) return null
  try { return existsSync(candidate) && statSync(candidate).isDirectory() ? candidate : null } catch { return null }
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
async function getGitStatus(cwd) {
  const dir = existingDirectory(cwd)
  if (!dir) return { repo: false, dir: String(cwd || ''), files: [], error: 'Working directory does not exist' }
  try {
    const branch = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, windowsHide: true, encoding: 'utf8' })
      .then(r => r.stdout.trim())
      .catch(() => null)
    if (!branch) return { repo: false, dir, files: [] }

    const { stdout } = await execFileAsync('git', ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all'], {
      cwd: dir, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 * 4
    })
    const files = parseGitPorcelainZ(stdout)
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

function sushProjectDir(cwd) {
  return join(resolveStartCwd(cwd), '.sush')
}

function tasksPath(cwd) {
  return join(sushProjectDir(cwd), 'tasks.json')
}

const TASK_STATUSES = new Set(['todo', 'doing', 'review', 'blocked', 'done'])
const TASK_ROLES = new Set(['Scout', 'Builder', 'Reviewer', 'Tester', 'Docs', 'Security'])

function taskId() {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function cleanList(value) {
  if (Array.isArray(value)) {
    return value.map(v => String(v || '').trim()).filter(Boolean).slice(0, 40)
  }
  return String(value || '')
    .split(/[\n,]+/)
    .map(v => v.trim())
    .filter(Boolean)
    .slice(0, 40)
}

function normalizeTask(task, fallback = {}, { touch = false } = {}) {
  const now = new Date().toISOString()
  const title = String(task?.title ?? fallback.title ?? '').trim().slice(0, 180)
  const status = TASK_STATUSES.has(task?.status) ? task.status : (TASK_STATUSES.has(fallback.status) ? fallback.status : 'todo')
  const role = TASK_ROLES.has(task?.role) ? task.role : (TASK_ROLES.has(fallback.role) ? fallback.role : 'Builder')
  const evidence = cleanList(task?.evidence ?? fallback.evidence)
  return {
    id: String(task?.id || fallback.id || taskId()),
    title: title || 'Untitled task',
    status,
    role,
    owner: String(task?.owner ?? fallback.owner ?? '').trim().slice(0, 80),
    files: cleanList(task?.files ?? fallback.files),
    gate: String(task?.gate ?? fallback.gate ?? '').trim().slice(0, 240),
    evidence,
    createdAt: String(task?.createdAt || fallback.createdAt || now),
    updatedAt: touch ? now : String(task?.updatedAt || fallback.updatedAt || now)
  }
}

function readTasks(cwd) {
  const file = tasksPath(cwd)
  try {
    if (!existsSync(file)) return { ok: true, file, tasks: [] }
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const rawTasks = Array.isArray(parsed) ? parsed : Array.isArray(parsed.tasks) ? parsed.tasks : []
    return { ok: true, file, tasks: rawTasks.map(t => normalizeTask(t)) }
  } catch (err) {
    return { ok: false, file, tasks: [], error: err.message }
  }
}

function writeTasks(cwd, tasks) {
  const dir = sushProjectDir(cwd)
  const file = tasksPath(cwd)
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const normalized = (Array.isArray(tasks) ? tasks : []).map(t => normalizeTask(t))
    writeFileSync(file, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), tasks: normalized }, null, 2), 'utf8')
    return { ok: true, file, tasks: normalized }
  } catch (err) {
    return { ok: false, file, tasks: [], error: err.message }
  }
}

function addTask(cwd, task) {
  const current = readTasks(cwd)
  if (!current.ok) return current
  return writeTasks(cwd, [normalizeTask(task, {}, { touch: true }), ...current.tasks])
}

function updateTask(cwd, id, patch) {
  const current = readTasks(cwd)
  if (!current.ok) return current
  const wanted = String(id || '')
  const tasks = current.tasks.map(task => task.id === wanted ? normalizeTask({ ...task, ...(patch || {}), id: task.id, createdAt: task.createdAt }, task, { touch: true }) : task)
  return writeTasks(cwd, tasks)
}

function deleteTask(cwd, id) {
  const current = readTasks(cwd)
  if (!current.ok) return current
  const wanted = String(id || '')
  return writeTasks(cwd, current.tasks.filter(task => task.id !== wanted))
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
  if (!win || win.isDestroyed()) return
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
    lastActiveAt: session.lastActiveAt,
    threadBridge: session.threadBridge === true
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

// Deliberately reads the module-level `mainWin` (not a captured window ref):
// on macOS the window can be closed and recreated from the dock while PTYs
// keep running, and callbacks bound to the old window would silently drop
// every byte of output for surviving sessions.
// Auto-compact budget from the composer's context control. Claude reads it
// from the environment (its floor is 100K); Codex takes a -c override.
const CLAUDE_MIN_COMPACT_WINDOW = 100_000
function cleanBudget(value) {
  const n = Math.round(Number(value))
  return Number.isFinite(n) && n > 0 && n <= 10_000_000 ? n : null
}

async function startPtySession({ tabId, cols, rows, cwd, shellId, profileId, restoreKey, persistScrollback = true, bootCommand, agentId, contextBudget } = {}) {
  if (!tabId) throw new Error('Missing terminal tab id')
  const existing = ptySessions.get(tabId)
  if (existing) {
    // Locking the app unmounts xterm but deliberately leaves the identity's PTY
    // alive. Rehydrate the new xterm instance from the in-memory tail so unlock
    // does not produce a blank terminal or hide output produced while locked.
    const liveTail = scrollback?.tail(tabId, 6000)
    if (liveTail && mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('sush:pty-data', { tabId, data: buildRestoreBanner(liveTail) })
    }
    sendPtyState(mainWin, existing)
    return {
      pid: existing.pid,
      shell: existing.shell,
      shellId: existing.shellId,
      shellLabel: existing.shellLabel,
      cwd: existing.cwd,
      profileId: existing.profileId,
      status: existing.status,
      lastActiveAt: existing.lastActiveAt,
      threadBridge: existing.threadBridge === true
    }
  }

  // Load the user's .sushrc profile (aliases / env / startup / default cwd).
  // Resolve the working directory from the home profile first, then load an
  // explicitly trusted project .sushrc when SUSH_TRUST_PROJECT_RC=1.
  const requestedShell = getDefaultShell(shellId)
  const shellCwd = resolveStartCwd(cwd ?? loadSushrc().settings.cwd)
  const sushrc = loadSushrc(shellCwd)
  sendStaggeredBanner(mainWin, tabId, requestedShell.label, shellCwd)

  // Replay persisted scrollback for this workspace, if any.
  if (persistScrollback && scrollback) {
    const restored = scrollback.restoreFor(restoreKey)
    if (restored && mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('sush:pty-data', { tabId, data: buildRestoreBanner(restored) })
    }
  }

  const sushrcEnv = {}
  for (const [k, v] of Object.entries(sushrc.env || {})) sushrcEnv[k] = String(v)

  // Claude Thread bridge: use an additional per-launch settings source rather
  // than modifying ~/.claude/settings.json. The hook sink inherits this
  // session-specific path and records Claude's REAL interactive session_id +
  // transcript_path, binding structured data back to exactly this Sush tab.
  let threadEventFile = null
  let threadSettingsFile = null
  let threadSink = null
  let bridgedBootCommand = bootCommand
  const budget = cleanBudget(contextBudget)
  const identityEnv = activeUserEnv()
  const cliEnv = { ...process.env, ...sushrcEnv, ...identityEnv }
  if (agentId === 'claude' && bootCommand) {
    try {
      // First launch may probe once; normal launches hit the persisted
      // binary-stamped capability cache and spawn nothing. Never risk breaking
      // an older/custom Claude CLI with a flag it did not advertise.
      const capabilities = await providerCaps.get('claude')
      if (capabilities?.threadBridge === true) {
        const userData = app.getPath('userData')
        const settingsPath = ensureClaudeThreadSettings(userData, process.platform)
        const augmented = augmentClaudeCommand(bootCommand, settingsPath, { shellId: requestedShell.id, platform: process.platform })
        // If the command already carries an explicit --settings source, Sush
        // intentionally leaves it untouched. Do not claim Thread is attached
        // or create an event sink that no hook will ever write to.
        if (augmented && augmented !== bootCommand) {
          threadEventFile = prepareThreadEventFile(userData, tabId)
          threadSettingsFile = settingsPath
          bridgedBootCommand = augmented
        }
      }
    } catch {
      // Thread is additive. A bridge setup/probe failure must never stop the
      // PTY or the user's Claude session from launching normally.
      threadEventFile = null
      bridgedBootCommand = bootCommand
    }
  }
  if (agentId === 'codex' && bootCommand) {
    try {
      const capabilities = await providerCaps.get('codex')
      let configText = ''
      try { configText = readFileSync(join(codexHome(cliEnv), 'config.toml'), 'utf8') } catch {}
      const augmented = augmentCodexCommand(bootCommand, {
        shellId: requestedShell.id,
        platform: process.platform,
        configText,
        thread: capabilities?.threadBridge === true,
        budget
      })
      bridgedBootCommand = augmented.command || bootCommand
      if (augmented.thread) {
        const userData = app.getPath('userData')
        threadSink = ensureThreadSink(userData)
        threadEventFile = prepareThreadEventFile(userData, tabId)
      }
    } catch {
      threadEventFile = null
      threadSink = null
      bridgedBootCommand = bootCommand
    }
  }
  if (agentId === 'gemini' && bootCommand) {
    try {
      const capabilities = await providerCaps.get('gemini')
      // Only when the user opted in (Settings → Thread); the hook in their
      // Gemini settings does nothing outside a Sush tab.
      if (capabilities?.threadBridge === true && geminiThreadHooksEnabled(readGeminiSettings(cliEnv).settings)) {
        threadEventFile = prepareThreadEventFile(app.getPath('userData'), tabId)
      }
    } catch {
      threadEventFile = null
    }
  }

  const ptyEnv = {
    ...process.env,
    ...sushrcEnv,
    // Identity isolation: when a Sush user is signed in, point CLI config
    // dirs (claude/codex/gh/XDG, optionally HOME itself) at their private
    // tree so logins never bleed between users. Wins over .sushrc env.
    ...identityEnv,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    SUSH: '1',
    SUSH_PROFILE_ID: profileId ?? '',
    SUSH_SHELL_ID: requestedShell.id,
    SUSH_TAB_ID: tabId,
    ...(threadEventFile ? { SUSH_THREAD_EVENT_PATH: threadEventFile } : {}),
    ...(threadSettingsFile ? { SUSH_CLAUDE_THREAD_SETTINGS: threadSettingsFile } : {}),
    ...(threadSink ? { SUSH_THREAD_SINK: threadSink } : {}),
    ...(agentId === 'claude' && budget ? { CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(Math.max(CLAUDE_MIN_COMPACT_WINDOW, budget)) } : {})
  }
  const { proc, shell } = spawnPty(requestedShell, { cols, rows, cwd: shellCwd, env: ptyEnv })
  if (threadEventFile) {
    const roots = agentId === 'codex' ? codexConfigRoots(ptyEnv) : agentId === 'gemini' ? geminiConfigRoots(ptyEnv) : claudeConfigRoots(ptyEnv)
    threadRoots.set(tabId, { provider: agentId, roots })
  }

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
    threadBridge: !!threadEventFile,
    proc
  }
  session.restoreKey = restoreKey || null
  session.persistScrollback = !!persistScrollback
  ptySessions.set(tabId, session)
  const ctx = new ShellContext({ cwd: shellCwd, tabId, shellId: shell.id })
  ctx.aliases = { ...sushrc.alias }   // .sushrc aliases feed the smart-command bar
  contexts.set(tabId, ctx)
  // Always keep a volatile tail for lock/unlock, handoff, and export. The
  // setting controls disk persistence only.
  if (scrollback) scrollback.attach(tabId, restoreKey, { persist: !!persistScrollback })
  sendPtyState(mainWin, session)

  // Run .sushrc [startup] commands once the shell is ready.
  const startupCmds = (sushrc.startup || []).filter(Boolean)
  const bootCmd = normalizeBootCommand(bridgedBootCommand)
  const queuedBootCommands = [...startupCmds, bootCmd].filter(Boolean)
  if (queuedBootCommands.length) {
    setTimeout(() => {
      if (session.status !== 'running') return
      writeShellCommands(proc, queuedBootCommands)
    }, 900)
  }

  proc.onData((data) => {
    // An explicit identity/session teardown removes this exact session from the
    // map before its process fully exits. Drop late bytes so they cannot land in
    // a new profile that reuses the same renderer tab id.
    if (ptySessions.get(tabId) !== session) return
    session.lastActiveAt = Date.now()
    if (scrollback) scrollback.append(tabId, data)
    const nextCwd = parseCwdFromOsc7(data)
    if (nextCwd && nextCwd !== session.cwd) {
      session.cwd = nextCwd
      session.label = nextCwd.split(/[\\/]/).filter(Boolean).pop() || session.label
      contexts.get(tabId)?.setCwd(nextCwd)
      sendPtyState(mainWin, session)
    }
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('sush:pty-data', { tabId, data })
  })

  proc.onExit(({ exitCode, signal }) => {
    if (ptySessions.get(tabId) !== session) return
    session.status = 'exited'
    session.lastActiveAt = Date.now()
    if (scrollback) scrollback.persist(tabId)
    sendPtyState(mainWin, session)
    ptySessions.delete(tabId)
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('sush:pty-exit', { tabId, exitCode, signal })
  })

  return {
    pid: session.pid,
    shell: session.shell,
    shellId: session.shellId,
    shellLabel: session.shellLabel,
    cwd: session.cwd,
    profileId: session.profileId,
    status: session.status,
    lastActiveAt: session.lastActiveAt,
    threadBridge: session.threadBridge === true
  }
}

function closePtySession(tabId, { sync = false } = {}) {
  const session = ptySessions.get(tabId)
  if (!session) return
  if (scrollback) scrollback.persist(tabId)
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

function stopIdentityRuntime({ sync = false, preserveOauthProvider = null } = {}) {
  identityRuntimeGeneration += 1
  for (const set of abortControllers.values()) {
    for (const controller of set) {
      try { controller.abort() } catch {}
    }
  }
  abortControllers.clear()
  for (const child of cliEngineChildren) {
    try { child.kill() } catch {}
  }
  cliEngineChildren.clear()
  stopAllClaudePanelRuns()
  closeAllFileWatchers()
  closeAllPtySessions({ sync })
  contexts.clear()
  tabMeta.clear()
  clearGitHubCache()
  cancelConnectFlow()
  if (preserveOauthProvider !== 'github') cancelGitHubFlow()
  if (preserveOauthProvider !== 'google') cancelGoogleFlow()
}

function activeIdentityTarget(payload, key = 'id') {
  const active = getActiveUser()
  if (!active) return { ok: false, error: 'no-user' }
  if (String(payload?.[key] ?? '') !== active.id) {
    return { ok: false, error: 'You can only change the active identity.' }
  }
  return { ok: true, active }
}

function oauthStartPayload(payload = {}) {
  const mode = payload?.mode ?? 'link'
  if (mode !== 'link' && mode !== 'signin') {
    return { ok: false, error: 'Unknown OAuth mode.' }
  }
  if (mode === 'signin') return { ok: true, payload: { ...payload, mode } }
  const target = activeIdentityTarget(payload, 'userId')
  if (!target.ok) return target
  return { ok: true, payload: { ...payload, mode, userId: target.active.id } }
}


function getContext(tabId) {
  const session = ptySessions.get(tabId)
  if (!contexts.has(tabId)) {
    const cwd = session?.cwd ?? homedir()
    const ctx = new ShellContext({ cwd, tabId, shellId: session?.shellId })
    // Populate aliases so expansion works before PTY boot, including an
    // explicitly trusted project profile for this cwd.
    try { ctx.aliases = { ...loadSushrc(cwd).alias } } catch {}
    contexts.set(tabId, ctx)
  }
  const ctx = contexts.get(tabId)
  if (ctx.tabId !== tabId) ctx.tabId = tabId
  if (session?.cwd && ctx.cwd !== session.cwd) ctx.setCwd(session.cwd)
  if (session?.shellId) ctx.shellId = session.shellId
  ctx.registry = registry
  ctx.parseInput = parseInput
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
  const sensitive = (cmd === 'secrets' && String(args[0] || '').toLowerCase() === 'set') || cmd === 'jwt'

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
  trackAbort(tabId, ac)
  // Hand the cancel signal to the command via its context — before this,
  // the controller existed but nothing ever observed it, so built-ins were
  // uncancelable no matter what the renderer asked for.
  ctx.signal = ac.signal
  try {
    if (!sensitive) ctx.pushHistory(trimmed)
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
      handled: true,
      sensitive
    }
  } catch (err) {
    if (ac.signal.aborted || err?.name === 'AbortError' || err?.code === 'ABORT_ERR') {
      return { output: '\x1b[33m^C\x1b[0m', type: 'cancelled', handled: true, cwd: ctx.cwd, sensitive }
    }
    return { output: `\x1b[31mError: ${err.message}\x1b[0m`, type: 'error', handled: true, cwd: ctx.cwd, sensitive }
  } finally {
    ctx.signal = null
    untrackAbort(tabId, ac)
  }
}

let handlersRegistered = false
let mainWin = null
const cliPresence = new Map()   // CLI name -> found on PATH (see sush:check-clis)
// Provider CLI capabilities (flags/version from --version/--help). Probed once
// per installed binary; a CLI upgrade changes its stat and re-probes.
const providerCaps = createCapabilityCache({
  store: {
    read: () => {
      try { return JSON.parse(readFileSync(join(app.getPath('userData'), 'provider-capabilities.json'), 'utf8')) } catch { return null }
    },
    write: (data) => {
      try { writeFileSync(join(app.getPath('userData'), 'provider-capabilities.json'), JSON.stringify(data)) } catch {}
    }
  }
})

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
  // Destroy the icon on restore. It used to live for the rest of the app's
  // lifetime after a single minimize-to-tray, so the user saw a permanent tray
  // entry for a window that was plainly visible — and on Windows the stale icon
  // outlived the window on some shells. hideToTray() recreates it on demand.
  try { tray?.destroy() } catch {}
  tray = null
}

export function registerIpcHandlers(win) {
  // ipcMain.handle throws on duplicate channel registration — guard the
  // re-entry path (macOS dock "activate" recreates the window) but keep the
  // bound window fresh so PTY events reach the new renderer.
  mainWin = win
  if (handlersRegistered) return
  handlersRegistered = true

  scrollback = new ScrollbackStore(app.getPath('userData'))
  try { sweepThreadEventFiles(app.getPath('userData')) } catch {}
  // Late-bound refs so shell commands (hunt, credits…) can reach the live
  // stores without importing ipc.js (circular).
  runtime.scrollback = scrollback
  runtime.sessions = ptySessions
  initUsers()
  setIdentityTransitionHandler(({ source }) => {
    const provider = String(source || '').startsWith('provider:')
      ? String(source).slice('provider:'.length)
      : null
    stopIdentityRuntime({ preserveOauthProvider: provider })
  })
  app.once('before-quit', () => {
    scrollback?.flush()
    stopIdentityRuntime({ sync: true })
    try { tray?.destroy() } catch {}
  })
  if (process.platform === 'win32') ensurePowerShellBootstrap()

  ipcMain.handle('sush:pty-start', (event, payload) => {
    if (!getActiveUser()) throw new Error('Sign in to an identity before starting a terminal.')
    // Reusing an existing tabId is a restart, not a new session — only a
    // genuinely new tab counts against the ceiling.
    if (!ptySessions.has(payload?.tabId) && ptySessions.size >= MAX_LIVE_PTYS) {
      throw new Error(`Too many terminals open (${MAX_LIVE_PTYS}). Close a session and try again.`)
    }
    return startPtySession(payload)
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
    if (!getActiveUser()) return { type: 'error', output: 'Sign in to an identity first.', handled: true }
    return runRegisteredCommand({ tabId, input, passthroughUnknown: true })
  })

  ipcMain.handle('sush:run-command', async (event, { tabId, input, profileId }) => {
    if (!getActiveUser()) return { type: 'error', output: 'Sign in to an identity first.' }
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
      trackAbort(tabId, ac)
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
        untrackAbort(tabId, ac)
      }
    }

    return runRegisteredCommand({ tabId, input: expanded, passthroughUnknown: false })
  })

  ipcMain.handle('sush:cancel-command', (event, { tabId }) => {
    // A registered command can be in flight even while a PTY exists for the
    // tab (smart-bar built-ins) — abort it first; the old order wrote ^C to
    // the PTY and left the built-in running to its timeout.
    if (abortTab(tabId)) return
    ptySessions.get(tabId)?.proc.write('\x03')
  })

  ipcMain.handle('sush:get-cwd', (event, { tabId }) => {
    return ptySessions.get(tabId)?.cwd ?? contexts.get(tabId)?.cwd ?? homedir()
  })

  ipcMain.handle('sush:new-tab', (event, { tabId, cwd, shellId }) => {
    if (!getActiveUser()) return { ok: false, error: 'no-user' }
    const initialCwd = cwd || homedir()
    const ctx = new ShellContext({ cwd: initialCwd, tabId, shellId })
    // Load home aliases plus any explicitly trusted project aliases — without
    // this, alias expansion silently failed in a fresh tab until its PTY
    // booted and replaced the context.
    try { ctx.aliases = { ...loadSushrc(initialCwd).alias } } catch {}
    contexts.set(tabId, ctx)
    return { cwd: initialCwd }
  })

  ipcMain.handle('sush:close-tab', (event, { tabId }) => {
    try {
      closePtySession(tabId)
    } finally {
      // Even if the PTY teardown throws, the per-tab maps must not leak.
      contexts.delete(tabId)
      tabMeta.delete(tabId)
      threadRoots.delete(tabId)
      try { cleanupThreadEventFile(app.getPath('userData'), tabId) } catch {}
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

  // Windows 11 desktop material (Mica / Acrylic) behind the window — the big
  // "feels like a Mac app" lever on Windows. No-op off Win11; the renderer
  // thins its base canvas (sush-material class) so the material shows through.
  ipcMain.handle('sush:set-window-material', (event, material) => {
    const win = event.sender.getOwnerBrowserWindow()
    if (!win || process.platform !== 'win32') return { ok: false, supported: false }
    const m = ['mica', 'acrylic', 'tabbed'].includes(material) ? material : 'none'
    try {
      win.setBackgroundColor('#00000000')   // let the material show, not an opaque fill
      win.setBackgroundMaterial(m)
      return { ok: true, supported: true }
    } catch {
      return { ok: false, supported: false }
    }
  })

  ipcMain.handle('sush:git-status', (event, { cwd } = {}) => getGitStatus(cwd))
  ipcMain.handle('sush:list-dir', (event, { path }) => listDirectory(path))
  ipcMain.handle('sush:dir-exists', (event, { path }) => ({ path, exists: isDirectory(path) }))
  ipcMain.handle('sush:memory-list', (event, { cwd }) => listMemoryNotes(cwd))
  ipcMain.handle('sush:memory-read', (event, { cwd, name }) => readMemoryNote(cwd, name))
  ipcMain.handle('sush:memory-write', (event, { cwd, name, content }) => writeMemoryNote(cwd, name, content))
  ipcMain.handle('sush:tasks-read', (event, { cwd }) => readTasks(cwd))
  ipcMain.handle('sush:tasks-add', (event, { cwd, task }) => addTask(cwd, task))
  ipcMain.handle('sush:tasks-update', (event, { cwd, id, patch }) => updateTask(cwd, id, patch))
  ipcMain.handle('sush:tasks-delete', (event, { cwd, id }) => deleteTask(cwd, id))

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
  ipcMain.handle('sush:users-update', (event, payload = {}) => {
    const target = activeIdentityTarget(payload)
    return target.ok ? updateUser({ ...payload, id: target.active.id }) : target
  })
  ipcMain.handle('sush:users-delete', (event, payload = {}) => {
    const target = activeIdentityTarget(payload)
    if (!target.ok) return target
    // Closing first is important on Windows: the identity home can contain CLI
    // files held open by its PTYs, and wipeData must not silently race them.
    stopIdentityRuntime({ sync: true })
    const deleted = deleteUser({ ...payload, id: target.active.id })
    return deleted.ok ? { ...deleted, signedOut: true } : deleted
  })
  ipcMain.handle('sush:factory-reset', async (event, payload = {}) => {
    if (payload.confirmation !== 'RESET SUSH') return { ok: false, error: 'Type RESET SUSH to confirm.' }
    stopIdentityRuntime({ sync: true })
    try {
      await event.sender.session.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers']
      })
      await event.sender.session.clearCache()
    } catch (error) {
      return { ok: false, error: error?.message || 'Could not clear browser storage.' }
    }
    const result = resetSushUserData({
      userData: app.getPath('userData'),
      keepLicense: payload.keepLicense === true,
      confirmation: payload.confirmation
    })
    if (!result.ok) return result
    setTimeout(() => {
      try { app.relaunch() } catch {}
      app.exit(0)
    }, 750)
    return { ...result, restarting: true }
  })
  ipcMain.handle('sush:users-activate', (event, payload) => activateUser(payload ?? {}))
  ipcMain.handle('sush:users-signout', () => {
    // Sessions belong to the signed-in identity — never leave them running
    // for the next person.
    stopIdentityRuntime()
    return signOut()
  })

  // ── OAuth providers (Google / GitHub sign-in) ─────────────────────────────
  setOauthEventSender((payload) => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('sush:oauth-event', payload)
  })
  ipcMain.handle('sush:oauth-config-get', () => ({ ...publicOauthConfig(), safeStorage: encryptionAvailable() }))
  ipcMain.handle('sush:oauth-config-set', (event, payload) => setOauthConfig(payload ?? {}))
  ipcMain.handle('sush:oauth-github-start', (event, payload) => {
    const checked = oauthStartPayload(payload)
    return checked.ok ? startGitHubFlow(checked.payload) : checked
  })
  ipcMain.handle('sush:oauth-github-cancel', () => cancelGitHubFlow())
  ipcMain.handle('sush:oauth-google-start', (event, payload) => {
    const checked = oauthStartPayload(payload)
    return checked.ok ? startGoogleFlow(checked.payload) : checked
  })
  ipcMain.handle('sush:oauth-google-cancel', () => cancelGoogleFlow())
  ipcMain.handle('sush:connect-start', (event, payload) => {
    // Provider Connect is a paid gate (Plus+). Enforced here — start is the
    // only entry point; finish/cancel require a flow this call created.
    if (!can('providerConnect')) {
      return { ok: false, error: 'Connecting provider accounts is a Plus feature. Redeem a code in Settings ▸ Plan.', locked: true }
    }
    return startConnectFlow(payload ?? {})
  })
  ipcMain.handle('sush:connect-finish', (event, payload) => finishConnectFlow(payload ?? {}))
  ipcMain.handle('sush:connect-cancel', () => cancelConnectFlow())
  ipcMain.handle('sush:connect-status', () => connectStatus())
  ipcMain.handle('sush:connect-disconnect', (event, payload) => disconnectProvider(payload ?? {}))
  ipcMain.handle('sush:connect-test', (event, payload) => testProvider(payload ?? {}))
  ipcMain.handle('sush:oauth-unlink', (event, { userId, provider } = {}) => {
    const target = activeIdentityTarget({ userId }, 'userId')
    if (!target.ok) return target
    const res = unlinkProvider({ id: target.active.id, provider })
    if (res.ok && provider === 'github') {
      deleteToken(target.active.id, 'github')
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

  ipcMain.handle('sush:open-in-editor', async (event, { cwd }) => {
    const dir = resolveStartCwd(cwd)
    const bin = resolveExecutable('code')
    if (!bin) return { ok: false, error: 'VS Code (`code`) not found on PATH' }
    const { file, args } = shimSpawnSpec(bin, ['.'])
    return launchDetached(file, args, { cwd: dir, windowsHide: true })
  })

  // ── Seducia via local agent CLIs (no API key) ─────────────────────────────
  ipcMain.handle('sush:seducia-cli', (event, { prompt, cwd, engine, limitPolicy }) => {
    if (!getActiveUser()) return { ok: false, engine, error: 'Sign in to an identity first.' }
    // A specific-but-unsupported engine (e.g. 'opencode', which has no stdin
    // mode) must NOT silently fall back to claude — that would answer as the
    // wrong model under the user's nose. Only an unset/empty engine defaults
    // to claude (the 'auto' cascade in lib/ai.js always resolves to a concrete
    // engine before it reaches here).
    if (engine && !SEDUCIA_ENGINES[engine]) {
      return { ok: false, engine, error: `\`${engine}\` can't drive Seducia chat (no stdin mode). Supported engines: ${CHAT_ENGINES.join(', ')}. You can still launch it as an agent.` }
    }
    const id = SEDUCIA_ENGINES[engine] ? engine : 'claude'
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
  ipcMain.handle('sush:accounts-add', requireUser((user, { provider, label }) => {
    // Tier gate: a plan caps how many account slots one CLI can hold. The
    // hard ceiling (MAX_SLOTS in accounts.js) still applies above this.
    const cap = featuresOf().slots
    const current = listAccounts(user.id).providers?.[provider]?.slots?.length || 0
    if (current >= cap) {
      return { ok: false, error: `Your plan allows ${cap} account${cap === 1 ? '' : 's'} per CLI. Redeem a code in Settings ▸ Plan to add more.`, locked: true }
    }
    return addAccount(user.id, provider, label)
  }))
  ipcMain.handle('sush:accounts-switch', requireUser((user, { provider, slotId }) => switchAccount(user.id, provider, slotId)))
  ipcMain.handle('sush:accounts-remove', requireUser((user, { provider, slotId }) => removeAccount(user.id, provider, slotId)))
  ipcMain.handle('sush:accounts-rename', requireUser((user, { provider, slotId, label }) => renameAccount(user.id, provider, slotId, label)))
  ipcMain.handle('sush:accounts-set-policy', requireUser((user, { provider, policy }) => setLimitPolicy(user.id, provider, policy)))
  // On-demand usage scrape for one account slot. Spawns the CLI with that
  // slot's env, reads its usage view, caches the parsed bars. Never auto-polled
  // (one real CLI spawn per call) — only the per-account refresh button calls it.
  ipcMain.handle('sush:accounts-usage-read', requireUser(async (user, { provider, slotId, doctor }) => {
    const parsed = await readAccountUsage(user.id, provider, slotId, { doctor })
    if (!parsed.ok) return parsed
    return setAccountUsage(user.id, provider, slotId, parsed.usage)
  }))

  // ── Claude Code panel (stream-json driver) ────────────────────────────────
  setClaudePanelSender((payload) => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('sush:claude-panel-event', payload)
  })
  ipcMain.handle('sush:claude-panel-start', (event, payload) => {
    if (!getActiveUser()) return { ok: false, error: 'no-user' }
    return startClaudePanelRun(payload ?? {})
  })
  ipcMain.handle('sush:claude-panel-stop', (event, payload) => stopClaudePanelRun(payload ?? {}))
  ipcMain.handle('sush:claude-limits-get', () => getClaudeLimits())
  ipcMain.handle('sush:claude-limits-check', () => getActiveUser() ? checkClaudeLimits() : { ok: false, error: 'no-user' })

  // ── Cloud TTS (Seducia's voice) ───────────────────────────────────────────
  // The user's own OpenAI/ElevenLabs key lives here and never reaches the
  // renderer; the renderer sends text, main returns audio bytes to play.
  ipcMain.handle('sush:tts-config-get', () => getTtsConfigPublic())
  ipcMain.handle('sush:tts-config-set', (event, payload = {}) => {
    // Cloud voices are a paid tier; the system (SAPI) voice is always free.
    if (payload.provider && payload.provider !== 'system' && !can('cloudTts')) {
      return { ok: false, error: 'Cloud voices are a Plus feature. Redeem a code in Settings ▸ Plan.', locked: true, ...getTtsConfigPublic() }
    }
    return setTtsConfig(payload)
  })
  ipcMain.handle('sush:tts-synthesize', (event, payload = {}) => {
    // If the tier lapsed (e.g. a trial code expired) fall back to system voice
    // rather than keep calling the paid API on a config that's no longer unlocked.
    if (!can('cloudTts')) return { ok: false, fallback: true }
    return synthesizeTts(payload)
  })

  // ── Whisper dictation + Quiet Credits ─────────────────────────────────────
  // The transcription key lives in main (never crosses to the renderer); the
  // renderer sends captured mic bytes and gets text back. Dictation is metered
  // by the local Quiet Credits bucket, gated per tier — available to everyone
  // (free tier gets a small monthly allowance), so it's never license-locked.
  ipcMain.handle('sush:stt-config-get', () => getSttConfigPublic())
  ipcMain.handle('sush:stt-config-set', (event, payload = {}) => setSttConfig(payload))
  ipcMain.handle('sush:stt-transcribe', (event, payload = {}) => transcribe(payload))
  ipcMain.handle('sush:credits-get', () => getCredits())
  ipcMain.handle('sush:credits-reset', () => resetCredits())

  // ── License / tiers (offline unlock codes) ────────────────────────────────
  // One broadcast path for every license change — redeemCode/clearLicense emit
  // through this whether they're called from IPC or the `unlock` shell command.
  setLicenseChangeSender((pub) => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('sush:license-changed', pub)
  })
  ipcMain.handle('sush:license-get', () => licensePublic())
  ipcMain.handle('sush:license-redeem', (event, { code } = {}) => {
    const r = redeemCode(code)
    return r.ok ? { ...r, ...licensePublic() } : r
  })
  ipcMain.handle('sush:license-clear', () => {
    const r = clearLicense()
    return { ...r, ...licensePublic() }
  })

  // ── Battery / power source (auto power-saver) ──────────────────────────────
  // One si.battery() read on demand (the renderer polls slowly). powerMonitor
  // events nudge the renderer to re-poll the moment the charger goes in/out, so
  // auto power-saver flips without waiting for the next poll tick.
  ipcMain.handle('sush:battery-status', async () => {
    try {
      const b = await si.battery()
      return {
        ok: true,
        hasBattery: !!b.hasBattery,
        percent: Math.max(0, Math.min(100, Math.round(b.percent ?? 100))),
        charging: !!b.isCharging || !!b.acConnected
      }
    } catch {
      return { ok: false, hasBattery: false, percent: 100, charging: true }
    }
  })
  try {
    const safeOnBattery = () => { try { return powerMonitor.isOnBatteryPower() } catch { return false } }
    const pushPower = () => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('sush:power-changed', { onBattery: safeOnBattery() }) }
    powerMonitor.removeAllListeners('on-battery')
    powerMonitor.removeAllListeners('on-ac')
    powerMonitor.on('on-battery', pushPower)
    powerMonitor.on('on-ac', pushPower)
  } catch {}

  // ── Usage snapshot (the Usage settings panel) ─────────────────────────────
  // Cheap, spawn-free aggregate the Usage panel polls on a timer: per-CLI
  // install state (cached presence), the active account slot + last saved
  // provider health/usage, when it last hit a limit, and the LAST CAPTURED
  // Claude rate-limit window. This handler never launches a CLI: on-demand
  // checks are the only path that can spawn a provider process.
  ipcMain.handle('sush:usage-snapshot', () => {
    const user = getActiveUser()
    const providers = (user ? listAccounts(user.id) : {}).providers || {}
    const activeOf = (p) => {
      const st = providers[p]
      if (!st) return null
      const slot = st.slots?.find(s => s.id === st.active)
      return slot ? {
        id: slot.id,
        label: slot.label,
        lastLimitAt: slot.lastLimitAt || null,
        usage: slot.usage || null,
        count: st.slots.length
      } : null
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
      gemini: { installed: present('gemini'), account: activeOf('gemini') },
      opencode: { installed: present('opencode'), account: activeOf('opencode') },
      grok: { installed: present('grok'), account: activeOf('grok') }
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

  // ── Provider capabilities (Nightly model/reasoning/resume menus) ─────────
  // Only what the installed CLI's own --version/--help output shows; unknowns
  // stay null. Nothing account-specific is probed, so no credentials or
  // identity env are involved and a login change needs no re-probe.
  ipcMain.handle('sush:provider-capabilities', async (event, { refresh } = {}) => {
    try {
      return { ok: true, providers: await providerCaps.all({ refresh: refresh === true }) }
    } catch (e) {
      return { ok: false, error: e?.message || 'capability probe failed' }
    }
  })

  // ── Same-session structured Thread (Claude first) ────────────────────────
  // The renderer never supplies a transcript path. It asks by Sush tab id;
  // main resolves the path captured from Claude's own hook payload and only
  // reads a JSONL path structurally tied to that exact session id.
  ipcMain.handle('sush:thread-read', (event, { tabId, since } = {}) => {
    try {
      const bound = threadRoots.get(tabId)
      const result = readThread(app.getPath('userData'), tabId, { roots: bound?.roots, provider: bound?.provider || 'claude' })
      if (since && result?.stamp && result.stamp === since) return { ok: true, unchanged: true, stamp: result.stamp }
      return result
    } catch (e) {
      return { ok: false, error: e?.message || 'thread read failed' }
    }
  })

  // Gemini Thread is opt-in: Sush adds one inert hook to the user's Gemini
  // settings (and removes exactly that hook again on opt-out).
  ipcMain.handle('sush:gemini-thread', (event, { enable } = {}) => {
    const env = { ...process.env, ...activeUserEnv() }
    try {
      if (typeof enable === 'boolean') return { ok: true, enabled: setGeminiThreadHooks(env, enable, process.platform) }
      return { ok: true, enabled: geminiThreadHooksEnabled(readGeminiSettings(env).settings) }
    } catch (e) {
      return { ok: false, error: e?.message || 'could not update Gemini settings' }
    }
  })

  ipcMain.handle('sush:gemini-compression', (event, { threshold = null } = {}) => {
    try {
      const env = { ...process.env, ...activeUserEnv() }
      return { ok: true, threshold: setGeminiCompressionThreshold(env, threshold) }
    } catch (e) {
      return { ok: false, error: e?.message || 'could not update Gemini settings' }
    }
  })

  // ── Scrollback (for session handoff cards) ────────────────────────────────
  ipcMain.handle('sush:get-scrollback', (event, { tabId, chars }) => {
    return { tabId, text: scrollback?.tail(tabId, chars) ?? '' }
  })

  // Cross-session output search for the Hunt overlay (Ctrl+Shift+F) — the
  // `hunt` command's engine with labels resolved, so the renderer can paint
  // rows and jump to a live session without re-implementing the search.
  ipcMain.handle('sush:hunt-search', (event, { term } = {}) => {
    if (!scrollback) return { ok: true, results: [] }
    const active = getActiveUser()
    const savedKeyPrefix = `u:${active?.id ?? 'solo'}:`
    const savedLabel = (key) => {
      const seg = String(key || '').split(/[\\/:]/).filter(Boolean).pop()
      return seg || 'saved session'
    }
    const results = scrollback.search(term, { savedKeyPrefix }).map(r => ({
      ...r,
      label: r.saved ? savedLabel(r.key) : (ptySessions.get(r.tabId)?.label || r.tabId)
    }))
    return { ok: true, results }
  })

  // ── Snippets (one store: ~/.sush/snippets.json, shared with the `snippet`
  // shell command — the panel used to keep a private localStorage silo) ─────
  ipcMain.handle('sush:snippets-list', () => {
    const snips = loadSnippets()
    return { ok: true, snippets: Object.entries(snips).map(([name, command]) => ({ name, command: String(command) })) }
  })
  ipcMain.handle('sush:snippets-set', async (event, { name, command } = {}) => {
    const key = String(name ?? '').trim().slice(0, 80)
    const cmd = String(command ?? '').trim().slice(0, 500)
    if (!key || !cmd) return { ok: false, error: 'Name and command are required' }
    const snips = loadSnippets()
    snips[key] = cmd
    try { await saveSnippets(snips) } catch (e) { return { ok: false, error: e.message } }
    return { ok: true }
  })
  ipcMain.handle('sush:snippets-delete', async (event, { name } = {}) => {
    const snips = loadSnippets()
    if (!(String(name) in snips)) return { ok: true }
    delete snips[String(name)]
    try { await saveSnippets(snips) } catch (e) { return { ok: false, error: e.message } }
    return { ok: true }
  })

  // ── .sushrc profile ───────────────────────────────────────────────────────
  ipcMain.handle('sush:sushrc-read', () => readSushrcRaw())
  ipcMain.handle('sush:sushrc-write', (event, { content }) => writeSushrcRaw(content))
  ipcMain.handle('sush:sushrc-path', () => ({ path: sushrcPath() }))

  // ── File operations ──────────────────────────────────────────────────────
  ipcMain.handle('sush:read-file', async (event, payload = {}) => {
    const { path: filePath } = payload || {}
    const target = guardedFsTarget(filePath)
    if (!target.ok) return target
    const { readFile: rf, stat } = await import('fs/promises')
    try {
      const info = await stat(target.path)
      if (info.isDirectory()) return { ok: false, error: 'Path is a directory' }
      // Cap the read. This handler backs "open this file in the panel", and
      // every consumer is a text editor or viewer — nothing here wants a
      // gigabyte. Without the cap, `read-file` on a core dump or a video
      // decoded the whole thing into a UTF-8 string on the main process and
      // froze the entire app (or hit V8's string limit and threw a
      // useless "Invalid string length"). Refuse early, and say the size.
      if (info.size > READ_FILE_MAX_BYTES) {
        return {
          ok: false,
          error: `File is ${formatBytes(info.size)} — too large to open here (limit ${formatBytes(READ_FILE_MAX_BYTES)}).`
        }
      }
      const content = await rf(target.path, 'utf8')
      return { ok: true, content }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('sush:write-file', async (event, payload = {}) => {
    const { path: filePath, content } = payload || {}
    const target = guardedFsTarget(filePath)
    if (target.ok && sensitiveWritePath(target.path)) {
      return { ok: false, error: 'Sush does not write credential or shell startup files — edit them in a terminal.' }
    }
    if (!target.ok) return target
    const { writeFile: wf, stat } = await import('fs/promises')
    try {
      try {
        const info = await stat(target.path)
        if (info.isDirectory()) return { ok: false, error: 'Path is a directory' }
      } catch (e) {
        if (e?.code !== 'ENOENT') throw e
      }
      await wf(target.path, String(content ?? ''), 'utf8')
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
  ipcMain.handle('sush:git-stage', async (event, { cwd, file } = {}) => {
    const dir = existingDirectory(cwd)
    if (!dir) return { ok: false, error: 'Working directory does not exist' }
    if (typeof file !== 'string' || !file || file.includes('\0')) return { ok: false, error: 'A valid file path is required' }
    try {
      await execFileAsync('git', ['-c', 'core.quotepath=false', 'add', '--', String(file || '')], { cwd: dir, windowsHide: true, encoding: 'utf8' })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('sush:git-unstage', async (event, { cwd, file } = {}) => {
    const dir = existingDirectory(cwd)
    if (!dir) return { ok: false, error: 'Working directory does not exist' }
    if (typeof file !== 'string' || !file || file.includes('\0')) return { ok: false, error: 'A valid file path is required' }
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

  ipcMain.handle('sush:git-commit', async (event, { cwd, message } = {}) => {
    const dir = existingDirectory(cwd)
    if (!dir) return { ok: false, error: 'Working directory does not exist' }
    const msg = String(message || '').trim().slice(0, 10000)
    if (!msg) return { ok: false, error: 'Empty commit message' }
    try {
      const { stdout } = await execFileAsync('git', ['commit', '-m', msg], { cwd: dir, windowsHide: true, encoding: 'utf8' })
      return { ok: true, output: stdout.trim() }
    } catch (e) {
      const out = ((e.stdout || '') + (e.stderr || '')).trim()
      return { ok: false, error: out || e.message }
    }
  })

  ipcMain.handle('sush:git-diff-staged', async (event, { cwd } = {}) => {
    const dir = existingDirectory(cwd)
    if (!dir) return { ok: false, diff: '', error: 'Working directory does not exist' }
    try {
      const { stdout } = await execFileAsync('git', ['diff', '--cached', '--stat'], { cwd: dir, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 })
      return { ok: true, diff: stdout.trim() }
    } catch (e) {
      return { ok: false, diff: '', error: e.message }
    }
  })

  // Whole working tree against HEAD (staged + unstaged, tracked files) for the
  // Nightly diff panel. Untracked files still go through sush:git-diff-file.
  ipcMain.handle('sush:git-diff-head', async (event, { cwd } = {}) => {
    const dir = existingDirectory(cwd)
    if (!dir) return { ok: false, diff: '', error: 'Working directory does not exist' }
    try {
      const run = (base) => execFileAsync('git', ['-c', 'core.quotepath=false', 'diff', ...base, '--no-color', '--no-ext-diff', '--no-textconv', '-M'], {
        cwd: dir, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024
      })
      // A repo with no commits has no HEAD: show what is staged instead.
      const hasHead = await execFileAsync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: dir, windowsHide: true })
        .then(() => true, () => false)
      const { stdout } = await run(hasHead ? ['HEAD'] : ['--cached'])
      return { ok: true, ...clipDiff(stdout, 300_000) }
    } catch (e) {
      // Over the buffer: the diff is too large to show; say so rather than fail.
      if (e?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' || /maxBuffer/i.test(String(e?.message))) {
        return { ok: true, diff: '', truncated: true, tooLarge: true }
      }
      return { ok: false, diff: '', error: e?.message || 'git diff failed' }
    }
  })

  // One file's diff for the Changes pane. Path is validated (repo-relative,
  // no traversal, never option-shaped) and output is size-capped.
  ipcMain.handle('sush:git-diff-file', async (event, { cwd, path, staged, untracked } = {}) => {
    const dir = existingDirectory(cwd)
    if (!dir) return { ok: false, diff: '', error: 'Working directory does not exist' }
    const args = diffArgs({ path, staged: staged === true, untracked: untracked === true, nullDevice: process.platform === 'win32' ? 'NUL' : '/dev/null' })
    if (!args) return { ok: false, diff: '', error: 'Invalid file path' }
    try {
      const { stdout } = await execFileAsync('git', args, { cwd: dir, windowsHide: true, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
      return { ok: true, ...clipDiff(stdout) }
    } catch (e) {
      // `git diff --no-index` exits 1 when the files differ; the diff is on stdout.
      if (untracked === true && typeof e?.stdout === 'string' && e.stdout) return { ok: true, ...clipDiff(e.stdout) }
      return { ok: false, diff: '', error: e?.message || 'git diff failed' }
    }
  })

  // ── Git worktrees (isolated swarms) ───────────────────────────────────────
  // Give each agent in a swarm its own working copy of the repo so parallel
  // agents never trample each other's checkout. Creates (or reuses) a worktree
  // under <repoRoot>/.sush-worktrees/<name> on a dedicated `sush/<name>` branch
  // and returns its path for the session to spawn in.
  ipcMain.handle('sush:git-worktree-add', async (event, { cwd, name } = {}) => {
    if (!can('developerWorkflows')) {
      return { ok: false, error: 'Isolated worktrees are available on Dev, Max, and Enterprise.' }
    }
    const dir = existingDirectory(cwd)
    if (!dir) return { ok: false, error: 'Working directory does not exist' }
    const safe = String(name ?? '').trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
    if (!safe || safe === '.' || safe === '..') return { ok: false, error: 'A valid worktree name is required' }
    try {
      const root = (await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, windowsHide: true, encoding: 'utf8' })).stdout.trim()
      if (!root) return { ok: false, error: 'Not a git repository' }
      const wtDir = join(root, '.sush-worktrees', safe)
      const branch = `sush/${safe}`
      // Already there (a re-launch of the same crew) → reuse it.
      if (existsSync(wtDir)) return { ok: true, path: wtDir, branch, reused: true }
      mkdirSync(join(root, '.sush-worktrees'), { recursive: true })

      // Prefer a fresh branch off HEAD; if it already exists, check it out into
      // the new worktree instead of failing.
      try {
        await execFileAsync('git', ['worktree', 'add', '-b', branch, wtDir, 'HEAD'], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 60000 })
      } catch (e) {
        if (/already (exists|used)/i.test(e.stderr || e.message || '')) {
          await execFileAsync('git', ['worktree', 'add', wtDir, branch], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 60000 })
        } else {
          throw e
        }
      }
      return { ok: true, path: wtDir, branch }
    } catch (e) {
      return { ok: false, error: (e.stderr || e.message || 'git worktree failed').trim().slice(0, 300) }
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
    // Renderer bugs must not leak OS watcher handles forever.
    if (!fileWatchers.has(watchId) && fileWatchers.size >= 64) {
      return { ok: false, error: 'Too many active file watchers' }
    }
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
