import { app } from 'electron'
import { dirname, join } from 'path'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'fs'
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'crypto'
import { accountSlotEnv } from './accounts'
import { atomicWriteJson, identityDirectoryPath, identityStoragePath, validIdentityId } from './secure-storage'

// ── Sush Identities ──────────────────────────────────────────────────────────
// Multiple people can share one Sush install without their CLI logins mixing.
// Each identity gets its own directory tree under userData/identities/<id>/home,
// and every PTY spawned while that identity is active gets env vars pointing
// the well-known CLIs (claude / codex / gh / XDG tools) at that tree — so
// User 1's `claude` login (their Google account) lives in their space, and
// User 2 signs into their own. "Full" isolation additionally redirects
// HOME / USERPROFILE / APPDATA / LOCALAPPDATA, which catches CLIs that key off
// os.homedir() (gemini, opencode, git, ssh…) at the cost of a fresh dotfile
// world per identity.
//
// The PIN is a convenience lock against casual access on a shared machine —
// it is NOT encryption. Credentials on disk are as readable as they ever were.

const STORE_VERSION = 2

function emptyStore() {
  return {
    version: STORE_VERSION,
    users: [],
    activeId: null,
    lastUserId: null,
    legacyOwnerId: null,
    legacyOwnershipEstablished: false
  }
}

let storeFile = null
let store = emptyStore()
let identityTransitionHandler = null

// Main owns process/session cleanup, while this module owns every activation
// path (PIN and OAuth). A callback keeps those responsibilities separated and
// guarantees provider sign-in cannot bypass the same identity transition.
export function setIdentityTransitionHandler(fn) {
  identityTransitionHandler = typeof fn === 'function' ? fn : null
}

export function userHomeDir(userId) {
  const home = identityStoragePath(app.getPath('userData'), userId, 'home')
  if (!home) throw new Error('Invalid identity id')
  return home
}

function load() {
  storeFile = join(app.getPath('userData'), 'sush-users.json')
  store = emptyStore()
  try {
    if (existsSync(storeFile)) {
      const data = JSON.parse(readFileSync(storeFile, 'utf8'))
      if (data && Array.isArray(data.users)) {
        const seen = new Set()
        const users = data.users.filter(user => {
          const id = validIdentityId(user?.id)
          if (!id || seen.has(id) || !identityDirectoryPath(app.getPath('userData'), id)) return false
          seen.add(id)
          return true
        })
        const lastUserId = validIdentityId(data.lastUserId)
        const hasStoredLegacyOwner = data.legacyOwnershipEstablished === true || Object.hasOwn(data, 'legacyOwnerId')
        // Older stores predate explicit ownership. Bind their legacy data to
        // the first surviving identity once, then never reassign it on delete.
        const legacyOwnerId = hasStoredLegacyOwner
          ? validIdentityId(data.legacyOwnerId)
          : (users[0]?.id || null)
        store = {
          version: STORE_VERSION,
          users,
          activeId: null,
          lastUserId: lastUserId && seen.has(lastUserId) ? lastUserId : null,
          legacyOwnerId,
          legacyOwnershipEstablished: hasStoredLegacyOwner || !!legacyOwnerId
        }
      }
    }
  } catch {}
}

function save() {
  if (!storeFile) return false
  try {
    // activeId is runtime-only (a fresh launch starts signed out / auto-resumes
    // via lastUserId) — persist everything else.
    const { activeId, ...rest } = store
    atomicWriteJson(storeFile, rest)
    return true
  } catch { return false }
}

function snapshotStore() {
  return JSON.parse(JSON.stringify(store))
}

function hashPin(pin, salt) {
  return scryptSync(String(pin), salt, 32).toString('hex')
}

// Public shape — never includes pin material.
function publicUser(user) {
  if (!user) return null
  const { pinHash, pinSalt, ...rest } = user
  return { ...rest, hasPin: !!pinHash }
}

function findUser(id) {
  return store.users.find(u => u.id === id) || null
}

