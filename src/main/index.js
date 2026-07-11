import { app, BrowserWindow, shell, session } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { existsSync } from 'fs'
import { registerIpcHandlers } from './ipc'

const trustedRendererContents = new Set()

function isTrustedRendererUrl(raw) {
  try {
    const url = new URL(String(raw || ''))
    if (process.env.NODE_ENV === 'development' && process.env.ELECTRON_RENDERER_URL) {
      return url.origin === new URL(process.env.ELECTRON_RENDERER_URL).origin
    }
    return url.href === pathToFileURL(join(__dirname, '../renderer/index.html')).href
  } catch {
    return false
  }
}

function trustedPermissionSource(contents, sourceUrl) {
  const source = String(sourceUrl || '')
  return !!contents &&
    trustedRendererContents.has(contents.id) &&
    isTrustedRendererUrl(contents.getURL()) &&
    (!source || source === 'file://' || isTrustedRendererUrl(source))
}

function installPermissionPolicy() {
  const ses = session.defaultSession
  // Electron approves permission requests by default. The right-panel webview
  // intentionally loads arbitrary sites, so deny its camera/mic/location/etc.
  // The local Sush renderer remains trusted (it needs microphone access for Hush).
  ses.setPermissionCheckHandler((contents, _permission, requestingOrigin, details) => {
    const source = details?.requestingUrl || details?.securityOrigin || requestingOrigin
    return trustedPermissionSource(contents, source)
  })
  ses.setPermissionRequestHandler((contents, _permission, callback, details) => {
    const source = details?.requestingUrl || details?.securityOrigin
    callback(trustedPermissionSource(contents, source))
  })
}

// Window/taskbar icon. Dev runs from out/main (resources/ at project root);
// packaged builds carry it in process.resourcesPath via extraResources.
function appIcon() {
  for (const p of [
    join(__dirname, '../../resources/icon.ico'),
    join(process.resourcesPath || '', 'icon.ico')
  ]) {
    if (p && existsSync(p)) return p
  }
  return undefined
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    frame: false,
    icon: appIcon(),
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true // powers the in-app Browser panel
    },
    titleBarStyle: 'hidden'
  })
  const contentsId = win.webContents.id
  trustedRendererContents.add(contentsId)
  win.webContents.once('destroyed', () => trustedRendererContents.delete(contentsId))

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    // A renderer regression must not be able to smuggle a preload or Node
    // integration into the remote browser guest.
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    if (!/^https?:\/\//i.test(String(params?.src || ''))) event.preventDefault()
  })

  // The privileged preload belongs only to Sush's own renderer. Prevent the
  // main webContents from navigating to a remote or arbitrary local document
  // that would otherwise inherit that bridge.
  const keepMainRenderer = (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault()
  }
  win.webContents.on('will-navigate', keepMainRenderer)
  win.webContents.on('will-redirect', keepMainRenderer)

  // Frameless windows have no menu, so wire DevTools to F12 / Ctrl+Shift+I
  // ourselves (it's no longer auto-opened — see below).
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return
    const toggle = input.key === 'F12' ||
      ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i')
    if (toggle) win.webContents.toggleDevTools()
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
    // DevTools is a full second renderer — heavy in dev. Don't auto-open it;
    // set SUSH_DEVTOOLS=1 (or just press F12 / Ctrl+Shift+I) when you need it.
    if (process.env.SUSH_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  registerIpcHandlers(win)
}

app.whenReady().then(() => {
  installPermissionPolicy()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// The in-app Browser uses <webview>, whose guest pages get their own
// webContents. Keep target=_blank / window.open links from spawning bare
// Electron windows: open external http(s) links in the system browser instead.
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return
  const keepWebGuestRemote = (event, url) => {
    if (!/^https?:\/\//i.test(String(url || ''))) event.preventDefault()
  }
  contents.on('will-navigate', keepWebGuestRemote)
  contents.on('will-redirect', keepWebGuestRemote)
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
