import { app, BrowserWindow, ipcMain, clipboard, shell } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, statSync } from 'fs'
import { execFile } from 'child_process'
import { spawnPty, resolveShell, listShells } from './pty'
import { scanSush, applyImport, clearProfile, loadProfile, aliasCommandsFor } from './import'

// ── Sush Air ────────────────────────────────────────────────────────────────
//
// A terminal, and nothing else. Sessions, tabs, a palette, a `:` command layer,
// split view, find, notes. No identity system, no licence gate, no agents, no
// account rotation, no metrics polling, no webview, no network code at all.
//
// Air has been two things before this. It was a Tauri app, and it died because
// a second product in one repository is a second product to keep in sync. Then
// it was a window inside Sush, and that was worse in a quieter way: everything
// Air refused to carry was still one import away, and "light" became a promise
// about restraint rather than a fact about the binary.
//
// It is its own application now. Its own package.json, its own build, its own
// settings directory, its own installer. Uninstall Sush and Air does not
// notice. That is the version of light a user can actually verify.

const sessions = new Map()   // tabId -> { proc, cwd, shellId }
let win = null

// The ceiling from the original brief, enforced HERE and not only in the tab
// strip. The renderer's cap is an affordance; this one is the limit.
const MAX_TABS = 12

function existingDirectory(candidate) {
  const dir = candidate && String(candidate).trim()
  if (!dir) return null
  try {
    return existsSync(dir) && statSync(dir).isDirectory() ? dir : null
  } catch {
    return null
  }
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

// Kill the shell AND whatever it started. On Windows a plain proc.kill() leaves
// children — a dev server, a watcher — alive and still holding their ports.
function closeSession(tabId, { sync = false } = {}) {
  const session = sessions.get(tabId)
  if (!session) return
  sessions.delete(tabId)
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

function closeAllSessions({ sync = false } = {}) {
  for (const tabId of [...sessions.keys()]) closeSession(tabId, { sync })
}

// Imported aliases and startup commands are written into the shell once it is
// actually up. Writing them at spawn time races the shell's own initialisation
// and they get eaten by whatever is still printing its banner.
function primeSession(session, tabId) {
  const profile = loadProfile()
  const lines = [
    ...aliasCommandsFor(session.shellId, profile.aliases),
    ...profile.startup
  ]
  if (!lines.length) return
  setTimeout(() => {
    if (sessions.get(tabId) !== session) return   // closed or restarted meanwhile
    try { session.proc.write(lines.join('\r') + '\r') } catch {}
  }, 350)
}

export function registerHandlers() {
  ipcMain.handle('air:pty-start', (event, payload = {}) => {
    const { tabId, cols, rows, cwd, shellId } = payload
    if (!tabId) throw new Error('A session id is required.')

    // Restarting an existing tab is fine; a genuinely new one counts.
    if (!sessions.has(tabId) && sessions.size >= MAX_TABS) {
      throw new Error(`Air holds ${MAX_TABS} sessions. Close one first.`)
    }
    closeSession(tabId)

    const profile = loadProfile()
    const requested = resolveShell(shellId || undefined)
    const startCwd = existingDirectory(cwd) || existingDirectory(profile.cwd) || homedir()

    const importedEnv = {}
    for (const { name, value } of profile.env) importedEnv[name] = value

    const { proc, shell: actual } = spawnPty(requested, {
      cols,
      rows,
      cwd: startCwd,
      env: {
        ...process.env,
        ...importedEnv,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        // Air runs in the host environment on purpose. It is not an identity
        // sandbox and pretending otherwise would be the dishonest kind of
        // light. SUSH_AIR lets a shell profile tell which app it is in.
        SUSH_AIR: '1'
      }
    })

    const session = { proc, cwd: startCwd, shellId: actual.id }
    sessions.set(tabId, session)

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
      sessions.delete(tabId)
      send('air:pty-exit', { tabId, exitCode })
    })

    primeSession(session, tabId)

    return { tabId, cwd: startCwd, shellId: actual.id, shellLabel: actual.label }
  })

  ipcMain.on('air:pty-input', (event, { tabId, data } = {}) => {
    // node-pty throws if the PTY died between the renderer's check and this
    // write. An uncaught throw here would take down the whole main process.
    try { sessions.get(tabId)?.proc.write(data) } catch {}
  })

  ipcMain.on('air:pty-resize', (event, { tabId, cols, rows } = {}) => {
    try {
      sessions.get(tabId)?.proc.resize(Math.max(2, Number(cols) || 80), Math.max(2, Number(rows) || 24))
    } catch {}
  })

  ipcMain.handle('air:pty-close', (event, { tabId } = {}) => {
    closeSession(tabId)
    return { ok: true }
  })

  ipcMain.handle('air:shells', () => listShells())

  ipcMain.handle('air:cwd', (event, { tabId } = {}) => sessions.get(tabId)?.cwd ?? homedir())

  ipcMain.handle('air:copy', (event, text) => {
    clipboard.writeText(String(text ?? ''))
    return true
  })

  ipcMain.handle('air:paste', () => clipboard.readText())

  ipcMain.handle('air:open-external', (event, url) => {
    // Only ever hand http(s) to the OS. Without this check a file:// or a
    // custom-scheme URL from terminal output would launch whatever is
    // registered for it.
    if (!/^https?:\/\//i.test(String(url || ''))) return { ok: false }
    shell.openExternal(String(url))
    return { ok: true }
  })

  ipcMain.handle('air:window', (event, action) => {
    if (!win || win.isDestroyed()) return
    if (action === 'minimize') win.minimize()
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize()
    else if (action === 'close') win.close()
  })

  // ── Import from Sush ──
  ipcMain.handle('air:import-scan', () => scanSush())
  ipcMain.handle('air:import-apply', (event, { keep } = {}) => applyImport(keep))
  ipcMain.handle('air:import-clear', () => clearProfile())
  ipcMain.handle('air:profile', () => loadProfile())

  app.once('before-quit', () => closeAllSessions({ sync: true }))
}

export function createWindow({ icon } = {}) {
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
    return win
  }

  win = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 460,
    minHeight: 320,
    frame: false,
    icon,
    backgroundColor: '#0a0b0d',
    title: 'Sush Air',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
      // No webviewTag. Air has no browser panel and never should.
    },
    titleBarStyle: 'hidden'
  })

  // Paint once, rather than showing an empty frame and then filling it.
  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Air's preload is narrow, but it is still a preload — don't let this
  // webContents navigate anywhere other than Air's own document.
  const keepRenderer = (event, url) => {
    const dev = process.env.ELECTRON_RENDERER_URL
    const target = String(url)
    const ok = dev
      ? target === dev || target === `${dev}/` || target.startsWith(new URL('index.html', dev).href)
      : target.endsWith('/index.html')
    if (!ok) event.preventDefault()
  }
  win.webContents.on('will-navigate', keepRenderer)
  win.webContents.on('will-redirect', keepRenderer)

  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return
    const toggle = input.key === 'F12' ||
      ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i')
    if (toggle) win.webContents.toggleDevTools()
  })

  win.on('closed', () => {
    closeAllSessions()
    win = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