function ensureUserDirs(user) {
  const home = userHomeDir(user.id)
  const dirs = [
    home,
    join(home, '.claude'),
    join(home, '.codex'),
    join(home, '.gh'),
    join(home, '.config'),
    join(home, '.cache'),
    join(home, '.local', 'share'),
    join(home, '.local', 'state'),
    join(home, 'AppData', 'Roaming'),
    join(home, 'AppData', 'Local')
  ]
  for (const dir of dirs) {
    try { if (!existsSync(dir)) mkdirSync(dir, { recursive: true }) } catch {}
  }
  return home
}

export function initUsers() {
  load()
}

export function listUsers() {
  return store.users.map(publicUser)
}

export function getActiveUser() {
  return publicUser(findUser(store.activeId))
}

export function getLastUserId() {
  return store.lastUserId
}

export function getLegacyOwnerId() {
  return store.legacyOwnershipEstablished ? store.legacyOwnerId : null
}

export function isLegacyOwnershipEstablished() {
  return store.legacyOwnershipEstablished
}

export function createUser({ name, color, avatar, avatarUrl, pin, isolation } = {}) {
  const previous = snapshotStore()
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return { ok: false, error: 'Name is required' }
  if (store.users.some(u => u.name.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, error: 'A user with that name already exists' }
  }
  const user = {
    id: randomUUID().slice(0, 8),
    name: trimmed.slice(0, 32),
    color: String(color || '#ff6b9d'),
    avatar: String(avatar || trimmed[0].toUpperCase()).slice(0, 2),
    isolation: isolation === 'full' ? 'full' : 'cli',
    createdAt: Date.now(),
    lastUsedAt: null
  }
  // Profile picture chosen at create time (data URL from the renderer's
  // 128px crop, or a provider avatar URL carried by the prefilled form).
  if (typeof avatarUrl === 'string' && avatarUrl.trim()) user.avatarUrl = avatarUrl.trim()
  const pinValue = String(pin ?? '').trim()
  if (pinValue) {
    if (!/^\d{4,8}$/.test(pinValue)) return { ok: false, error: 'PIN must be 4–8 digits' }
    user.pinSalt = randomBytes(16).toString('hex')
    user.pinHash = hashPin(pinValue, user.pinSalt)
    // Length is exposed so the lock screen can auto-submit on the last digit.
    // Acceptable disclosure for a casual lock (PIN space is 4-8 digits anyway).
    user.pinLength = pinValue.length
  }
  store.users.push(user)
  if (!store.legacyOwnershipEstablished) {
    store.legacyOwnerId = user.id
    store.legacyOwnershipEstablished = true
  }
  const identityDir = identityDirectoryPath(app.getPath('userData'), user.id)
  const createdIdentityDir = !!identityDir && !existsSync(identityDir)
  ensureUserDirs(user)
  if (!save()) {
    store = previous
    if (createdIdentityDir) {
      try { rmSync(identityDir, { recursive: true, force: true }) } catch {}
    }
    return { ok: false, error: 'Could not save identity' }
  }
  return { ok: true, user: publicUser(user) }
}

export function updateUser({ id, patch = {}, newPin } = {}) {
  const previous = snapshotStore()
  const user = findUser(id)
  if (!user) return { ok: false, error: 'User not found' }
  if (typeof patch.name === 'string' && patch.name.trim()) {
    const nextName = patch.name.trim().slice(0, 32)
    if (store.users.some(u => u.id !== id && u.name.toLowerCase() === nextName.toLowerCase())) {
      return { ok: false, error: 'A user with that name already exists' }
    }
    user.name = nextName
  }
  if (typeof patch.color === 'string') user.color = patch.color
  if (typeof patch.avatar === 'string' && patch.avatar.trim()) user.avatar = patch.avatar.trim().slice(0, 2)
  if (patch.isolation === 'full' || patch.isolation === 'cli') user.isolation = patch.isolation
  // Custom profile picture (data URL from the profile viewer, capped by the
  // renderer's 128px downscale). Empty string removes it.
  if (typeof patch.avatarUrl === 'string') {
    if (patch.avatarUrl.trim()) user.avatarUrl = patch.avatarUrl.trim()
    else delete user.avatarUrl
  }
  if (newPin !== undefined) {
    const pinValue = String(newPin ?? '').trim()
    if (!pinValue) {
      delete user.pinHash
      delete user.pinSalt
      delete user.pinLength
    } else {
      if (!/^\d{4,8}$/.test(pinValue)) return { ok: false, error: 'PIN must be 4–8 digits' }
      user.pinSalt = randomBytes(16).toString('hex')
      user.pinHash = hashPin(pinValue, user.pinSalt)
      user.pinLength = pinValue.length
    }
  }
  if (!save()) {
    store = previous
    return { ok: false, error: 'Could not save identity' }
  }
  return { ok: true, user: publicUser(user) }
}

