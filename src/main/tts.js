import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'

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

const file = () => join(app.getPath('userData'), 'sush-tts.json')

let cache = null
function load() {
  if (cache) return cache
  try {
    if (existsSync(file())) {
      const data = JSON.parse(readFileSync(file(), 'utf8'))
      if (data && typeof data === 'object') cache = data
    }
  } catch {}
  if (!cache) cache = { provider: 'system', voice: '', model: '', key: '', keyEnc: false }
  return cache
}

function persist() {
  try { writeFileSync(file(), JSON.stringify(cache, null, 2), 'utf8'); return true } catch { return false }
}

function decryptKey() {
  const c = load()
  if (!c.key) return ''
  if (!c.keyEnc) return c.key
  try { return safeStorage.decryptString(Buffer.from(c.key, 'base64')) } catch { return '' }
}

// What the renderer is allowed to see: never the key itself, just whether one
// is set, plus the provider/voice/model and the keychain availability.
export function getTtsConfigPublic() {
  const c = load()
  return {
    provider: PROVIDERS.includes(c.provider) ? c.provider : 'system',
    voice: c.voice || '',
    model: c.model || '',
    hasKey: !!c.key,
    safeStorage: safeStorage.isEncryptionAvailable(),
    defaults: DEFAULTS
  }
}

export function setTtsConfig({ provider, voice, model, apiKey } = {}) {
  const c = load()
  if (provider !== undefined) c.provider = PROVIDERS.includes(provider) ? provider : 'system'
  if (voice !== undefined) c.voice = String(voice || '').slice(0, 120)
  if (model !== undefined) c.model = String(model || '').slice(0, 80)
  if (apiKey !== undefined) {
    const key = String(apiKey || '')
    if (!key) { c.key = ''; c.keyEnc = false }
    else if (safeStorage.isEncryptionAvailable()) { c.key = safeStorage.encryptString(key).toString('base64'); c.keyEnc = true }
    else { c.key = key; c.keyEnc = false }
  }
  persist()
  return { ok: true, ...getTtsConfigPublic() }
}

// Synthesize speech. Returns { ok, audio(base64), mime } on success, or
// { ok:false, fallback:true } when the renderer should just use the system
// voice (provider is 'system' or no key), or { ok:false, error } on a real
// failure (the renderer still falls back to the system voice, but shows this).
export async function synthesizeTts({ text, rate } = {}) {
  const c = load()
  const provider = PROVIDERS.includes(c.provider) ? c.provider : 'system'
  if (provider === 'system') return { ok: false, fallback: true }
  const key = decryptKey()
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
