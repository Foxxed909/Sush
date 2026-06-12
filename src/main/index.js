import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { registerIpcHandlers } from './ipc'

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
      webviewTag: true // powers the in-app Browser panel
    },
    titleBarStyle: 'hidden'
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

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
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