export function deleteUser({ id, wipeData } = {}) {
  const previous = snapshotStore()
  const user = findUser(id)
  if (!user) return { ok: false, error: 'User not found' }
  let stagedDir = null
  let originalDir = null
  if (wipeData) {
    try {
      originalDir = identityDirectoryPath(app.getPath('userData'), id)
      if (!originalDir) return { ok: false, error: 'Invalid identity data path' }
      if (existsSync(originalDir)) {
        stagedDir = join(dirname(originalDir), `.deleting-${id}-${randomBytes(4).toString('hex')}`)
        renameSync(originalDir, stagedDir)
      }
    } catch {
      return { ok: false, error: 'Could not fully wipe identity data; identity was not removed.' }
    }
  }
  store.users = store.users.filter(u => u.id !== id)
  if (store.activeId === id) store.activeId = null
  if (store.lastUserId === id) store.lastUserId = null
  if (!save()) {
    store = previous
    if (stagedDir && originalDir) {
      try { renameSync(stagedDir, originalDir) } catch {
        return { ok: false, error: 'Could not save identity, and its data could not be restored automatically.' }
      }
    }
    return { ok: false, error: 'Could not save identity' }
  }
  let warning = null
  if (stagedDir) {
    try {
      rmSync(stagedDir, { recursive: true, force: true })
      if (existsSync(stagedDir)) warning = 'Identity removed, but some quarantined data could not be erased.'
    } catch {
      warning = 'Identity removed, but some quarantined data could not be erased.'
    }
  }
  return warning ? { ok: true, warning } : { ok: true }
}

export function verifyPin(user, pin) {
  if (!user.pinHash || !user.pinSalt) return true
  const candidate = hashPin(String(pin ?? ''), user.pinSalt)
  try {
    return timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(user.pinHash, 'hex'))
  } catch {
    return false
  }
}

function doActivate(user, source = 'pin') {
  const previous = snapshotStore()
  const previousUserId = store.activeId
  store.activeId = user.id
  store.lastUserId = user.id
  user.lastUsedAt = Date.now()
  ensureUserDirs(user)
  if (!save()) {
    store = previous
    return null
  }
  if (previousUserId && previousUserId !== user.id) {
    try { identityTransitionHandler?.({ previousUserId, nextUserId: user.id, source }) } catch {}
  }
  return publicUser(user)
}

// Activate an identity (PIN-gated when the user has one). New PTYs spawned
// after this point inherit the identity's environment.
export function activateUser({ id, pin } = {}) {
  const user = findUser(id)
  if (!user) return { ok: false, error: 'User not found' }
  if (!verifyPin(user, pin)) return { ok: false, error: 'Wrong PIN' }
  const activated = doActivate(user)
  return activated ? { ok: true, user: activated } : { ok: false, error: 'Could not save identity' }
}

// ── Provider links (Google / GitHub sign-in) ─────────────────────────────────
// Identities can be backed by an external account. Google identifies by `sub`,
// GitHub by numeric `id` (stored as a string) — logins and emails can change,
// subjects cannot.

function providerSubjectOf(record, provider) {
  if (!record) return ''
  return String((provider === 'google' ? record.sub : record.id) ?? '')
}

export function findUserByProvider(provider, subject) {
  const want = String(subject ?? '')
  if (!want) return null
  return store.users.find(u => providerSubjectOf(u.providers?.[provider], provider) === want) || null
}

