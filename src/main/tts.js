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

// Cloud text-to-speech for Seducia — the user's OWN OpenAI/ElevenLabs key, used
// to swap the robotic system (Windows SAPI) voice for a real neural one.
//
// Security: the API key is read and used ONLY here in main. It never crosses
// IPC to the renderer — the renderer sends text and gets back audio bytes. The
// key is encrypted at rest with the OS keychain (safeStorage) when available;
// if not, it's stored plaintext (it's the user's own key on their own machine,
// not an identity credential) and we flag safeStorage:false so the UI can warn.

const PROVIDERS = ['system', 'openai', 'elevenlabs']
const DEFAULTS = {
  openai: { model: 'gpt-4o-mini-tts', voice: 'alloy' },
  elevenlabs: { model: 'eleven_turbo_v2_5', voice: '21m00Tcm4TlvDq8ikWAM' } // "Rachel"
}

const legacyFile = () => join(app.getPath('userData'), 'sush-tts.json')
const emptyConfig = () => ({ provider: 'system', voice: '', model: '', key: '', keyEnc: false })

function storageScope() {
  const userData = app.getPath('userData')
  return resolveIdentityStorage({
    userData,
    activeUser: getActiveUser(),
    users: listUsers(),
    legacyOwnerId: getLegacyOwnerId(),
    legacyOwnershipEstablished: isLegacyOwnershipEstablished(),
    fileName: 'sush-tts.json',
    legacyPath: legacyFile()
  })
}

const caches = new Map()
function load() {
  const scope = storageScope()
  if (!scope.ok) return scope
  if (caches.has(scope.target)) return secureLoadedConfig(scope, caches.get(scope.target))

  if (existsSync(scope.target)) {
    try {
      return secureLoadedConfig(scope, normalizeConfig(readJsonObject(scope.target)))
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
    marker: migrationMarkerPath(app.getPath('userData'), 'tts-config'),
    identityId: scope.identityId,
    target: scope.target,
    transform: () => {
      const protectedConfig = protectConfigKey(normalizeConfig(readJsonObject(scope.legacyPath)), safeStorage, status)
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

function normalizeConfig(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('config-invalid')
  return {
    provider: typeof data.provider === 'string' ? data.provider : 'system',
    voice: typeof data.voice === 'string' ? data.voice.slice(0, 120) : '',
    model: typeof data.model === 'string' ? data.model.slice(0, 80) : '',
    key: typeof data.key === 'string' ? data.key.slice(0, 4096) : '',
    keyEnc: data.keyEnc === true
  }
}

function decryptKey(c) {
  if (!c.key) return ''
  if (!c.keyEnc) return c.key
  try { return safeStorage.decryptString(Buffer.from(c.key, 'base64')) } catch { return '' }
}

function publicConfig(c, status = safeStorageState(safeStorage)) {
  return {
    provider: PROVIDERS.includes(c.provider) ? c.provider : 'system',
    voice: c.voice || '',
    model: c.model || '',
    hasKey: !!c.key,
    safeStorage: status.secure,
    safeStorageBackend: status.backend,
    defaults: DEFAULTS
  }
}

// What the renderer is allowed to see: never the key itself, just whether one
// is set, plus the provider/voice/model and the keychain availability.
export function getTtsConfigPublic() {
  const loaded = load()
  if (!loaded.ok) return { ok: false, error: loaded.error, ...publicConfig(emptyConfig()) }
  return publicConfig(loaded.config, loaded.security)
}

export function setTtsConfig({ provider, voice, model, apiKey } = {}) {
  const loaded = load()
  if (!loaded.ok) return { ok: false, error: loaded.error }
  const c = { ...loaded.config }
  if (provider !== undefined) c.provider = PROVIDERS.includes(provider) ? provider : 'system'
  if (voice !== undefined) c.voice = String(voice || '').slice(0, 120)
  if (model !== undefined) c.model = String(model || '').slice(0, 80)
  if (apiKey !== undefined) {
    const key = String(apiKey || '')
    if (!key) { c.key = ''; c.keyEnc = false }
    else if (loaded.security.secure) {
      try { c.key = safeStorage.encryptString(key).toString('base64'); c.keyEnc = true } catch { return { ok: false, error: 'key-encryption-failed' } }
    }
    else { c.key = key; c.keyEnc = false }
  }
  try { atomicWriteJson(loaded.target, c) } catch { return { ok: false, error: 'persist-failed' } }
  caches.set(loaded.target, c)
  return { ok: true, ...publicConfig(c, loaded.security) }
}

// Synthesize speech. Returns { ok, audio(base64), mime } on success, or
// { ok:false, fallback:true } when the renderer should just use the system
// voice (provider is 'system' or no key), or { ok:false, error } on a real
// failure (the renderer still falls back to the system voice, but shows this).
export async function synthesizeTts({ text, rate } = {}) {
  const loaded = load()
  if (!loaded.ok) return { ok: false, error: loaded.error }
  const c = loaded.config
  const provider = PROVIDERS.includes(c.provider) ? c.provider : 'system'
  if (provider === 'system') return { ok: false, fallback: true }
  const key = decryptKey(c)
  if (!key) return { ok: false, error: `No API key set for ${provider}.`, fallback: true }
  const clean = String(text || '').slice(0, 4000)
  if (!clean) return { ok: false, error: 'Empty text' }
  try {
    if (provider === 'openai') return await openaiTts(clean, key, c, rate)
    if (provider === 'elevenlabs') return await elevenTts(clean, key, c)
    return { ok: false, fallback: true }
  } catch (e) {
    return { ok: false, error: e?.message || 'TTS request failed' }
  }
}

async function openaiTts(text, key, c, rate) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: c.model || DEFAULTS.openai.model,
      voice: c.voice || DEFAULTS.openai.voice,
      input: text,
      response_format: 'mp3',
      speed: clampSpeed(rate)
    })
  })
  if (!res.ok) return { ok: false, error: `OpenAI TTS ${res.status}: ${(await safeText(res)).slice(0, 160)}` }
  const buf = Buffer.from(await res.arrayBuffer())
  return { ok: true, audio: buf.toString('base64'), mime: 'audio/mpeg' }
}

async function elevenTts(text, key, c) {
  const voice = c.voice || DEFAULTS.elevenlabs.voice
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: c.model || DEFAULTS.elevenlabs.model })
  })
  if (!res.ok) return { ok: false, error: `ElevenLabs ${res.status}: ${(await safeText(res)).slice(0, 160)}` }
  const buf = Buffer.from(await res.arrayBuffer())
  return { ok: true, audio: buf.toString('base64'), mime: 'audio/mpeg' }
}

function clampSpeed(r) { const n = Number(r); return n >= 0.25 && n <= 4 ? n : 1.0 }
async function safeText(res) { try { return await res.text() } catch { return '' } }
