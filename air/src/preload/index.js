import { contextBridge, ipcRenderer } from 'electron'

// Air's bridge, in full. Eighteen methods, every channel namespaced `air:`.
//
// Sush's bridge exposes around a hundred and twenty, across licensing,
// identity, OAuth, GitHub, secrets and agent orchestration. That is not a
// criticism of Sush — it needs them. The point is that Air's renderer has no
// path to any of it, and now cannot acquire one by accident: those methods are
// not merely absent from this file, they are absent from this application.
// There is no licence module in Air to expose.
//
// Listener registrars return an unsubscribe function. Returning the raw
// ipcRenderer handle would hand the renderer a way to call removeAllListeners
// on channels it does not own.

const listen = (channel) => (callback) => {
  const handler = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('air', {
  // Sessions
  startPty: (payload) => ipcRenderer.invoke('air:pty-start', payload),
  ptyInput: (payload) => ipcRenderer.send('air:pty-input', payload),
  ptyResize: (payload) => ipcRenderer.send('air:pty-resize', payload),
  closePty: (payload) => ipcRenderer.invoke('air:pty-close', payload),
  onPtyData: listen('air:pty-data'),
  onPtyExit: listen('air:pty-exit'),
  onPtyCwd: listen('air:pty-cwd'),

  // Environment
  shells: () => ipcRenderer.invoke('air:shells'),
  cwd: (payload) => ipcRenderer.invoke('air:cwd', payload),

  // Clipboard + links
  copy: (text) => ipcRenderer.invoke('air:copy', text),
  paste: () => ipcRenderer.invoke('air:paste'),
  openExternal: (url) => ipcRenderer.invoke('air:open-external', url),

  // Window chrome (Air is frameless)
  window: (action) => ipcRenderer.invoke('air:window', action),

  // Import from Sush. Read-only, against one allowlisted file. `importApply`
  // re-scans in main rather than trusting what comes back from here, so the
  // renderer can choose among what was found but cannot invent an entry.
  importScan: () => ipcRenderer.invoke('air:import-scan'),
  importApply: (keep) => ipcRenderer.invoke('air:import-apply', { keep }),
  importClear: () => ipcRenderer.invoke('air:import-clear'),
  profile: () => ipcRenderer.invoke('air:profile'),

  platform: process.platform
})
