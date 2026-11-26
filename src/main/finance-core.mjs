// Sush Finance, pure core: transcript parsing, API-equivalent cost, the month
// summary and the plan advice. No electron, no fs, so the numbers are testable.
//
// Every figure is an estimate built from tokens the agent CLIs already write
// to disk. "API-equivalent" means what the same tokens would cost at the
// provider's published pay-as-you-go rates. It is not a bill: on a
// subscription the user pays the plan price, and comparing the two is the
// point.

export const PRICES_AS_OF = '2026-11-03'

// USD per million tokens: input, output, 5-minute cache write, cache read.
// Anthropic first-party rates. Matched by longest id prefix, so dated
// snapshots resolve to their family.
export const MODEL_PRICES = {
  'claude-fable-5-2': { input: 8, output: 40, cacheWrite: 10, cacheRead: 0.2 },
  'claude-mythos-5-2': { input: 8, output: 40, cacheWrite: 10, cacheRead: 0.2 },
  'claude-fable-5-1': { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 0.25 },
  'claude-mythos-5-1': { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 },
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-4-7': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-4-6': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  'claude-sonnet-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }
}

const PRICE_KEYS = ['input', 'output', 'cacheWrite', 'cacheRead']

// User overrides win, then the built-in table. Unknown models return null so
// the UI can say "no price" instead of showing a made-up $0.
export function priceFor(model, overrides = {}) {
  const id = String(model || '').toLowerCase().trim()
  if (!id) return null
  const tables = [overrides || {}, MODEL_PRICES]
  for (const table of tables) {
    let best = null
    for (const key of Object.keys(table)) {
      const k = key.toLowerCase()
      if ((id === k || id.startsWith(`${k}-`) || id.startsWith(`${k}@`) || id.startsWith(`${k}[`)) && (!best || k.length > best.length)) best = key
    }
    if (best) {
      const p = table[best]
      if (p && PRICE_KEYS.every(k => Number.isFinite(Number(p[k] ?? 0)))) {
        return { input: +p.input || 0, output: +p.output || 0, cacheWrite: +(p.cacheWrite ?? p.input * 1.25) || 0, cacheRead: +(p.cacheRead ?? p.input * 0.1) || 0 }
      }
    }
  }
  return null
}

export function costOf(record, overrides) {
  const p = priceFor(record?.model, overrides)
  if (!p) return null
  return ((record.input || 0) * p.input + (record.output || 0) * p.output +
    (record.cacheWrite || 0) * p.cacheWrite + (record.cacheRead || 0) * p.cacheRead) / 1e6
}

function parseLines(text, onObject) {
  for (const line of String(text || '').split('\n')) {
    if (!line || line[0] !== '{') continue
    let obj
    try { obj = JSON.parse(line) } catch { continue }
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) onObject(obj)
  }
}

// Claude Code: one JSON object per line; assistant entries carry message.usage.
export function parseClaudeTranscript(text) {
  const out = []
  parseLines(text, obj => {
    const msg = obj.message && typeof obj.message === 'object' ? obj.message : null
    const u = msg?.usage
    if (!u || typeof u !== 'object') return
    const ts = Date.parse(obj.timestamp || '')
    if (!Number.isFinite(ts)) return
    out.push({
      id: msg.id || obj.requestId || obj.uuid || null,
      ts,
      model: msg.model || 'unknown',
      cwd: typeof obj.cwd === 'string' ? obj.cwd : null,
      input: u.input_tokens || 0,
      output: u.output_tokens || 0,
      cacheWrite: u.cache_creation_input_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0
    })
  })
  return out
}

// Codex rollouts: session_meta (cwd), turn_context (model) and token_count
// events. last_token_usage is the per-turn delta; its input_tokens already
// include the cached share, which is split out here.
export function parseCodexRollout(text, fileKey = 'codex') {
  const out = []
  let model = 'unknown'
  let cwd = null
  let n = 0
  parseLines(text, obj => {
    const p = obj.payload && typeof obj.payload === 'object' ? obj.payload : null
    if (!p) return
    if (obj.type === 'session_meta' && typeof p.cwd === 'string') cwd = p.cwd
    if (obj.type === 'turn_context') {
      if (typeof p.model === 'string') model = p.model
      if (typeof p.cwd === 'string') cwd = p.cwd
    }
    if (obj.type === 'event_msg' && p.type === 'token_count') {
      const u = p.info?.last_token_usage
      const ts = Date.parse(obj.timestamp || '')
      if (!u || !Number.isFinite(ts)) return
      const cached = u.cached_input_tokens || 0
      out.push({
        id: `${fileKey}#${n++}`,
        ts,
        model,
        cwd,
        input: Math.max(0, (u.input_tokens || 0) - cached),
        output: u.output_tokens || 0,
        cacheWrite: 0,
        cacheRead: cached
      })
    }
  })
  return out
}

