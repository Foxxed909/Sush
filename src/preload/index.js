import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('sush', {
  startPty: (payload) => ipcRenderer.invoke('sush:pty-start', payload),
  ptyInput: (payload) => ipcRenderer.send('sush:pty-input', payload),
  ptyResize: (payload) => ipcRenderer.send('sush:pty-resize', payload),
  onPtyData: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('sush:pty-data', listener)
    return () => ipcRenderer.removeListener('sush:pty-data', listener)
  },
  onPtyExit: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('sush:pty-exit', listener)
    return () => ipcRenderer.removeListener('sush:pty-exit', listener)
  },
  onPtyState: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('sush:pty-state', listener)
    return () => ipcRenderer.removeListener('sush:pty-state', listener)
  },
  copyText: (text) => ipcRenderer.invoke('sush:copy-text', text),
  readClipboard: () => ipcRenderer.invoke('sush:read-clipboard'),
  runSmartInput: (payload) => ipcRenderer.invoke('sush:run-smart-input', payload),
  runCommand: (payload) => ipcRenderer.invoke('sush:run-command', payload),
  getCwd: (payload) => ipcRenderer.invoke('sush:get-cwd', payload),
  newTab: (payload) => ipcRenderer.invoke('sush:new-tab', payload),
  closeTab: (payload) => ipcRenderer.invoke('sush:close-tab', payload),
  cancelCommand: (payload) => ipcRenderer.invoke('sush:cancel-command', payload),
  windowControl: (action) => ipcRenderer.invoke('sush:window-control', action),
  appVersion: () => ipcRenderer.invoke('sush:app-version'),
  homeDir: () => ipcRenderer.invoke('sush:home-dir'),
  gitStatus: (payload) => ipcRenderer.invoke('sush:git-status', payload),
  listDir: (payload) => ipcRenderer.invoke('sush:list-dir', payload),
  dirExists: (payload) => ipcRenderer.invoke('sush:dir-exists', payload),
  memoryList: (payload) => ipcRenderer.invoke('sush:memory-list', payload),
  memoryRead: (payload) => ipcRenderer.invoke('sush:memory-read', payload),
  memoryWrite: (payload) => ipcRenderer.invoke('sush:memory-write', payload)
})
