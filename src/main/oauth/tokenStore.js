import { app, safeStorage } from 'electron'
import { existsSync } from 'fs'
import {
  atomicWriteJson,
  identityDirectoryPath,
  identityStoragePath,
  readJsonObject,
  safeStorageState
} from '../secure-storage'

// Per-identity token vault: userData/identities/<id>/auth.json. Tokens are
// safeStorage-encrypted (DPAPI on Windows) and never cross the IPC boundary.
// If OS encryption is unavailable we refuse to persist rather than write
// plaintext — GitHub features then run off the gh CLI login only.

function identityDir(userId) {
  return identityDirectoryPath(app.getPath('userData'), userId)
}

function authFile(userId) {
  return identityStoragePath(app.getPath('userData'), userId, 'auth.json')
}

export function encryptionAvailable() {
  return safeStorageState(safeStorage).secure
}

function readVault(userId) {
  const file = authFile(userId)
  if (!file) return { ok: false, error: 'Invalid identity' }
  try {
    if (!existsSync(file)) return { ok: true, vault: {} }
    return { ok: true, vault: readJsonObject(file) }
  } catch {
    return { ok: false, error: 'Could not read token vault' }
  }
}

function writeVault(userId, vault) {
  try {
    const dir = identityDir(userId)
    const file = authFile(userId)
    if (!dir || !file) return false
    atomicWriteJson(file, { ...vault, version: 1 })
    return true
  } catch {
    return false
  }
}

export function saveToken(userId, provider, token, meta = {}) {
  if (!identityDir(userId)) return { ok: false, error: 'Token not stored: invalid identity' }
  const security = safeStorageState(safeStorage)
  if (!security.secure) {
    const reason = security.backend === 'basic_text' ? 'insecure Linux basic_text backend' : 'OS encryption unavailable'
    return { ok: false, error: `Token not stored: ${reason}` }
  }
  let blob
  try {
    blob = safeStorage.encryptString(String(token)).toString('base64')
  } catch (e) {
    return { ok: false, error: e.message }
  }
  const loaded = readVault(userId)
  if (!loaded.ok) return loaded
  const vault = { ...loaded.vault }
  vault[provider] = { ...meta, blob, createdAt: Date.now() }
  return writeVault(userId, vault) ? { ok: true } : { ok: false, error: 'Could not write token vault' }
}

export function getToken(userId, provider) {
  const loaded = readVault(userId)
  if (!loaded.ok) return null
  const entry = loaded.vault[provider]
  if (!entry?.blob || !encryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(entry.blob, 'base64'))
  } catch {
    return null
  }
}

export function deleteToken(userId, provider) {
  if (!identityDir(userId)) return { ok: false, error: 'Invalid identity' }
  const loaded = readVault(userId)
  if (!loaded.ok) return loaded
  const vault = { ...loaded.vault }
  if (vault[provider]) {
    delete vault[provider]
    if (!writeVault(userId, vault)) return { ok: false, error: 'Could not write token vault' }
  }
  return { ok: true }
}
