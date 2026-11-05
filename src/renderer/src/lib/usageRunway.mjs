// Usage runway: "reaches 80% in ~38 min". From timestamped usage samples,
// fit the recent burn rate (least squares over the window) and project when
// usage crosses the target. Returns null when there's no trend to speak of:
// too few samples, too short a span, flat or falling usage, or already past.
export function usageRunway(samples = [], target = 80, { now = Date.now(), windowMs = 30 * 60e3, minSpanMs = 3 * 60e3 } = {}) {
  const pts = samples
    .filter(s => s && Number.isFinite(s.t) && Number.isFinite(s.pct) && now - s.t <= windowMs)
    .sort((a, b) => a.t - b.t)
  if (pts.length < 3) return null
  if (pts[pts.length - 1].t - pts[0].t < minSpanMs) return null
  const last = pts[pts.length - 1].pct
  if (last >= target) return null
  const n = pts.length
  const mx = pts.reduce((a, p) => a + p.t, 0) / n
  const my = pts.reduce((a, p) => a + p.pct, 0) / n
  let num = 0, den = 0
  for (const p of pts) { num += (p.t - mx) * (p.pct - my); den += (p.t - mx) ** 2 }
  const slope = den ? num / den : 0               // pct per ms
  if (!(slope > 0)) return null
  const minutes = (target - last) / slope / 60e3
  if (!Number.isFinite(minutes) || minutes > 24 * 60) return null
  return Math.max(1, Math.round(minutes))
}

export function runwayLabel(minutes, target = 80) {
  if (minutes == null) return ''
  const t = minutes < 60 ? `~${minutes} min` : `~${Math.round(minutes / 6) / 10} h`
  return `${target}% in ${t}`
}

// Keep one bounded sample list per key (provider:account) across renders.
const store = new Map()
export function recordUsage(key, pct, now = Date.now()) {
  if (!key || !Number.isFinite(pct)) return []
  const list = store.get(key) || []
  const last = list[list.length - 1]
  if (!last || last.pct !== pct || now - last.t > 60e3) list.push({ t: now, pct })
  while (list.length > 120) list.shift()
  store.set(key, list)
  return list
}

export function usageSamples(key) { return (store.get(key) || []).slice() }
export function usageKeys() { return [...store.keys()] }
