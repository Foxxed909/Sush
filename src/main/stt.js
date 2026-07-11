import { join } from 'path'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { getCredits, canSpend, consumeCredits } from './credits'
import { resolveExecutable, shimSpawnSpec } from './exec'
import { createSecureConfigStore } from './provider-config'

const execFileAsync = promisify(execFile)

// ── Whisper dictation (speech-to-text) ───────────────────────────────────────
// The renderer's old dictation used the browser Web Speech API, which depends
// on Google's speech servers that Electron doesn't bundle — so it failed with a
// `network` error in the packaged app. This replaces it with Whisper over the
// user's OWN OpenAI key. Storage/key rules live in provider-config.js: the key
// never crosses IPC, and it's keychain-encrypted at rest when possible. The
// renderer captures mic audio (MediaRecorder) and sends the bytes; main
// forwards them to the transcription engine and returns text.
//
// Engine is provider-shaped — and the promised local/offline engine is here:
// 'local' runs the user's own whisper.cpp binary against a downloaded model.
// Fully offline, no API key, and it never spends Quiet Credits (those
// denominate OpenAI's per-minute billing; your own CPU is free). The mic clip
// arrives as webm/opus, so local mode needs ffmpeg on PATH to convert it to
// the 16 kHz WAV whisper.cpp reads.
const PROVIDERS = ['openai', 'local']
const DEFAULTS = { openai: { model: 'whisper-1' }, local: { model: '' } }

const emptyConfig = () => ({ provider: 'openai', model: '', key: '', keyEnc: false, localBin: '', localModel: '' })

function normalizeConfig(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('config-invalid')
  return {
    provider: typeof data.provider === 'string' ? data.provider : 'openai',
    model: typeof data.model === 'string' ? data.model.slice(0, 80) : '',
    key: typeof data.key === 'string' ? data.key.slice(0, 4096) : '',
    keyEnc: data.keyEnc === true,
    localBin: typeof data.localBin === 'string' ? data.localBin.slice(0, 500) : '',
    localModel: typeof data.localModel === 'string' ? data.localModel.slice(0, 500) : ''
  }
}

const store = createSecureConfigStore({
  fileName: 'sush-stt.json',
  migrationMarker: 'stt-config',
  emptyConfig,
  normalize: normalizeConfig
})

function publicConfig(c, status = store.securityState()) {
  return {
    provider: PROVIDERS.includes(c.provider) ? c.provider : 'openai',
    model: c.model || '',
    hasKey: !!c.key,
    // Local whisper.cpp settings — plain paths, nothing secret.
    localBin: c.localBin || '',
    localModel: c.localModel || '',
    safeStorage: status.secure,
    safeStorageBackend: status.backend,
    defaults: DEFAULTS,
    credits: getCredits()
  }
}

// Renderer-safe view: never the key itself, just whether one is set + config.
// Credits ride along so the dictation UI can show the remaining allowance.
export function getSttConfigPublic() {
  const loaded = store.load()
  if (!loaded.ok) return { ok: false, error: loaded.error, ...publicConfig(emptyConfig()) }
  return publicConfig(loaded.config, loaded.security)
}

export function setSttConfig({ provider, model, apiKey, localBin, localModel } = {}) {
  const loaded = store.load()
  if (!loaded.ok) return { ok: false, error: loaded.error }
  const c = { ...loaded.config }
  if (provider !== undefined) c.provider = PROVIDERS.includes(provider) ? provider : 'openai'
  if (model !== undefined) c.model = String(model || '').slice(0, 80)
  if (localBin !== undefined) c.localBin = String(localBin || '').trim().slice(0, 500)
  if (localModel !== undefined) c.localModel = String(localModel || '').trim().slice(0, 500)
  if (apiKey !== undefined) {
    const keyed = store.applyKey(c, apiKey, loaded.security)
    if (!keyed.ok) return keyed
  }
  const saved = store.persist(loaded, c)
  if (!saved.ok) return saved
  return { ok: true, ...publicConfig(c, loaded.security) }
}

