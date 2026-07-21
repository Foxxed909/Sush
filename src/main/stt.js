import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, mkdtempSync, rmSync, statSync } from 'fs'
import { writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { getCredits, canSpend, consumeCredits } from './credits'
import { resolveExecutable, shimSpawnSpec } from './exec'
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

const execFileAsync = promisify(execFile)

// ── Whisper dictation (speech-to-text) ───────────────────────────────────────
// The renderer's old dictation used the browser Web Speech API, which depends
// on Google's speech servers that Electron doesn't bundle — so it failed with a
// `network` error in the packaged app. This replaces it with Whisper over the
// user's chosen provider, exactly mirroring the TTS module's security model:
//
//   • The API key is read and used ONLY here in main; it never crosses IPC.
//   • At rest it's encrypted with the OS keychain (safeStorage) when available,
//     else stored plaintext (the user's own key on their own machine) with a
//     safeStorage:false flag so the UI can warn.
//   • The renderer captures mic audio (MediaRecorder) and sends the bytes; main
//     forwards them to the transcription engine and returns text.
//
// Engine is provider-shaped — and the promised local/offline engine is here:
// 'local' runs the user's own whisper.cpp binary against a downloaded model.
// Fully offline, no API key, and it never spends Quiet Credits (those
// denominate OpenAI's per-minute billing; your own CPU is free). The mic clip
// arrives as webm/opus, so local mode needs ffmpeg on PATH to convert it to
// the 16 kHz WAV whisper.cpp reads.
const PROVIDERS = ['openai', 'local']
const DEFAULTS = { openai: { model: 'whisper-1' }, local: { model: 'base.en' } }

const legacyFile = () => join(app.getPath('userData'), 'sush-stt.json')
const emptyConfig = () => ({ provider: 'local', model: '', key: '', keyEnc: false, localBin: '', localModel: '' })

// The optional managed install keeps local voice self-contained without
// forcing a large binary or model into every Sush package. Users can still
// point at any whisper.cpp build/model they already maintain elsewhere.
function managedLocalPaths() {
  const root = join(app.getPath('userData'), 'whisper')
  return {
    root,
    bin: join(root, process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'),
    model: join(root, 'models', 'ggml-base.en.bin')
  }
}

function storageScope() {
  const userData = app.getPath('userData')
  return resolveIdentityStorage({
    userData,
    activeUser: getActiveUser(),
    users: listUsers(),
    legacyOwnerId: getLegacyOwnerId(),
    legacyOwnershipEstablished: isLegacyOwnershipEstablished(),
    fileName: 'sush-stt.json',
    legacyPath: legacyFile()
  })
}

// Keep a distinct in-memory config for every identity. A single module-level
// object survived user switches and let the next profile use the prior
// profile's transcription key.
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
    marker: migrationMarkerPath(app.getPath('userData'), 'stt-config'),
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
    provider: typeof data.provider === 'string' ? data.provider : 'local',
    model: typeof data.model === 'string' ? data.model.slice(0, 80) : '',
    key: typeof data.key === 'string' ? data.key.slice(0, 4096) : '',
    keyEnc: data.keyEnc === true,
    localBin: typeof data.localBin === 'string' ? data.localBin.slice(0, 500) : '',
    localModel: typeof data.localModel === 'string' ? data.localModel.slice(0, 500) : ''
  }
}

function decryptKey(c) {
  if (!c.key) return ''
  if (!c.keyEnc) return c.key
  try { return safeStorage.decryptString(Buffer.from(c.key, 'base64')) } catch { return '' }
}

function publicConfig(c, status = safeStorageState(safeStorage)) {
  const localStatus = localWhisperStatus(c)
  return {
    provider: PROVIDERS.includes(c.provider) ? c.provider : 'local',
    model: c.model || '',
    hasKey: !!c.key,
    // Local whisper.cpp settings — plain paths, nothing secret.
    localBin: c.localBin || '',
    localModel: c.localModel || '',
    localStatus,
    safeStorage: status.secure,
    safeStorageBackend: status.backend,
    defaults: DEFAULTS,
    credits: getCredits()
  }
}

