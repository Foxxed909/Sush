// Handoff lineage: which session continued which. A session started by a
// handoff carries `handoffFrom: { id, agentId, label }`; the source keeps its
// own state, and the relationship is derived from the live tab list so it
// disappears cleanly when either side is closed.

export function handoffSource(tab) {
  const from = tab?.handoffFrom
  if (!from || typeof from !== 'object' || !from.id) return null
  return { id: String(from.id), agentId: from.agentId || null, label: from.label ? String(from.label) : null }
}

export function lineageOf(tab, tabs = []) {
  const from = handoffSource(tab)
  const to = (tabs || []).filter(t => t?.id !== tab?.id && handoffSource(t)?.id === tab?.id)
  const sourceAlive = from ? (tabs || []).some(t => t?.id === from.id) : false
  return { from, sourceAlive, to }
}

// Rail tag: what this session's relationship reads as in ~10 characters.
export function lineageTag(tab, tabs, agentName = id => id) {
  const { from, to } = lineageOf(tab, tabs)
  if (from) return { arrow: '←', text: agentName(from.agentId) || 'handoff' }
  if (to.length) return { arrow: '→', text: to.length === 1 ? (agentName(to[0].agentId) || 'handoff') : `${to.length} handoffs` }
  return null
}
