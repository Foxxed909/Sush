import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { createWindow, registerHandlers } from './window'

// Air's entry point. Compare it to Sush's, which boots an identity system, a
// licence check, a command registry, a tray, a scrollback store and an OAuth
// token store before it can show you a prompt. This file starts a window.

// Named before anything reads app.getPath('userData'), because that path is
// derived from the name. Sush's settings live under "Sush"; Air's live under
// "Sush Air". Two applications, two directories, no shared state — reinstalling
// or resetting one cannot touch the other.
app.setName('Sush Air')

// One instance. A second launch focuses the window you already have rather than
// starting a second copy with its own set of shells.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows()
    if (existing) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
    }
  })

  function appIcon() {
    const icon = join(__dirname, '../../resources/icon.ico')
    return existsSync(icon) ? icon : undefined
  }

  app.whenReady().then(() => {
    registerHandlers()
    createWindow({ icon: appIcon() })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow({ icon: appIcon() })
    })
  })

  // Air is a terminal. When you close the terminal, the app is done — including
  // on macOS, where the convention of staying resident in the dock exists for
  // document apps. There is no document here, and a background process holding
  // shells you cannot see is the opposite of what Air is for.
  app.on('window-all-closed', () => app.quit())
}
