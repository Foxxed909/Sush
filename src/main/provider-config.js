import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { getActiveUser, getLegacyOwnerId, isLegacyOwnershipEstablished, listUsers } from './users'
import {
  atomicWriteJson,
  migrateLegacyOnce,
  migrationMarkerPath,
  protectConfigKey,
  readJsonObject,
  resolveIdentityStorage,
  safeStorageState
} from './secure-storage'

// ── Per-identity encrypted provider config ───────────────────────────────────
// The shared storage scaffold behind the voice modules (stt.js / tts.js): a
// JSON config holding an API key, stored per identity, with the key encrypted
// at rest via the OS keychain (safeStorage) when available. One instance per
// config file. The rules every store enforces identically:
//
//   • The key is read and used ONLY in main; it never crosses IPC.
//   • Without safeStorage the key is stored plaintext (the user's own key on
//     their own machine) and flagged keyEnc:false so the UI can warn.
//   • A distinct in-memory cache entry per identity — a single module-level
//     object once survived user switches and let the next profile use the
//     prior profile's key.
//   • Pre-identity ("legacy") config files migrate once, to the identity that
//     owns them, guarded by a marker file so a second identity can't claim
//     the same key.
export function createSecureConfigStore({ fileName, migrationMarker, emptyConfig, normalize }) {
  const legacyFile = () => join(app.getPath('userData'), fileName)
  const caches = new Map()

  function storageScope() {
    const userData = app.getPath('userData')
    return resolveIdentityStorage({
      userData,
      activeUser: getActiveUser(),
      users: listUsers(),
      legacyOwnerId: getLegacyOwnerId(),
      legacyOwnershipEstablished: isLegacyOwnershipEstablished(),
      fileName,
      legacyPath: legacyFile()
    })
  }

  function load() {
    const scope = storageScope()
    if (!scope.ok) return scope
    if (caches.has(scope.target)) return secureLoadedConfig(scope, caches.get(scope.target))

    if (existsSync(scope.target)) {
      try {
        return secureLoadedConfig(scope, normalize(readJsonObject(scope.target)))
      } catch {
        return { ok: false, error: 'config-invalid' }
      }
    }

    if (scope.kind === 'identity' && scope.ownsLegacy && existsSync(scope.legacyPath)) {
      return migrateLegacyConfig(scope)
    }
    return secureLoadedConfig(scope, emptyConfig())
  }

  function migrateLegacyConfig(scope) {
    const status = safeStorageState(safeStorage)
    const migrated = migrateLegacyOnce({
      marker: migrationMarkerPath(app.getPath('userData'), migrationMarker),
      identityId: scope.identityId,
      target: scope.target,
      transform: () => {
        const protectedConfig = protectConfigKey(normalize(readJsonObject(scope.legacyPath)), safeStorage, status)
        if (!protectedConfig.ok) throw new Error(protectedConfig.error)
        return protectedConfig.config
      }
    })

    if (!migrated.ok && migrated.error === 'legacy-claimed') {
      return secureLoadedConfig(scope, emptyConfig())
    }
    if (!migrated.ok) return { ok: false, error: migrated.cause?.message || migrated.error }
    caches.set(scope.target, migrated.value)
    return { ok: true, config: migrated.value, target: scope.target, security: status }
  }

  function secureLoadedConfig(scope, config) {
    const status = safeStorageState(safeStorage)
    const protectedConfig = protectConfigKey(config, safeStorage, status)
    if (!protectedConfig.ok) return { ok: false, error: protectedConfig.error }
    try {
      if (protectedConfig.changed) atomicWriteJson(scope.target, protectedConfig.config)
    } catch {
      return { ok: false, error: 'persist-failed' }
    }
    caches.set(scope.target, protectedConfig.config)
    return { ok: true, config: protectedConfig.config, target: scope.target, security: status }
  }

  function decryptKey(c) {
    if (!c.key) return ''
    if (!c.keyEnc) return c.key
    try { return safeStorage.decryptString(Buffer.from(c.key, 'base64')) } catch { return '' }
  }

  // Encrypt (or clear) an incoming API key onto the draft config in place.
  function applyKey(c, apiKey, security) {
    const key = String(apiKey || '')
    if (!key) { c.key = ''; c.keyEnc = false; return { ok: true } }
    if (security.secure) {
      try {
        c.key = safeStorage.encryptString(key).toString('base64')
        c.keyEnc = true
        return { ok: true }
      } catch {
        return { ok: false, error: 'key-encryption-failed' }
      }
    }
    c.key = key
    c.keyEnc = false
    return { ok: true }
  }

  // Write the draft config and refresh the cache; the caller already validated.
  function persist(loaded, c) {
    try { atomicWriteJson(loaded.target, c) } catch { return { ok: false, error: 'persist-failed' } }
    caches.set(loaded.target, c)
    return { ok: true }
  }

  return { load, decryptKey, applyKey, persist, securityState: () => safeStorageState(safeStorage) }
}
