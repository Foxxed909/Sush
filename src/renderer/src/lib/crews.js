// Saved crews (workspace presets). A crew is a reusable launch: a set of
// agents × counts, an optional directory, an optional brief, and a name. It's
// exactly the shape launchSessions already takes, so relaunching a whole
// workspace is one call. Stored in localStorage (per-user via the storage
// shim) under 'sush-crews'. Read inside functions only — a module-scope
// localStorage read would beat the per-user scope installed in main.jsx.

const CREWS_KEY = 'sush-crews'
const MAX_CREWS = 24

function makeId() {
  return 'crew-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// Normalize a stored/created crew to a safe, bounded shape. `counts` is an
// { agentId: n } map; anything non-numeric or ≤0 is dropped.
function normalizeCrew(raw) {
  if (!raw || typeof raw !== 'object') return null
  const counts = {}
  for (const [id, n] of Object.entries(raw.counts || {})) {
    const c = Math.max(0, Math.min(99, Math.floor(Number(n) || 0)))
    if (c > 0) counts[String(id)] = c
  }
  if (!Object.keys(counts).length) return null
  return {
    id: String(raw.id || makeId()),
    name: String(raw.name || 'Crew').trim().slice(0, 40) || 'Crew',
    cwd: raw.cwd ? String(raw.cwd) : null,
    counts,
    brief: String(raw.brief || '').slice(0, 800),
    createdAt: Number(raw.createdAt) || Date.now()
  }
}

export function loadCrews() {
  try {
    const saved = JSON.parse(localStorage.getItem(CREWS_KEY) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved.map(normalizeCrew).filter(Boolean).slice(0, MAX_CREWS)
  } catch {
    return []
  }
}

function persist(list) {
  try { localStorage.setItem(CREWS_KEY, JSON.stringify(list.slice(0, MAX_CREWS))) } catch {}
}

// Save a crew. A new name inserts; an existing id (or exact name match)
// replaces, so "save" over an edited crew updates it in place.
export function saveCrew(crew) {
  const next = normalizeCrew(crew)
  if (!next) return { ok: false, error: 'A crew needs at least one agent.' }
  const list = loadCrews()
  const idx = list.findIndex(c => c.id === next.id || c.name.toLowerCase() === next.name.toLowerCase())
  if (idx >= 0) { next.id = list[idx].id; list[idx] = next }
  else list.unshift(next)
  persist(list)
  return { ok: true, crew: next, crews: loadCrews() }
}

export function deleteCrew(id) {
  persist(loadCrews().filter(c => c.id !== id))
  return { ok: true, crews: loadCrews() }
}

// Turn a crew's { counts } map into the agents[] array launchSessions expects.
// `agentById` is passed in so this stays free of the agents module (which reads
// localStorage) at import time.
export function crewToAgents(crew, agentById) {
  return Object.entries(crew.counts || {})
    .map(([id, count]) => {
      const known = agentById?.(id)
      return { id, count, command: known?.command ?? (id === 'shell' ? null : id), label: known?.label || id }
    })
}
