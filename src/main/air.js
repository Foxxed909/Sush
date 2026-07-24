import { app, BrowserWindow, ipcMain, clipboard, shell } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, statSync } from 'fs'
import { execFile } from 'child_process'
import { spawnPty } from './shell/spawn'
import { getDefaultShell } from './ipc'

// ── Sush Air ────────────────────────────────────────────────────────────────
//
// The small one. Air is a real terminal and nothing else: PTY sessions, tabs,
// a command palette, a `:` command layer, split view, find, notes. It has no
// identity system, no license gate, no agent orchestration, no account
// rotation, no system-metrics polling, no webview.
//
// That list is the whole point. The first Sush Air was a separate Tauri/Rust
// app and it died because it carried its own build, its own dependency tree
// and its own feature boundary — three things to keep in sync forever. This
// Air is a second window of the same Electron app: one dependency tree, one
// build, one place where a PTY gets spawned. What makes it "light" is the
// surface it exposes, not a second toolchain.
//
// Air deliberately does NOT load the privileged `preload/index.js` bridge. It
// gets `preload/air.js`, which can reach exactly the handlers registered
// below — all namespaced `air:`. A bug in Air's renderer cannot read a
// license, enumerate users, touch the OAuth token store, or run a registered
// shell command, because those channels are not on its bridge at all.

const airSessions = new Map()   // tabId -> { proc, cwd, shellId }
let airWin = null
let airHandlersRegistered = false

// Same ceiling the brief asked for. Enforced HERE, not just in the renderer:
// the renderer's tab strip is a UI affordance, this is the actual limit.
const MAX_AIR_TABS = 12

function existingDirectory(candidate) {
  const dir = candidate && String(candidate).trim()
  if (!dir) return null
  try {
    return existsSync(dir) && statSync(dir).isDirectory() ? dir : null
  } catch {
    return null
  }
}

function resolveCwd(requested) {
  return existingDirectory(requested) || homedir()
}

function send(channel, payload) {
  if (airWin && !airWin.isDestroyed()) airWin.webContents.send(channel, payload)
}

// Kill the shell AND whatever it started. On Windows a plain proc.kill() leaves
// children (a dev server, a watcher) alive and still holding their ports.
function closeAirSession(tabId, { sync = false } = {}) {
  const session = airSessions.get(tabId)
  if (!session) return
  airSessions.delete(tabId)
  const { proc } = session
  if (process.platform === 'win32' && proc?.pid) {
    const args = ['/PID', String(proc.pid), '/T', '/F']
    // Async on the normal path — a synchronous taskkill freezes the UI for as
    // long as the tree takes to die. Only quit can afford to block, and there
    // it is required: the process is about to stop pumping its event loop.
    try {
      if (sync) execFile('taskkill', args, { windowsHide: true })
      else execFile('taskkill', args, { windowsHide: true }, () => {})
    } catch {}
  }
  try { proc?.kill() } catch {}
}

function closeAllAirSessions({ sync = false } = {}) {
  for (const tabId of [...airSessions.keys()]) closeAirSession(tabId, { sync })
}