// Transcribe a captured clip. `audio` is base64, `mime` its container type,
// `seconds` the recorded duration (the renderer knows it — Whisper's response
// doesn't reliably include it). The OpenAI path spends Quiet Credits on
// success; the local path is free by design.
export async function transcribe({ audio, mime, seconds, language } = {}) {
  const loaded = store.load()
  if (!loaded.ok) return { ok: false, error: loaded.error }
  const c = loaded.config
  const provider = PROVIDERS.includes(c.provider) ? c.provider : 'openai'
  const dur = Math.max(0, Number(seconds) || 0)
  if (!audio) return { ok: false, error: 'No audio captured.' }

  try {
    const bytes = Buffer.from(String(audio), 'base64')
    if (!bytes.length) return { ok: false, error: 'Empty audio clip.' }

    if (provider === 'local') {
      const r = await localTranscribe(bytes, mime, c, language)
      if (!r.ok) return r
      return { ok: true, text: r.text, credits: getCredits() }
    }

    if (!canSpend(dur)) {
      return { ok: false, error: 'out-of-credits', credits: getCredits() }
    }
    const key = store.decryptKey(c)
    if (!key) return { ok: false, error: 'no-key' }
    const text = await openaiTranscribe(bytes, mime, key, c, language)
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

// ── Local whisper.cpp ────────────────────────────────────────────────────────
// clip.webm → (ffmpeg) → 16 kHz mono WAV → whisper.cpp → text on stdout.
// Everything happens in a throwaway temp dir; nothing leaves the machine.
function resolveWhisperBin(c) {
  if (c.localBin) return existsSync(c.localBin) ? c.localBin : null
  // Common whisper.cpp binary names, newest first.
  for (const name of ['whisper-cli', 'whisper-cpp', 'whisper']) {
    const hit = resolveExecutable(name)
    if (hit) return hit
  }
  return null
}

async function localTranscribe(bytes, mime, c, language) {
  const bin = resolveWhisperBin(c)
  if (!bin) {
    return { ok: false, error: c.localBin ? `whisper.cpp binary not found at "${c.localBin}".` : 'whisper.cpp not found — install it (binary `whisper-cli`) or set its path in Settings ▸ Voice & Dictation.' }
  }
  if (!c.localModel || !existsSync(c.localModel)) {
    return { ok: false, error: 'Set the whisper.cpp model path (a downloaded .bin/.gguf, e.g. ggml-base.en.bin) in Settings ▸ Voice & Dictation.' }
  }
  const ffmpeg = resolveExecutable('ffmpeg')
  if (!ffmpeg) {
    return { ok: false, error: 'ffmpeg not found on PATH — local dictation needs it to convert mic audio to WAV.' }
  }

  const dir = mkdtempSync(join(tmpdir(), 'sush-stt-'))
  const ext = mime && mime.includes('mp4') ? 'mp4' : mime && mime.includes('ogg') ? 'ogg' : 'webm'
  const clip = join(dir, `clip.${ext}`)
  const wav = join(dir, 'clip.wav')
  try {
    await writeFile(clip, bytes)
    const ff = shimSpawnSpec(ffmpeg, ['-y', '-i', clip, '-ar', '16000', '-ac', '1', '-f', 'wav', wav])
    await execFileAsync(ff.file, ff.args, { windowsHide: true, timeout: 30000 })

    const args = ['-m', c.localModel, '-f', wav, '-nt', '-np']
    if (language) args.push('-l', String(language).slice(0, 8))
    const wh = shimSpawnSpec(bin, args)
    const { stdout } = await execFileAsync(wh.file, wh.args, { windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 * 1024 })
    return { ok: true, text: String(stdout || '').trim() }
  } catch (e) {
    const detail = (e?.stderr || e?.message || '').toString().slice(0, 200)
    return { ok: false, error: `Local transcription failed: ${detail}` }
  } finally {
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}

async function safeText(res) { try { return await res.text() } catch { return '' } }
