import { createSecureConfigStore } from './provider-config'

// Cloud text-to-speech for Seducia — the user's OWN OpenAI/ElevenLabs key, used
// to swap the robotic system (Windows SAPI) voice for a real neural one.
// Storage/key rules live in provider-config.js: the key never crosses IPC —
// the renderer sends text and gets back audio bytes — and it's keychain-
// encrypted at rest when possible.

const PROVIDERS = ['system', 'openai', 'elevenlabs']
const DEFAULTS = {
  openai: { model: 'gpt-4o-mini-tts', voice: 'alloy' },
  elevenlabs: { model: 'eleven_turbo_v2_5', voice: '21m00Tcm4TlvDq8ikWAM' } // "Rachel"
}

const emptyConfig = () => ({ provider: 'system', voice: '', model: '', key: '', keyEnc: false })

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

const store = createSecureConfigStore({
  fileName: 'sush-tts.json',
  migrationMarker: 'tts-config',
  emptyConfig,
  normalize: normalizeConfig
})

function publicConfig(c, status = store.securityState()) {
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
  const loaded = store.load()
  if (!loaded.ok) return { ok: false, error: loaded.error, ...publicConfig(emptyConfig()) }
  return publicConfig(loaded.config, loaded.security)
}

export function setTtsConfig({ provider, voice, model, apiKey } = {}) {
  const loaded = store.load()
  if (!loaded.ok) return { ok: false, error: loaded.error }
  const c = { ...loaded.config }
  if (provider !== undefined) c.provider = PROVIDERS.includes(provider) ? provider : 'system'
  if (voice !== undefined) c.voice = String(voice || '').slice(0, 120)
  if (model !== undefined) c.model = String(model || '').slice(0, 80)
  if (apiKey !== undefined) {
    const keyed = store.applyKey(c, apiKey, loaded.security)
    if (!keyed.ok) return keyed
  }
  const saved = store.persist(loaded, c)
  if (!saved.ok) return saved
  return { ok: true, ...publicConfig(c, loaded.security) }
}

// Synthesize speech. Returns { ok, audio(base64), mime } on success, or
// { ok:false, fallback:true } when the renderer should just use the system
// voice (provider is 'system' or no key), or { ok:false, error } on a real
// failure (the renderer still falls back to the system voice, but shows this).
export async function synthesizeTts({ text, rate } = {}) {
  const loaded = store.load()
  if (!loaded.ok) return { ok: false, error: loaded.error }
  const c = loaded.config
  const provider = PROVIDERS.includes(c.provider) ? c.provider : 'system'
  if (provider === 'system') return { ok: false, fallback: true }
  const key = store.decryptKey(c)
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
