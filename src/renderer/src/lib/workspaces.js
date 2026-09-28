// The one definition of "which project is this session in".
//
// It used to be re-implemented four times (App, rail, Overview, topbar) with
// different fallbacks, so a session with no folder was one project per tab for
// Split/Grid but part of a shared "Unassigned" group in the rail.
//
// Identity comes from the STABLE project root (`workspaceCwd`), never the
// live shell cwd, which changes on every `cd`. Sessions with no folder yet
// fall back to their workspace group, then to themselves.

export function normalizePathKey(path) {
  return String(path ?? '').replace(/[\\/]+$/, '').toLowerCase()
}

export function workspaceKey(tab) {
  if (!tab) return null
  const cwd = normalizePathKey(tab.workspaceCwd || tab.cwd)
  if (cwd) return `cwd:${cwd}`
  if (tab.groupId) return `group:${tab.groupId}`
  return tab.id ? `tab:${tab.id}` : null
}

export function folderName(path) {
  const bits = String(path ?? '').replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean)
  return bits[bits.length - 1] || String(path ?? '')
}

export function workspaceLabel(tab) {
  const root = tab?.workspaceCwd || tab?.cwd
  if (root) return folderName(root)
  return tab?.groupLabel || tab?.label || 'Unassigned'
}

export function sameWorkspace(a, b) {
  const ka = workspaceKey(a)
  return ka != null && ka === workspaceKey(b)
}

export function tabsInWorkspace(tabs, anchor) {
  const key = workspaceKey(anchor)
  return key ? (tabs || []).filter(t => workspaceKey(t) === key) : []
}

// Ordered groups, in first-seen order: [{ key, label, cwd, tabs }]
export function groupByWorkspace(tabs) {
  const map = new Map()
  for (const tab of tabs || []) {
    const key = workspaceKey(tab)
    if (!key) continue
    if (!map.has(key)) map.set(key, { key, label: workspaceLabel(tab), cwd: tab.workspaceCwd || tab.cwd || '', tabs: [] })
    map.get(key).tabs.push(tab)
  }
  return [...map.values()]
}