export function monthKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
export function dayKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function projectOf(cwd) {
  if (!cwd) return 'Unknown folder'
  const parts = String(cwd).replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean)
  return parts.pop() || cwd
}

const blank = () => ({ usd: 0, tokens: 0, unpricedTokens: 0, requests: 0 })
function addTo(map, key, rec, usd) {
  const b = map.get(key) || blank()
  const tokens = rec.input + rec.output + rec.cacheWrite + rec.cacheRead
  b.tokens += tokens
  b.requests += 1
  if (usd == null) b.unpricedTokens += tokens
  else b.usd += usd
  map.set(key, b)
}
const sorted = map => [...map.entries()].map(([key, v]) => ({ key, ...v, usd: round(v.usd) })).sort((a, b) => b.usd - a.usd || b.tokens - a.tokens)
const round = n => Math.round(n * 100) / 100

// accounts: [{ provider, slotId, label, records, lastLimitAt, usageHistory }]
// settings: { budgetUsd, plans: { 'provider:slotId': monthlyUsd }, prices }
export function summarize(accounts = [], settings = {}, now = Date.now()) {
  const month = monthKey(now)
  const start = new Date(now); start.setDate(1); start.setHours(0, 0, 0, 0)
  const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  const elapsedDays = Math.max(1, (now - start.getTime()) / 864e5)
  const weekAgo = now - 7 * 864e5
  const prices = settings.prices || {}
  const plans = settings.plans || {}

  const byDay = new Map(), byProject = new Map(), byModel = new Map()
  const unpricedModels = new Set()
  let usd = 0, tokens = 0, last7Usd = 0
  const rows = []

  for (const acct of accounts) {
    const key = `${acct.provider}:${acct.slotId}`
    const seen = new Set()
    const row = { key, provider: acct.provider, slotId: acct.slotId, label: acct.label || acct.slotId, usd: 0, tokens: 0, unpricedTokens: 0, requests: 0, lastUsedAt: null, planUsd: Number(plans[key]) > 0 ? Number(plans[key]) : 0, lastLimitAt: acct.lastLimitAt || null, weekPeak: 0 }
    for (const h of acct.usageHistory || []) {
      if (h && Number.isFinite(h.weekPct) && h.at >= weekAgo) row.weekPeak = Math.max(row.weekPeak, h.weekPct)
    }
    for (const rec of acct.records || []) {
      if (rec.id) { if (seen.has(rec.id)) continue; seen.add(rec.id) }
      if (!row.lastUsedAt || rec.ts > row.lastUsedAt) row.lastUsedAt = rec.ts
      if (monthKey(rec.ts) !== month) continue
      const cost = costOf(rec, prices)
      const t = rec.input + rec.output + rec.cacheWrite + rec.cacheRead
      if (cost == null) { unpricedModels.add(rec.model); row.unpricedTokens += t }
      else { row.usd += cost; usd += cost; if (rec.ts >= weekAgo) last7Usd += cost }
      row.tokens += t; tokens += t; row.requests += 1
      addTo(byDay, dayKey(rec.ts), rec, cost)
      addTo(byProject, projectOf(rec.cwd), rec, cost)
      addTo(byModel, rec.model, rec, cost)
    }
    row.usd = round(row.usd)
    rows.push(row)
  }

  // Month-end projection: the slower of the month-to-date pace and the last
  // seven days' pace would understate a busy week, so take the faster one.
  const remainingDays = Math.max(0, daysInMonth - elapsedDays)
  const paceMonth = usd / elapsedDays
  const paceWeek = last7Usd / Math.min(7, elapsedDays)
  const forecastUsd = round(usd + Math.max(paceMonth, paceWeek) * remainingDays)
  const planUsd = round(rows.reduce((a, r) => a + r.planUsd, 0))
  const budgetUsd = Number(settings.budgetUsd) > 0 ? Number(settings.budgetUsd) : null

  const summary = {
    month,
    pricesAsOf: PRICES_AS_OF,
    usd: round(usd),
    tokens,
    forecastUsd,
    planUsd,
    valueRatio: planUsd > 0 ? Math.round((usd / planUsd) * 10) / 10 : null,
    budgetUsd,
    budgetState: budgetUsd == null ? 'none' : usd >= budgetUsd ? 'over' : forecastUsd >= budgetUsd ? 'forecast-over' : usd >= budgetUsd * 0.8 ? 'near' : 'ok',
    days: sorted(byDay).sort((a, b) => a.key.localeCompare(b.key)),
    projects: sorted(byProject).slice(0, 8),
    models: sorted(byModel),
    accounts: rows,
    unpricedModels: [...unpricedModels].sort()
  }
  summary.advice = advise(summary, now)
  return summary
}

