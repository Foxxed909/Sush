// Office numbers: headcounts, tokens and XP. Everything here is derived from
// things Sush actually observes — session states, transcript usage records,
// time spent working — and XP lives only on this machine.

// Headcount for one office: per provider and per state.
export function officeHeadcount(tabs = [], states = {}, limits = {}) {
  const providers = new Map()
  const byState = { working: 0, waiting: 0, idle: 0, limit: 0, error: 0 }
  for (const tab of tabs) {
    const agent = tab.agentId || 'shell'
    providers.set(agent, (providers.get(agent) || 0) + 1)
    const state = limits[tab.id] ? 'limit' : tab.status === 'exited' ? 'error' : (states[tab.id] || 'idle')
    if (state === 'working' || state === 'booting') byState.working++
    else if (state === 'waiting') byState.waiting++
    else if (state === 'limit') byState.limit++
    else if (state === 'error') byState.error++
    else byState.idle++
  }
  return { total: tabs.length, providers: [...providers].map(([agentId, count]) => ({ agentId, count })), ...byState }
}

// Token totals from a transcript's recorded usage: what the thread has spent
// (prompt incl. cache, and output), and what's in context now.
export function transcriptTokens(items = []) {
  let input = 0
  let output = 0
  let cached = 0
  let context = null
  for (const item of items) {
    const u = item?.usage || null
    if (!u) continue
    const n = key => (Number.isFinite(Number(u[key])) ? Number(u[key]) : 0)
    input += n('input_tokens') + n('cache_creation_input_tokens')
    cached += n('cache_read_input_tokens')
    output += n('output_tokens')
    const now = n('input_tokens') + n('cache_creation_input_tokens') + n('cache_read_input_tokens') + n('output_tokens')
    if (now > 0) context = now
  }
  return { input, cached, output, total: input + cached + output, context }
}

// ── XP ────────────────────────────────────────────────────────────────────
export const XP_RULES = {
  workingMinute: 2,     // each minute an agent is observed working
  turnCompleted: 15,    // working → waiting/idle
  recovered: 25,        // a limit/handoff that ended with the agent working again
  per1kOutputTokens: 1  // Claude transcripts only
}

// Level n needs 50·n² XP in total: quick early levels, then a steady climb.
export function levelFor(xp) {
  const v = Math.max(0, Number(xp) || 0)
  const level = Math.floor(Math.sqrt(v / 50))
  const floorXp = 50 * level * level
  const nextXp = 50 * (level + 1) * (level + 1)
  return { level, xp: v, floorXp, nextXp, progress: (v - floorXp) / (nextXp - floorXp) }
}

// Apply one observation tick to the XP ledger. Pure: returns the new ledger.
// ledger = { agents: { [tabKey]: { xp, lastState, tokens } }, offices: { [key]: xp } }
export function applyXpTick(ledger, { tabKey, officeKey, prevState, state, minutes = 0, outputTokens = null }) {
  const agents = { ...(ledger?.agents || {}) }
  const offices = { ...(ledger?.offices || {}) }
  const entry = { xp: 0, tokens: 0, ...(agents[tabKey] || {}) }
  let gained = 0
  if (state === 'working' && minutes > 0) gained += XP_RULES.workingMinute * minutes
  if (prevState === 'working' && (state === 'waiting' || state === 'idle')) gained += XP_RULES.turnCompleted
  if ((prevState === 'limit' || prevState === 'error') && state === 'working') gained += XP_RULES.recovered
  if (outputTokens != null && outputTokens > (entry.tokens || 0)) {
    gained += Math.floor((outputTokens - (entry.tokens || 0)) / 1000) * XP_RULES.per1kOutputTokens
    // Only advance the watermark by whole thousands so remainders still count.
    entry.tokens = (entry.tokens || 0) + Math.floor((outputTokens - (entry.tokens || 0)) / 1000) * 1000
  }
  entry.xp = (entry.xp || 0) + gained
  entry.lastState = state
  agents[tabKey] = entry
  if (officeKey) offices[officeKey] = (offices[officeKey] || 0) + gained
  return { ledger: { agents, offices }, gained }
}
