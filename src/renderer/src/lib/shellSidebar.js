// Thread sidebar model for the Nightly shell, after T3 Code's Sidebar
// (MIT, (c) 2026 T3 Tools Inc.): one flat list of threads across projects,
// pinned on top, finished work receding into a collapsible "Settled" shelf.
import { workspaceKey, workspaceLabel } from './workspaces'

// "now", "42s", "5m", "14h", "13d", "8w" — T3's compact sidebar label.
export function compactTimeLabel(at, now = Date.now()) {
  const t = Number(at)
  if (!Number.isFinite(t) || t <= 0) return ''
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 10) return 'now'
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return d < 14 ? `${d}d` : `${Math.floor(d / 7)}w`
}

// The status slot at the top-right of a card. Quiet rows show their time
// instead; only states that change what you should do get a label.
export function rowStatus(stateId, { limited = false } = {}) {
  if (limited) return { id: 'limit', label: 'Limit', tone: 'warning' }
  switch (stateId) {
    case 'waiting': return { id: 'input', label: 'Needs input', tone: 'warning' }
    case 'working': return { id: 'working', label: 'Working', tone: 'info' }
    case 'booting': return { id: 'working', label: 'Starting', tone: 'info' }
    case 'error': return { id: 'failed', label: 'Failed', tone: 'destructive' }
    default: return null
  }
}

export function threadKey(tab) {
  return String(tab?.tag || tab?.id || '')
}

function tabState(tab, activity) {
  return tab.status === 'exited' ? 'error' : (activity[tab.id] || 'idle')
}

// Split tabs into the three shelves. Settled = exited processes or threads
// the user settled by hand; they keep their place in time, newest first.
export function sidebarSections(tabs = [], {
  activity = {},
  pinned = new Set(),
  settled = new Set(),
  project = 'all',
  query = ''
} = {}) {
  const q = String(query || '').trim().toLowerCase()
  const visible = tabs.filter(tab => {
    if (project !== 'all' && workspaceKey(tab) !== project) return false
    if (!q) return true
    return [tab.label, workspaceLabel(tab), tab.agentId, tab.model].some(v => String(v || '').toLowerCase().includes(q))
  })
  const byRecency = (a, b) => (Number(b.lastActiveAt) || 0) - (Number(a.lastActiveAt) || 0)
  const out = { pinned: [], active: [], settled: [] }
  for (const tab of visible) {
    const key = threadKey(tab)
    const done = settled.has(key) || tab.status === 'exited'
    if (pinned.has(key) && !done) out.pinned.push(tab)
    else if (done) out.settled.push(tab)
    else out.active.push(tab)
  }
  // Rows that need a human float above background work, then recency.
  const needs = tab => ['waiting', 'error'].includes(tabState(tab, activity)) ? 0 : 1
  out.active.sort((a, b) => needs(a) - needs(b) || byRecency(a, b))
  out.pinned.sort(byRecency)
  out.settled.sort(byRecency)
  return out
}

export function projectOptions(tabs = []) {
  const seen = new Map()
  for (const tab of tabs) {
    const key = workspaceKey(tab)
    if (key && !seen.has(key)) seen.set(key, { key, label: workspaceLabel(tab), cwd: tab.workspaceCwd || tab.cwd || '' })
  }
  return [{ key: 'all', label: 'All projects' }, ...seen.values()]
}
