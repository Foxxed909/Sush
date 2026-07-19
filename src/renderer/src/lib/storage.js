export function parseStoredObject(raw, fallback = {}) {
  try {
    const value = JSON.parse(raw ?? '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
  } catch {
    return fallback
  }
}