const usdText = n => `$${n >= 100 ? Math.round(n) : n.toFixed(2)}`

// Plain-language suggestions. Each says what was seen and what to do, and
// saveUsd is a monthly figure only when the saving is real money.
export function advise(summary, now = Date.now()) {
  const out = []
  const idleDays = 14
  const paid = summary.accounts.filter(r => r.planUsd > 0)
  const start = new Date(now); start.setDate(1); start.setHours(0, 0, 0, 0)
  const daysIn = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  const monthShare = Math.min(1, Math.max(1, (now - start.getTime()) / 864e5) / daysIn)

  for (const r of paid) {
    const idleFor = r.lastUsedAt ? (now - r.lastUsedAt) / 864e5 : Infinity
    if (idleFor >= idleDays) {
      out.push({ kind: 'idle', severity: 'save', key: r.key, saveUsd: r.planUsd,
        title: `${r.label} hasn't been used in ${Number.isFinite(idleFor) ? `${Math.floor(idleFor)} days` : 'this period'}`,
        detail: `It costs ${usdText(r.planUsd)}/mo. Cancel it, or let rotation use it before the next renewal.` })
      continue
    }
    // Only judge value once a third of the month has passed: early-month
    // numbers make every plan look like a bad deal.
    const projected = r.usd / monthShare
    if (monthShare >= 0.33 && r.unpricedTokens === 0 && projected < r.planUsd * 0.6) {
      out.push({ kind: 'downgrade', severity: 'save', key: r.key, saveUsd: round(r.planUsd - projected),
        title: `${r.label} is worth about ${usdText(projected)} this month at API rates`,
        detail: `The plan costs ${usdText(r.planUsd)}. A smaller plan or pay-as-you-go would likely cost less at this pace.` })
    }
    const limited = r.lastLimitAt && now - r.lastLimitAt < 7 * 864e5
    if ((limited || r.weekPeak >= 90) && projected > r.planUsd * 3) {
      out.push({ kind: 'upgrade', severity: 'info', key: r.key, saveUsd: 0,
        title: `${r.label} is running into its limits`,
        detail: `This month's use is worth about ${usdText(projected)} at API rates, over 3× the ${usdText(r.planUsd)} plan. A higher tier or a second account in rotation would strand you less.` })
    }
  }

  // Rotation balance, per provider with 2+ accounts.
  const byProvider = new Map()
  for (const r of summary.accounts) byProvider.set(r.provider, [...(byProvider.get(r.provider) || []), r])
  for (const [provider, rows] of byProvider) {
    if (rows.length < 2) continue
    const total = rows.reduce((a, r) => a + r.tokens, 0)
    const top = [...rows].sort((a, b) => b.tokens - a.tokens)[0]
    if (total > 0 && top.tokens / total > 0.85 && rows.some(r => r !== top && r.tokens === 0)) {
      out.push({ kind: 'rotate', severity: 'info', key: top.key, saveUsd: 0,
        title: `${top.label} carries ${Math.round((top.tokens / total) * 100)}% of ${provider} use`,
        detail: 'Other accounts sit unused. Set the limit policy to Auto in Settings ▸ Accounts so Sush rotates before this one hits its cap.' })
    }
  }

  if (summary.budgetState === 'over') {
    out.push({ kind: 'budget', severity: 'warn', saveUsd: 0, title: `Over your ${usdText(summary.budgetUsd)} budget`, detail: `${usdText(summary.usd)} of API-equivalent use so far this month.` })
  } else if (summary.budgetState === 'forecast-over') {
    out.push({ kind: 'budget', severity: 'warn', saveUsd: 0, title: `On pace for ${usdText(summary.forecastUsd)}, over your ${usdText(summary.budgetUsd)} budget`, detail: 'Lower effort on routine sessions or move them to a cheaper model to stay inside it.' })
  }

  if (summary.unpricedModels.length) {
    out.push({ kind: 'prices', severity: 'info', saveUsd: 0, title: `No price for ${summary.unpricedModels.join(', ')}`, detail: 'Their tokens are counted but not costed. Add a per-million-token price in Settings ▸ Finance.' })
  }
  const rank = { warn: 0, save: 1, info: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (b.saveUsd || 0) - (a.saveUsd || 0))
}