function registerAirHandlers() {
  if (airHandlersRegistered) return
  airHandlersRegistered = true

  ipcMain.handle('air:pty-start', (event, payload = {}) => {
    const { tabId, cols, rows, cwd, shellId } = payload
    if (!tabId) throw new Error('A session id is required.')

    // Restarting an existing tab is fine; a genuinely new one counts.
    if (!airSessions.has(tabId) && airSessions.size >= MAX_AIR_TABS) {
      throw new Error(`Air holds ${MAX_AIR_TABS} sessions. Close one first.`)
    }
    closeAirSession(tabId)

    const shell = getDefaultShell(shellId || undefined)
    const startCwd = resolveCwd(cwd)
    const { proc, shell: actual } = spawnPty(shell, {
      cols,
      rows,
      cwd: startCwd,
      // Air runs in the host environment on purpose — it is not the identity
      // sandbox, and pretending otherwise would be the dishonest kind of
      // "light". SUSH_AIR lets a shell profile tell the difference.
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', SUSH: '1', SUSH_AIR: '1' }
    })

    const session = { proc, cwd: startCwd, shellId: actual.id }
    airSessions.set(tabId, session)

    proc.onData((data) => {
      // OSC 7 is how the shell reports its real directory. Track it so `:cwd`
      // and a new tab inherit where you actually are, not where you started.
      const match = /\x1b]7;file:\/\/[^/]*(\/[^\x07\x1b]*)(?:\x07|\x1b\\)/.exec(data)
      if (match) {
        let reported = decodeURIComponent(match[1])
        if (process.platform === 'win32') reported = reported.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\')
        const dir = existingDirectory(reported)
        if (dir && dir !== session.cwd) {
          session.cwd = dir
          send('air:pty-cwd', { tabId, cwd: dir })
        }
      }
      send('air:pty-data', { tabId, data })
    })

    proc.onExit(({ exitCode }) => {
      airSessions.delete(tabId)
      send('air:pty-exit', { tabId, exitCode })
    })

    return { tabId, cwd: startCwd, shellId: actual.id, shellLabel: actual.label }
  })

  ipcMain.on('air:pty-input', (event, { tabId, data } = {}) => {
    // node-pty throws if the PTY died between the renderer's check and this
    // write. An uncaught throw here would take down the whole main process.
    try { airSessions.get(tabId)?.proc.write(data) } catch {}
  })

  ipcMain.on('air:pty-resize', (event, { tabId, cols, rows } = {}) => {
    try {
      airSessions.get(tabId)?.proc.resize(Math.max(2, Number(cols) || 80), Math.max(2, Number(rows) || 24))
    } catch {}
  })

  ipcMain.handle('air:pty-close', (event, { tabId } = {}) => {
    closeAirSession(tabId)
    return { ok: true }
  })

  ipcMain.handle('air:shells', () => {
    const ids = process.platform === 'win32' ? ['powershell', 'pwsh', 'cmd'] : ['zsh', 'bash', 'sh']
    const seen = new Set()
    const shells = []
    for (const id of ids) {
      try {
        const resolved = getDefaultShell(id)
        // getDefaultShell falls back when a shell isn't installed, so dedupe on
        // what it actually resolved to rather than on what we asked for.
        if (seen.has(resolved.id)) continue
        seen.add(resolved.id)
        shells.push({ id: resolved.id, label: resolved.label })
      } catch {}
    }
    return { shells, defaultId: shells[0]?.id ?? null }
  })

  ipcMain.handle('air:cwd', (event, { tabId } = {}) => airSessions.get(tabId)?.cwd ?? homedir())

  ipcMain.handle('air:copy', (event, text) => {
    clipboard.writeText(String(text ?? ''))
    return true
  })

  ipcMain.handle('air:paste', () => clipboard.readText())

  ipcMain.handle('air:open-external', (event, url) => {
    // Only ever hand http(s) to the OS. Without this check a `file://` or a
    // custom-scheme URL from terminal output would launch whatever is
    // registered for it.
    if (!/^https?:\/\//i.test(String(url || ''))) return { ok: false }
    shell.openExternal(String(url))
    return { ok: true }
  })

  ipcMain.handle('air:window', (event, action) => {
    if (!airWin || airWin.isDestroyed()) return
    if (action === 'minimize') airWin.minimize()
    else if (action === 'maximize') airWin.isMaximized() ? airWin.unmaximize() : airWin.maximize()
    else if (action === 'close') airWin.close()
  })

  app.once('before-quit', () => closeAllAirSessions({ sync: true }))
}

export function createAirWindow({ icon } = {}) {
  if (airWin && !airWin.isDestroyed()) {
    airWin.show()
    airWin.focus()
    return airWin
  }

  airWin = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 460,
    minHeight: 320,
    frame: false,
    icon,
    backgroundColor: '#0a0b0d',
    title: 'Sush Air',
    webPreferences: {
      preload: join(__dirname, '../preload/air.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
      // No webviewTag. Air has no browser panel and never should.
    },
    titleBarStyle: 'hidden'
  })

  airWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Air's preload is narrow, but it is still a preload — don't let this
  // webContents navigate anywhere other than Air's own document.
  const keepAirRenderer = (event, url) => {
    const ok = process.env.NODE_ENV === 'development' && process.env.ELECTRON_RENDERER_URL
      ? String(url).startsWith(new URL('air.html', process.env.ELECTRON_RENDERER_URL).href)
      : String(url).endsWith('/air.html')
    if (!ok) event.preventDefault()
  }
  airWin.webContents.on('will-navigate', keepAirRenderer)
  airWin.webContents.on('will-redirect', keepAirRenderer)

  airWin.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return
    const toggle = input.key === 'F12' ||
      ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i')
    if (toggle) airWin.webContents.toggleDevTools()
  })

  airWin.on('closed', () => {
    closeAllAirSessions()
    airWin = null
  })

  registerAirHandlers()

  if (process.env.NODE_ENV === 'development' && process.env.ELECTRON_RENDERER_URL) {
    airWin.loadURL(new URL('air.html', process.env.ELECTRON_RENDERER_URL).href)
  } else {
    airWin.loadFile(join(__dirname, '../renderer/air.html'))
  }

  return airWin
}

export function airWindowOpen() {
  return !!(airWin && !airWin.isDestroyed())
}
