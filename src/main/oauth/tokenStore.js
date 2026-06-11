import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

// Per-identity token vault: userData/identities/<id>/auth.json. Tokens are
// safeStorage-encrypted (DPAPI on Windows) and never cross the IPC boundary.
// If OS encryption is unavailable we refuse to persist rather than write
// plaintext — GitHub features then run off the gh CLI login only.

function identityDir(userId) {
  return join(app.getPath('userData'), 'identities', String(userId))
}

function authFile(userId) {
  return join(identityDir(userId), 'auth.json')
}

export function encryptionAvailable() {
  try { return safeStorage.isEncryptionAvailable() } catch { return false }
}

function readVault(userId) {
  try {
    const file = authFile(userId)
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) || {}
  } catch {}
  return {}
}

function writeVault(userId, vault) {
  try {
    mkdirSync(identityDir(userId), { recursive: true })
    writeFileSync(authFile(userId), JSON.stringify({ ...vault, version: 1 }, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}

export function saveToken(userId, provider, token, meta = {}) {
  if (!encryptionAvailable()) return { ok: false, error: 'Token not stored: OS encryption unavailable' }
  let blob
  try {
    blob = safeStorage.encryptString(String(token)).toString('base64')
  } catch (e) {
    return { ok: false, error: e.message }
  }
  const vault = readVault(userId)
  vault[provider] = { ...meta, blob, createdAt: Date.now() }
  return writeVault(userId, vault) ? { ok: true } : { ok: false, error: 'Could not write token vault' }
}

export function getToken(userId, provider) {
  const entry = readVault(userId)[provider]
  if (!entry?.blob || !encryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(entry.blob, 'base64'))
  } catch {
    return null
  }
}

export function deleteToken(userId, provider) {
  const vault = readVault(userId)
  if (vault[provider]) {
    delete vault[provider]
    writeVault(userId, vault)
  }
  return { ok: true }
}
