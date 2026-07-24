import { contextBridge, ipcRenderer } from 'electron'

// Sush Air's bridge. Compare it to preload/index.js — that one exposes roughly
// ninety methods across licensing, identity, OAuth, GitHub, Docker, secrets and
// the agent orchestrator. This one exposes sixteen, and every channel it can
// reach is namespaced `air:`.
//
// That is the actual security story of Air, not a size boast: a compromised or
// simply buggy Air renderer has no path to a token store or a user record,
// because those channels were never put on its bridge.
//
// Listener registrars return an unsubscribe function. Returning the raw
// ipcRenderer handle would hand the renderer a way to call ipcRenderer.removeAll
// on channels it doesn't own.

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

  platform: process.platform
})
