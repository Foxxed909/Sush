import { app, safeStorage } from 'electron'
import { ok, err, ansi } from './_helpers'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir, hostname } from 'os'
import { createDecipheriv, scryptSync } from 'crypto'
import { getActiveUser, getLegacyOwnerId, isLegacyOwnershipEstablished, listUsers } from '../users'
import {
  atomicWriteJson,
  claimLegacyMigration,
  migrateLegacyOnce,
  migrationMarkerPath,
  readJsonObject,
  resolveIdentityStorage,
  safeStorageState,
  transformLegacySecretStore
} from '../secure-storage'

// Secrets are scoped to the active Sush identity and encrypted by Electron's
// OS-backed safeStorage (DPAPI / Keychain / Secret Service). The previous
// hostname-derived AES key was public and every profile shared one file, so a
// second profile could decrypt the first profile's values.
const LEGACY_STORE_PATH = join(homedir(), '.sush', 'secrets.json')

function storageScope() {
  const userData = app.getPath('userData')
  return resolveIdentityStorage({
    userData,
    activeUser: getActiveUser(),
    users: listUsers(),
    legacyOwnerId: getLegacyOwnerId(),
    legacyOwnershipEstablished: isLegacyOwnershipEstablished(),
    fileName: 'secrets.json',
    legacyPath: LEGACY_STORE_PATH
  })
}

function loadStore() {
  const scope = storageScope()
  if (!scope.ok) return scope

  if (existsSync(scope.target)) return loadExistingStore(scope.target, scope)

  if (scope.kind === 'identity' && scope.ownsLegacy && existsSync(LEGACY_STORE_PATH)) {
    return migrateLegacyStore(scope)
  }
  return { ok: true, secrets: {}, target: scope.target }
}

function loadExistingStore(file, scope) {
  try {
    const parsed = readJsonObject(file)
    if (parsed.version === 2) {
      return { ok: true, secrets: validateSecretMap(parsed.secrets), target: scope.target }
    }

    // A zero-user install can still use the historical global store. Convert
    // it only after every value has decrypted and re-encrypted successfully.
    // An identity-local v1 file is handled the same way.
    const migrated = convertStore(parsed)
    atomicWriteJson(file, migrated)
    return { ok: true, secrets: migrated.secrets, target: scope.target }
  } catch (cause) {
    return { ok: false, error: cause?.message || 'secret-store-invalid' }
  }
}

function migrateLegacyStore(scope) {
  const marker = migrationMarkerPath(app.getPath('userData'), 'secrets-v2')
  const security = safeStorageState(safeStorage)

  // Claim before returning an unavailable-keyring error. This identity may
  // resume later, while a replacement sole identity can never inherit the
  // same global vault merely because the first identity was deleted.
  if (!security.secure) {
    const claimed = claimLegacyMigration(marker, scope.identityId)
    if (!claimed.ok && claimed.error === 'legacy-claimed') {
      return { ok: true, secrets: {}, target: scope.target }
    }
    if (!claimed.ok) return claimed
    return { ok: false, error: secureStorageError(security) }
  }

  const migrated = migrateLegacyOnce({
    marker,
    identityId: scope.identityId,
    target: scope.target,
    transform: () => convertStore(readJsonObject(LEGACY_STORE_PATH))
  })
  if (!migrated.ok && migrated.error === 'legacy-claimed') {
    return { ok: true, secrets: {}, target: scope.target }
  }
  if (!migrated.ok) return { ok: false, error: migrated.error }
  return { ok: true, secrets: migrated.value.secrets, target: scope.target }
}

function convertStore(parsed) {
  const security = safeStorageState(safeStorage)
  if (!security.secure) throw new Error(secureStorageError(security))

  if (parsed.version === 2) {
    const secrets = validateSecretMap(parsed.secrets)
    // Validate the whole vault before copying it into an identity. A damaged
    // entry must not produce a truncated or partly usable migrated store.
    for (const value of Object.values(secrets)) decrypt(value)
    return { version: 2, secrets }
  }
  return transformLegacySecretStore(parsed, { decryptLegacy, encrypt, validateKey: validKey })
}

function validateSecretMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('secret-store-invalid')
  }
  const entries = Object.entries(value)
  for (const [key, encrypted] of entries) {
    if (!validKey(key) || typeof encrypted !== 'string') throw new Error('secret-store-invalid')
  }
  return Object.fromEntries(entries)
}

function saveStore(file, secrets) {
  atomicWriteJson(file, { version: 2, secrets })
}

function secureStorageError(status = safeStorageState(safeStorage)) {
  if (status.backend === 'basic_text') return 'secure-storage-basic-text'
  return 'secure-storage-unavailable'
}

function encrypt(value) {
  const status = safeStorageState(safeStorage)
  if (!status.secure) throw new Error(secureStorageError(status))
  return safeStorage.encryptString(String(value)).toString('base64')
}

function decrypt(value) {
  const status = safeStorageState(safeStorage)
  if (!status.secure) throw new Error(secureStorageError(status))
  return safeStorage.decryptString(Buffer.from(String(value), 'base64'))
}

function decryptLegacy(value) {
  const [ivHex, encHex, ...extra] = String(value ?? '').split(':')
  if (!ivHex || !encHex || extra.length) throw new Error('malformed legacy secret')
  const iv = Buffer.from(ivHex, 'hex')
  const encrypted = Buffer.from(encHex, 'hex')
  if (iv.length !== 16 || !encrypted.length) throw new Error('malformed legacy secret')
  const salt = 'sush-secrets-v1'
  const key = scryptSync(`${hostname() || 'sush-host'}-${salt}`, salt, 32)
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

function validKey(value) {
  const key = String(value ?? '')
  // Legacy Sush accepted arbitrary key names. Preserve useful punctuation and
  // spaces (keys never become paths), while excluding terminal-control bytes.
  return key.length >= 1 && key.length <= 160 && !/[\u0000-\u001f\u007f]/.test(key) ? key : null
}

export const secrets = {
  name: 'secrets',
  description: 'Manage OS-encrypted secrets for this Sush identity',
  usage: 'secrets <list|set|get|delete> [key] [value]',
  async run([sub, rawKey, ...rest]) {
    const loaded = loadStore()
    if (!loaded.ok) return err(`secrets: ${loaded.error}`)
    const store = loaded.secrets
    if (!sub || sub === 'list') {
      const keys = Object.keys(store)
      if (!keys.length) return ok(ansi.dim('No secrets stored for this identity'))
      const lines = keys.map(k => `  ${ansi.cyan(k)}  ${ansi.dim('••••••••')}`)
      return ok([ansi.bold(ansi.pink('SECRETS')), ansi.dim('─'.repeat(30)), ...lines].join('\r\n'))
    }

    const key = validKey(rawKey)
    if (!key) return err(`secrets ${sub}: key must be 1–160 characters without control characters`)

    if (sub === 'set') {
      const value = rest.join(' ')
      if (!value) return err('secrets set: missing value')
      try {
        const next = { ...store, [key]: encrypt(value) }
        saveStore(loaded.target, next)
        return ok(ansi.green(`secret '${key}' saved for this identity`))
      } catch (e) {
        return err(`secrets: ${e.message}`)
      }
    }
    if (sub === 'get') {
      if (!Object.hasOwn(store, key)) return err(`secrets: '${key}' not found`)
      try {
        return ok(`${ansi.cyan(key)}: ${decrypt(store[key])}`)
      } catch {
        return err(`secrets: failed to decrypt '${key}' for this identity`)
      }
    }
    if (sub === 'delete') {
      if (!Object.hasOwn(store, key)) return err(`secrets: '${key}' not found`)
      const next = { ...store }
      delete next[key]
      try { saveStore(loaded.target, next) } catch (e) { return err(`secrets: ${e.message}`) }
      return ok(ansi.yellow(`deleted: ${key}`))
    }
    return err(`secrets: unknown subcommand '${sub}'`)
  }
}