export function linkProvider({ id, provider, profile } = {}) {
  const previous = snapshotStore()
  const user = findUser(id)
  if (!user) return { ok: false, error: 'User not found' }
  if (provider !== 'google' && provider !== 'github') return { ok: false, error: 'Unknown provider' }
  const subject = provider === 'google' ? profile?.sub : profile?.id
  if (!subject) return { ok: false, error: 'Provider profile is missing its id' }
  const other = findUserByProvider(provider, subject)
  if (other && other.id !== user.id) {
    return { ok: false, error: `That ${provider} account is already linked to "${other.name}"` }
  }
  const record = provider === 'google'
    ? { sub: String(profile.sub), email: profile.email || '', name: profile.name || '', picture: profile.picture || '', linkedAt: Date.now() }
    : { id: String(profile.id), login: profile.login || '', name: profile.name || '', avatarUrl: profile.avatarUrl || '', linkedAt: Date.now() }
  user.providers = { ...(user.providers || {}), [provider]: record }
  const picture = provider === 'google' ? record.picture : record.avatarUrl
  if (!user.avatarUrl && picture) user.avatarUrl = picture
  if (!save()) {
    store = previous
    return { ok: false, error: 'Could not save identity' }
  }
  return { ok: true, user: publicUser(user) }
}

export function unlinkProvider({ id, provider } = {}) {
  const previous = snapshotStore()
  const user = findUser(id)
  if (!user) return { ok: false, error: 'User not found' }
  const record = user.providers?.[provider]
  if (!record) return { ok: false, error: 'Not linked' }
  const picture = provider === 'google' ? record.picture : record.avatarUrl
  if (user.avatarUrl && user.avatarUrl === picture) delete user.avatarUrl
  delete user.providers[provider]
  if (!Object.keys(user.providers).length) delete user.providers
  if (!save()) {
    store = previous
    return { ok: false, error: 'Could not save identity' }
  }
  return { ok: true, user: publicUser(user) }
}

// Activate via a verified provider sign-in. Deliberately skips the PIN: the
// caller just proved possession of the linked account's live session, a
// stronger factor than a 4-8 digit PIN.
export function activateUserViaProvider({ provider, subject } = {}) {
  const user = findUserByProvider(provider, subject)
  if (!user) return { ok: false, error: 'no-match' }
  const activated = doActivate(user, `provider:${provider}`)
  return activated ? { ok: true, user: activated } : { ok: false, error: 'Could not save identity' }
}

export function signOut() {
  store.activeId = null
  save()
  return { ok: true }
}

// Environment overlay for PTYs spawned under the active identity. Returns {}
// when nobody is signed in (solo/legacy mode keeps working untouched).
export function activeUserEnv() {
  const user = findUser(store.activeId)
  if (!user) return {}
  const home = ensureUserDirs(user)
  const env = {
    SUSH_USER: user.name,
    SUSH_USER_ID: user.id,
    SUSH_USER_HOME: home,
    // Well-known CLI config redirects — these are honored regardless of HOME.
    CLAUDE_CONFIG_DIR: join(home, '.claude'),
    CODEX_HOME: join(home, '.codex'),
    GH_CONFIG_DIR: join(home, '.gh'),
    // XDG family — picked up by many cross-platform CLIs (opencode et al).
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
    XDG_STATE_HOME: join(home, '.local', 'state'),
    XDG_CACHE_HOME: join(home, '.cache')
  }
  if (user.isolation === 'full') {
    // Catch-all for CLIs that key off os.homedir()/USERPROFILE (gemini, git,
    // ssh, npm…). The identity gets a fresh dotfile world.
    env.HOME = home
    env.USERPROFILE = home
    env.APPDATA = join(home, 'AppData', 'Roaming')
    env.LOCALAPPDATA = join(home, 'AppData', 'Local')
  }
  // Account slots last: non-default CLI slots re-point provider-specific
  // config/home overlays at the slot, beating the identity default above.
  return { ...env, ...accountSlotEnv(user.id) }
}