// Renderer-safe view: never the key itself, just whether one is set + config.
// Credits ride along so the dictation UI can show the remaining allowance.
export function getSttConfigPublic() {
  const loaded = load()
  if (!loaded.ok) return { ok: false, error: loaded.error, ...publicConfig(emptyConfig()) }
  return publicConfig(loaded.config, loaded.security)
}

export function setSttConfig({ provider, model, apiKey, localBin, localModel } = {}) {
  const loaded = load()
  if (!loaded.ok) return { ok: false, error: loaded.error }
  const c = { ...loaded.config }
  if (provider !== undefined) c.provider = PROVIDERS.includes(provider) ? provider : 'local'
  if (model !== undefined) c.model = String(model || '').slice(0, 80)
  if (localBin !== undefined) c.localBin = String(localBin || '').trim().slice(0, 500)
  if (localModel !== undefined) c.localModel = String(localModel || '').trim().slice(0, 500)
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

// Transcribe a captured clip. `audio` is base64, `mime` its container type,
// `seconds` the recorded duration (the renderer knows it — Whisper's response
// doesn't reliably include it). The OpenAI path spends Quiet Credits on
// success; the local path is free by design.
export async function transcribe({ audio, mime, seconds, language } = {}) {
  const loaded = load()
  if (!loaded.ok) return { ok: false, error: loaded.error }
  const c = loaded.config
  const provider = PROVIDERS.includes(c.provider) ? c.provider : 'local'
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
    const key = decryptKey(c)
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
  const managed = managedLocalPaths().bin
  if (existsSync(managed)) return managed
  // Common whisper.cpp binary names, newest first.
  for (const name of ['whisper-cli', 'whisper-cpp', 'whisper']) {
    const hit = resolveExecutable(name)
    if (hit) return hit
  }
  return null
}

function resolveWhisperModel(c) {
  if (c.localModel) return existsSync(c.localModel) ? c.localModel : null
  const managed = managedLocalPaths().model
  // aria2 writes the model progressively. A partial managed base.en file must
  // not be mistaken for a ready model while its download is still running.
  try { return statSync(managed).size >= 100 * 1024 * 1024 ? managed : null } catch { return null }
}

// Public, cheap readiness check for the Settings surface. It reports exactly
// what is missing and never probes the network or sends audio anywhere.
function localWhisperStatus(c) {
  const paths = managedLocalPaths()
  const bin = resolveWhisperBin(c)
  const model = resolveWhisperModel(c)
  const ffmpeg = resolveExecutable('ffmpeg') || null
  const missing = []
  if (!bin) missing.push('whisper.cpp CLI')
  if (!model) missing.push('base.en model')
  if (!ffmpeg) missing.push('ffmpeg')
  return {
    ready: missing.length === 0,
    missing,
    bin,
    model,
    ffmpeg,
    managedBin: paths.bin,
    managedModel: paths.model
  }
}

async function localTranscribe(bytes, mime, c, language) {
  const status = localWhisperStatus(c)
  const bin = status.bin
  if (!bin) {
    return { ok: false, error: c.localBin ? `whisper.cpp binary not found at "${c.localBin}".` : 'whisper.cpp not found — install it (binary `whisper-cli`) or set its path in Settings ▸ Voice & Dictation.' }
  }
  const model = status.model
  if (!model) {
    return { ok: false, error: c.localModel ? `whisper.cpp model not found at "${c.localModel}".` : 'Download the local base.en model or set a .bin/.gguf model path in Settings ▸ Voice & Dictation.' }
  }
  const ffmpeg = status.ffmpeg
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

    const args = ['-m', model, '-f', wav, '-nt', '-np']
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
