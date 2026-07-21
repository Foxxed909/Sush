// Keep terminal input routing independent of xterm so it can be tested in
// Node as well as reused by every input path in the renderer.
export function terminalInputAllowed(inputLocked, data) {
  return !inputLocked || data === '\x03'
}

export function terminalInputTargets(tabId, broadcastTabIds) {
  const ids = Array.isArray(broadcastTabIds) ? broadcastTabIds : []
  return [...new Set([tabId, ...ids])].filter(Boolean)
}
