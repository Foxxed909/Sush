import { workspaceLabel } from './workspaces'

// Which sessions need the user, worst first. Pure so it can be tested.
//   limit   the CLI reported a usage/session limit
//   error   the PTY exited or the classifier saw an error
//   waiting the agent is asking for input/approval
// Everything else (working, idle, done) is deliberately not attention.
const RANK = { limit: 0, waiting: 1, error: 2 }

export function attentionKind(tab, state, limited) {
  if (limited) return 'limit'
  if (tab?.status === 'exited') return 'error'
  if (state === 'waiting') return 'waiting'
  if (state === 'error') return 'error'
  return null
}

const REASON = {
  limit: 'Hit a usage limit',
  waiting: 'Waiting for you',
  error: 'Stopped or errored'
}

export function attentionItems(tabs, states = {}, limits = {}) {
  const items = []
  for (const tab of tabs || []) {
    const kind = attentionKind(tab, states[tab.id], !!limits[tab.id])
    if (!kind) continue
    items.push({
      id: tab.id,
      kind,
      reason: REASON[kind],
      label: tab.label || 'Session',
      project: workspaceLabel(tab),
      agentId: tab.agentId || null
    })
  }
  // Stable: worst first, then original order.
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => RANK[a.item.kind] - RANK[b.item.kind] || a.index - b.index)
    .map(({ item }) => item)
}

export function attentionTitle(base, count) {
  return count > 0 ? `(${count}) ${base}` : base
}

// Ids that entered attention since the previous snapshot: what a sound or a
// notification should announce, never the ones that were already waiting.
export function newlyNeedingAttention(prevIds, items) {
  const before = new Set(prevIds || [])
  return (items || []).filter(item => !before.has(item.id))
}
