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
  getScrollback: (payload) => ipcRenderer.invoke('sush:get-scrollback', payload),
  sushrcRead: () => ipcRenderer.invoke('sush:sushrc-read'),
  sushrcWrite: (payload) => ipcRenderer.invoke('sush:sushrc-write', payload),
  sushrcPath: () => ipcRenderer.invoke('sush:sushrc-path'),
  gitStatus: (payload) => ipcRenderer.invoke('sush:git-status', payload),
  listDir: (payload) => ipcRenderer.invoke('sush:list-dir', payload),
  dirExists: (payload) => ipcRenderer.invoke('sush:dir-exists', payload),
  memoryList: (payload) => ipcRenderer.invoke('sush:memory-list', payload),
  memoryRead: (payload) => ipcRenderer.invoke('sush:memory-read', payload),
  memoryWrite: (payload) => ipcRenderer.invoke('sush:memory-write', payload),
  // New in v2
  readFile: (payload) => ipcRenderer.invoke('sush:read-file', payload),
  writeFile: (payload) => ipcRenderer.invoke('sush:write-file', payload),
  deleteFile: (payload) => ipcRenderer.invoke('sush:delete-file', payload),
  openExternal: (payload) => ipcRenderer.invoke('sush:open-external', payload),
  getNpmScripts: (payload) => ipcRenderer.invoke('sush:get-npm-scripts', payload),
  getAllCommands: () => ipcRenderer.invoke('sush:get-all-commands'),
  sessionStats: () => ipcRenderer.invoke('sush:session-stats'),
  setTabMeta: (payload) => ipcRenderer.invoke('sush:set-tab-meta', payload),
  getTabMeta: (payload) => ipcRenderer.invoke('sush:get-tab-meta', payload),
  getSystemStats: () => ipcRenderer.invoke('sush:get-system-stats'),
  getPorts: () => ipcRenderer.invoke('sush:get-ports'),
  killPid: (payload) => ipcRenderer.invoke('sush:kill-pid', payload),
  gitStage: (payload) => ipcRenderer.invoke('sush:git-stage', payload),
  gitUnstage: (payload) => ipcRenderer.invoke('sush:git-unstage', payload),
  gitCommit: (payload) => ipcRenderer.invoke('sush:git-commit', payload),
  gitDiffStaged: (payload) => ipcRenderer.invoke('sush:git-diff-staged', payload),
  dockerPs: () => ipcRenderer.invoke('sush:docker-ps'),
  dockerStop: (payload) => ipcRenderer.invoke('sush:docker-stop', payload),
  dockerLogs: (payload) => ipcRenderer.invoke('sush:docker-logs', payload),
  watchPath: (payload) => ipcRenderer.invoke('sush:watch-path', payload),
  unwatchPath: (payload) => ipcRenderer.invoke('sush:unwatch-path', payload),
  onFileChanged: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('sush:file-changed', listener)
    return () => ipcRenderer.removeListener('sush:file-changed', listener)
  }
})
