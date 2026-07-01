import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { getCredits, canSpend, consumeCredits } from './credits'

// ── Whisper dictation (speech-to-text) ───────────────────────────────────────
// The renderer's old dictation used the browser Web Speech API, which depends
// on Google's speech servers that Electron doesn't bundle — so it failed with a
// `network` error in the packaged app. This replaces it with Whisper over the
// user's OWN OpenAI key, exactly mirroring the TTS module's security model:
//
//   • The API key is read and used ONLY here in main; it never crosses IPC.
//   • At rest it's encrypted with the OS keychain (safeStorage) when available,
//     else stored plaintext (the user's own key on their own machine) with a
//     safeStorage:false flag so the UI can warn.
//   • The renderer captures mic audio (MediaRecorder) and sends the bytes; main
//     forwards them to the transcription API and returns text.
//
// Engine is provider-shaped so a local/offline Whisper can drop in later without
// touching the renderer or IPC — only this file gains a branch.
const PROVIDERS = ['openai']
const DEFAULTS = { openai: { model: 'whisper-1' } }

const file = () => join(app.getPath('userData'), 'sush-stt.json')

let cache = null
function load() {
  if (cache) return cache
  try {
    if (existsSync(file())) {
      const data = JSON.parse(readFileSync(file(), 'utf8'))
      if (data && typeof data === 'object') cache = data
    }
  } catch {}
  if (!cache) cache = { provider: 'openai', model: '', key: '', keyEnc: false }
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

// Renderer-safe view: never the key itself, just whether one is set + config.
// Credits ride along so the dictation UI can show the remaining allowance.
export function getSttConfigPublic() {
  const c = load()
  return {
    provider: PROVIDERS.includes(c.provider) ? c.provider : 'openai',
    model: c.model || '',
    hasKey: !!c.key,
    safeStorage: safeStorage.isEncryptionAvailable(),
    defaults: DEFAULTS,
    credits: getCredits()
  }
}

export function setSttConfig({ provider, model, apiKey } = {}) {
  const c = load()
  if (provider !== undefined) c.provider = PROVIDERS.includes(provider) ? provider : 'openai'
  if (model !== undefined) c.model = String(model || '').slice(0, 80)
  if (apiKey !== undefined) {
    const key = String(apiKey || '')
    if (!key) { c.key = ''; c.keyEnc = false }
    else if (safeStorage.isEncryptionAvailable()) { c.key = safeStorage.encryptString(key).toString('base64'); c.keyEnc = true }
    else { c.key = key; c.keyEnc = false }
  }
  persist()
  return { ok: true, ...getSttConfigPublic() }
}

// Transcribe a captured clip. `audio` is base64, `mime` its container type,
// `seconds` the recorded duration (the renderer knows it — Whisper's response
// doesn't reliably include it). Spends Quiet Credits on success.
export async function transcribe({ audio, mime, seconds, language } = {}) {
  const c = load()
  const provider = PROVIDERS.includes(c.provider) ? c.provider : 'openai'
  const dur = Math.max(0, Number(seconds) || 0)

  if (!canSpend(dur)) {
    const credits = getCredits()
    return { ok: false, error: 'out-of-credits', credits }
  }
  const key = decryptKey()
  if (!key) return { ok: false, error: 'no-key' }
  if (!audio) return { ok: false, error: 'No audio captured.' }

  try {
    const bytes = Buffer.from(String(audio), 'base64')
    if (!bytes.length) return { ok: false, error: 'Empty audio clip.' }
    const text = provider === 'openai'
      ? await openaiTranscribe(bytes, mime, key, c, language)
      : null
    if (text == null) return { ok: false, error: 'Transcription provider unavailable.' }
    // Charge the meter for the audio we actually sent (min 1s so a real clip
    // always costs something), then hand back the fresh balance.
    const credits = consumeCredits(Math.max(1, dur))
    return { ok: true, text: String(text).trim(), credits }
  } catch (e) {
    return { ok: false, error: e?.message || 'Transcription failed.' }
  }
}

async function openaiTranscribe(bytes, mime, key, c, language) {
  // Node 20 (Electron 31) ships global fetch/FormData/Blob.
  const form = new FormData()
  const ext = mime && mime.includes('wav') ? 'wav' : mime && mime.includes('mp4') ? 'mp4' : 'webm'
  form.append('file', new Blob([bytes], { type: mime || 'audio/webm' }), `clip.${ext}`)
  form.append('model', c.model || DEFAULTS.openai.model)
  form.append('response_format', 'json')
  if (language) form.append('language', String(language).slice(0, 8))

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form
  })
  if (!res.ok) {
    const detail = (await safeText(res)).slice(0, 200)
    throw new Error(`OpenAI transcription ${res.status}: ${detail}`)
  }
  const data = await res.json().catch(() => ({}))
  return data?.text ?? ''
}

async function safeText(res) { try { return await res.text() } catch { return '' } }
