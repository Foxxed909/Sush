import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { randomBytes } from 'crypto'
import { dirname, isAbsolute, join, relative, resolve } from 'path'

// Identity IDs are generated as the first eight lowercase hex characters of a
// UUID. Keeping that canonical shape avoids case-folding collisions on Windows
// and default macOS filesystems as well as every path-segment edge case.
const IDENTITY_ID = /^[0-9a-f]{8}$/
const STORAGE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/
const MIGRATION_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const LINUX_SECURE_BACKENDS = new Set(['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'])

export function validIdentityId(value) {
  const id = typeof value === 'string' ? value : ''
  return IDENTITY_ID.test(id) ? id : null
}

export function identityDirectoryPath(userData, identityId) {
  const id = validIdentityId(identityId)
  if (!id) return null

  const identities = resolve(String(userData || ''), 'identities')
  const target = resolve(identities, id)
  const inside = relative(identities, target)
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) return null
  return target
}

export function identityStoragePath(userData, identityId, fileName) {
  const identityDir = identityDirectoryPath(userData, identityId)
  if (!identityDir || !STORAGE_FILE.test(String(fileName || ''))) return null
  const target = resolve(identityDir, fileName)
  const inside = relative(identityDir, target)
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) return null
  return target
}

// A signed-out installation with identities is locked, not a legacy profile.
// The global file is only a live store before the first identity exists.
export function resolveIdentityStorage({
  userData,
  activeUser,
  users,
  legacyOwnerId,
  legacyOwnershipEstablished = false,
  fileName,
  legacyPath
}) {
  const knownUsers = Array.isArray(users) ? users : []
  if (activeUser) {
    const identityId = validIdentityId(activeUser.id)
    const target = identityStoragePath(userData, identityId, fileName)
    if (!identityId || !target) return { ok: false, error: 'invalid-identity' }
    return {
      ok: true,
      kind: 'identity',
      identityId,
      target,
      legacyPath,
      ownsLegacy: validIdentityId(legacyOwnerId) === identityId
    }
  }
  if (knownUsers.length || legacyOwnershipEstablished || validIdentityId(legacyOwnerId)) {
    return { ok: false, error: 'no-user' }
  }
  return { ok: true, kind: 'legacy', identityId: null, target: legacyPath, legacyPath, ownsLegacy: false }
}

export function readJsonObject(file) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid JSON object')
  }
  return parsed
}

// Write beside the destination and rename only after the complete JSON has
// reached disk. The temporary file is private from creation, not chmodded
// after sensitive bytes have already been exposed.
export function atomicWriteJson(file, value) {
  const dir = dirname(file)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const temp = join(dir, `.${String(file).split(/[\\/]/).pop()}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`)
  let fd = null
  try {
    fd = openSync(temp, 'wx', 0o600)
    writeFileSync(fd, JSON.stringify(value, null, 2), 'utf8')
    fsyncSync(fd)
    closeSync(fd)
    fd = null
    renameSync(temp, file)
    try { chmodSync(file, 0o600) } catch {}
  } catch (error) {
    if (fd !== null) {
      try { closeSync(fd) } catch {}
    }
    try { if (existsSync(temp)) unlinkSync(temp) } catch {}
    throw error
  }
}

export function safeStorageState(storage, { platform = process.platform } = {}) {
  let available = false
  let backend = null
  try { available = !!storage?.isEncryptionAvailable?.() } catch {}
  if (platform === 'linux' && typeof storage?.getSelectedStorageBackend === 'function') {
    try { backend = storage.getSelectedStorageBackend() || null } catch {}
  }

  // Electron's Linux `basic_text` backend only obfuscates with a hard-coded
  // password. Fail closed when the backend cannot be identified as one of the
  // keyring-backed implementations Electron exposes.
  const secure = available && (platform !== 'linux' || LINUX_SECURE_BACKENDS.has(backend))
  return { available, secure, backend }
}

export function protectConfigKey(config, storage, status = safeStorageState(storage)) {
  const next = { ...config }
  if (!next.key) return { ok: true, config: next, changed: false }

  if (next.keyEnc) {
    if (!status.available) return { ok: false, error: 'secure-storage-unavailable' }
    try {
      storage.decryptString(Buffer.from(String(next.key), 'base64'))
      return { ok: true, config: next, changed: false }
    } catch {
      return { ok: false, error: 'key-decryption-failed' }
    }
  }

  if (!status.secure) return { ok: true, config: next, changed: false }
  try {
    next.key = storage.encryptString(String(next.key)).toString('base64')
    next.keyEnc = true
    return { ok: true, config: next, changed: true }
  } catch {
    return { ok: false, error: 'key-encryption-failed' }
  }
}

export function migrationMarkerPath(userData, name) {
  if (!MIGRATION_NAME.test(String(name || ''))) return null
  return join(String(userData || ''), '.legacy-migrations', `${name}.json`)
}

function writeExclusiveJson(file, value) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  let fd = null
  try {
    fd = openSync(file, 'wx', 0o600)
    writeFileSync(fd, JSON.stringify(value, null, 2), 'utf8')
    fsyncSync(fd)
    closeSync(fd)
    fd = null
    try { chmodSync(file, 0o600) } catch {}
    return true
  } catch (error) {
    if (fd !== null) {
      try { closeSync(fd) } catch {}
    }
    if (error?.code === 'EEXIST') return false
    throw error
  }
}

export function claimLegacyMigration(marker, identityId) {
  const id = validIdentityId(identityId)
  if (!marker || !id) return { ok: false, error: 'invalid-identity' }
  const pending = { version: 1, claimedBy: id, state: 'pending', updatedAt: Date.now() }

  try {
    if (writeExclusiveJson(marker, pending)) return { ok: true, claim: pending, resumed: false }
    const existing = readJsonObject(marker)
    if (existing.claimedBy === id && existing.state === 'pending') {
      return { ok: true, claim: existing, resumed: true }
    }
    return { ok: false, error: 'legacy-claimed' }
  } catch {
    // A corrupt or unreadable claim fails closed; it must never let a second
    // identity take possession of a global credential file.
    return { ok: false, error: 'migration-claim-failed' }
  }
}

export function migrateLegacyOnce({ marker, identityId, target, transform }) {
  const claimed = claimLegacyMigration(marker, identityId)
  if (!claimed.ok) return claimed

  let value
  try {
    value = transform()
  } catch (cause) {
    return { ok: false, error: 'migration-failed', cause }
  }

  try {
    atomicWriteJson(target, value)
    atomicWriteJson(marker, {
      version: 1,
      claimedBy: identityId,
      state: 'complete',
      updatedAt: Date.now()
    })
    return { ok: true, value, migrated: true }
  } catch (cause) {
    // Leave the claim pending for the same identity to resume. The source is
    // intentionally never modified by this transaction.
    return { ok: false, error: 'migration-write-failed', cause }
  }
}

export function transformLegacySecretStore(parsed, { decryptLegacy, encrypt, validateKey = key => key }) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid legacy secret store')
  }

  // Fully decrypt before encrypting anything. A single bad value aborts the
  // conversion, so callers can never persist a silently truncated vault.
  const plaintext = Object.entries(parsed).map(([key, value]) => {
    const acceptedKey = validateKey(key)
    if (!acceptedKey) throw new Error(`invalid legacy secret key: ${key}`)
    if (typeof value !== 'string') throw new Error(`invalid legacy secret: ${key}`)
    return [acceptedKey, decryptLegacy(value)]
  })
  const secrets = Object.fromEntries(plaintext.map(([key, value]) => [key, encrypt(value)]))
  return { version: 2, secrets }
}
