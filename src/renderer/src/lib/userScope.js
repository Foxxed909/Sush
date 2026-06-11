// Per-user localStorage scoping. Sush stores all renderer state (settings,
// recents, session layout, profiles, command tallies…) in localStorage under
// `sush*` keys. With Identities, each signed-in user must see only their own
// state — so we transparently rewrite those keys to `u:<userId>::<key>` by
// wrapping Storage.prototype before React mounts (see main.jsx).
//
// Why a shim instead of refactoring every call site: a dozen files touch
// localStorage today, and any future feature that adds a key would have to
// remember to scope it. The shim guarantees isolation for all of them.
//
// Keys in GLOBAL_KEYS (the identity bookkeeping itself) are never rewritten.

const ACTIVE_USER_KEY = 'sush-active-user'
const MIGRATED_FLAG = 'sush-scope-migrated-v1'

const GLOBAL_KEYS = new Set([ACTIVE_USER_KEY])

const raw = {
  getItem: Storage.prototype.getItem,
  setItem: Storage.prototype.setItem,
  removeItem: Storage.prototype.removeItem
}

let activeUserId = null

function isScopable(key) {
  const k = String(key)
  // Only Sush's own keys are rewritten; never double-prefix.
  return !GLOBAL_KEYS.has(k) && !k.startsWith('u:') && (k.startsWith('sush'))
}

function scoped(key) {
  return activeUserId && isScopable(key) ? `u:${activeUserId}::${key}` : key
}

export function getActiveUserIdRaw() {
  try { return raw.getItem.call(window.localStorage, ACTIVE_USER_KEY) || null } catch { return null }
}

export function setActiveUserIdRaw(id) {
  try {
    if (id) raw.setItem.call(window.localStorage, ACTIVE_USER_KEY, id)
    else raw.removeItem.call(window.localStorage, ACTIVE_USER_KEY)
  } catch {}
  activeUserId = id || null
}

// Install the shim. Must run before any module reads localStorage.
export function initUserScope() {
  activeUserId = getActiveUserIdRaw()

  Storage.prototype.getItem = function (key) {
    return raw.getItem.call(this, this === window.localStorage ? scoped(key) : key)
  }
  Storage.prototype.setItem = function (key, value) {
    return raw.setItem.call(this, this === window.localStorage ? scoped(key) : key, value)
  }
  Storage.prototype.removeItem = function (key) {
    return raw.removeItem.call(this, this === window.localStorage ? scoped(key) : key)
  }
}

// One-time adoption: when the very first identity is created on an install
// that already has legacy (unscoped) Sush state, copy that state into the new
// user's scope so they keep their settings, recents and layout.
export function migrateLegacyInto(userId) {
  try {
    if (raw.getItem.call(window.localStorage, MIGRATED_FLAG)) return
    const keys = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && isScopable(k)) keys.push(k)
    }
    for (const k of keys) {
      const value = raw.getItem.call(window.localStorage, k)
      if (value != null) raw.setItem.call(window.localStorage, `u:${userId}::${k}`, value)
    }
    raw.setItem.call(window.localStorage, MIGRATED_FLAG, '1')
  } catch {}
}

// Remove every stored key belonging to a (deleted) user.
export function clearUserScope(userId) {
  try {
    const prefix = `u:${userId}::`
    const doomed = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(prefix)) doomed.push(k)
    }
    for (const k of doomed) raw.removeItem.call(window.localStorage, k)
  } catch {}
}
