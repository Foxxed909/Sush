// Air's whole persistence layer. localStorage, namespaced, fail-quiet.
//
// A terminal that loses your font size because a JSON parse threw is a worse
// terminal than one that silently falls back to the default, so every read is
// wrapped and every failure returns the fallback.

const PREFIX = 'sush-air:'

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    const value = JSON.parse(raw)
    // A stored value of the wrong shape is worse than no stored value — it
    // would propagate a type error into whatever consumes it.
    if (value === null || typeof value !== typeof fallback) return fallback
    if (Array.isArray(fallback) !== Array.isArray(value)) return fallback
    return value
  } catch {
    return fallback
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    // Quota exceeded, or storage disabled. Nothing here is worth an error
    // dialog — the app keeps working, it just forgets.
    return false
  }
}
