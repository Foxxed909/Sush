import { workspaceKey } from './workspaces'

// Keep terminal input routing independent of xterm so it can be tested in
// Node as well as reused by every input path in the renderer.
export function terminalInputAllowed(inputLocked, data) {
  return !inputLocked || data === '\x03'
}

export function terminalInputTargets(tabId, broadcastTabIds) {
  const ids = Array.isArray(broadcastTabIds) ? broadcastTabIds : []
  return [...new Set([tabId, ...ids])].filter(Boolean)
}

// Who a broadcast reaches. 'all' types into every session; 'workspace' fences
// it to the active session's project folder — the same identity the rail,
// Overview and Office use (lib/workspaces), not its launch group, so a
// meeting in one office can never leak keystrokes into another project.
// With no active session there is nothing to fence around, so it reaches all.
export function broadcastTargetIds(tabs = [], activeTab = null, { mode = false, scope = 'all' } = {}) {
  if (!mode) return null
  const key = scope === 'workspace' && activeTab ? workspaceKey(activeTab) : null
  return (key ? tabs.filter(t => workspaceKey(t) === key) : tabs).map(t => t.id)
}
