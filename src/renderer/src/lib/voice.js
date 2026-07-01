// Voice engine for Seducia — push-to-talk STT + TTS.
//
// STT was the browser Web Speech API, which needs Google's speech backend that
// Electron doesn't bundle (it failed with a `network` error in the packaged
// app). It now shares Hush's working path: MediaRecorder capture → Whisper in
// main (the user's own key) → text. TTS is unchanged (cloud voice with a system
// fallback).
//
// State machine (reported via onState): idle -> listening -> thinking ->
// speaking -> idle. `listening` covers recording; `thinking` covers both
// transcription and the AI turn the caller runs on the committed text.
// Everything is defensive: mic/network calls are all wrapped.

import { DictationRecorder, dictationSupported } from './dictation'

// Kept under the old name so callers (useSeducia) don't need to change: it now
// reflects MediaRecorder support, which actually works in Electron.
export const speechRecognitionSupported = dictationSupported

const MAX_CLIP_MS = 30000   // safety cap so a forgotten-open mic never runs on

export class VoiceEngine {
  constructor(handlers = {}) {
    this.on = handlers // { onState, onPartial, onCommand, onError }
    this.cfg = {}
    this.state = 'idle'
    this.recorder = null
    this.capTimer = null
    this.speaking = false
    this.lastSpoken = ''
    this.audio = null // current cloud-TTS <audio> element, if any
  }

  configure(cfg) { this.cfg = { ...this.cfg, ...cfg } }

  setState(s) {
    if (this.state === s) return
    this.state = s
    this.on.onState?.(s)
  }

  setThinking(on) { if (on) this.setState('thinking'); else this.setState('idle') }

  clearCap() { if (this.capTimer) { clearTimeout(this.capTimer); this.capTimer = null } }

  // ---- Recognition (record → Whisper) ------------------------------------
  // One-shot manual capture (push-to-talk / mic button). Tap once to start,
  // again (finishListening) to stop + transcribe + submit.
  async listenOnce() {
    if (!dictationSupported) { this.on.onError?.('Voice capture is not available in this build.'); return }
    if (this.recorder) return
    // Barge-in: starting to talk cuts Seducia off mid-sentence.
    this.stopSpeaking()
    const rec = new DictationRecorder()
    try {
      await rec.start()
    } catch (e) {
      const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
      this.on.onError?.(denied ? 'Microphone permission denied.'
        : e?.name === 'NotFoundError' ? 'No microphone found.' : 'Could not start the microphone.')
      this.setState('idle')
      return
    }
    this.recorder = rec
    this.setState('listening')
    this.capTimer = setTimeout(() => { if (this.state === 'listening') this.finishListening() }, MAX_CLIP_MS)
  }

  // Stop recording, transcribe, and hand the text to the caller.
  async finishListening() {
    this.clearCap()
    const rec = this.recorder
    if (!rec) return
    this.recorder = null
    this.setState('thinking')
    let clip = null
    try { clip = await rec.stop() } catch {}
    if (!clip || clip.seconds < 0.3) { this.setState('idle'); return }
    try {
      const res = await window.sush?.sttTranscribe?.({ audio: clip.base64, mime: clip.mime, seconds: clip.seconds })
      if (res?.ok && res.text) { this.commit(res.text); return }
      if (res?.error === 'no-key') this.on.onError?.('Add a Whisper key in Settings ▸ Voice to talk to Seducia.')
      else if (res?.error === 'out-of-credits') this.on.onError?.('Out of Quiet Credits this month — they refill on the 1st.')
      else if (res?.error) this.on.onError?.(res.error)
      this.setState('idle')
    } catch (e) {
      this.on.onError?.(e?.message || 'Transcription failed.')
      this.setState('idle')
    }
  }

  cancelListen() {
    this.clearCap()
    const rec = this.recorder
    this.recorder = null
    try { rec?.cancel() } catch {}
    this.setState('idle')
  }

  commit(text) {
    const command = String(text || '').trim()
    if (command) {
      this.setState('thinking')
      this.on.onCommand?.(command)
    } else {
      this.setState('idle')
    }
  }

  // ---- TTS (cloud voice with system fallback) -----------------------------
  speak(text) {
    const clean = String(text || '').replace(/ACTION:[^\n]*/g, '').replace(/[*_`#>]/g, '').trim()
    if (!clean) return
    this.stopSpeaking()
    this.lastSpoken = clean
    this.speaking = true
    this.setState('speaking')
    this.render(clean)
  }

  // Prefer cloud TTS — main holds the key + provider and returns audio bytes.
  // Fall back to the system voice on any miss (provider 'system', no key, or a
  // failed request) so Seducia is never silenced by a TTS hiccup.
  async render(text) {
    let used = false
    try {
      const r = await window.sush?.ttsSynthesize?.({ text, rate: this.cfg.rate })
      if (!this.speaking) return // barged-in / stopped while the request was in flight
      if (r?.ok && r.audio) { this.playAudio(r.audio, r.mime); used = true }
      else if (r?.error && !r.fallback) this.on.onError?.(r.error)
    } catch {}
    if (!used && this.speaking) this.speakWebSpeech(text)
  }

  playAudio(base64, mime) {
    try {
      this.stopAudio()
      const bin = atob(base64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'audio/mpeg' }))
      const a = new Audio(url)
      this.audio = a
      a.volume = this.cfg.volume ?? 1.0
      const end = () => { URL.revokeObjectURL(url); if (this.audio === a) this.audio = null; this.onSpeakEnd() }
      a.onended = end
      a.onerror = end
      a.play().catch(end)
    } catch { this.onSpeakEnd() }
  }

  stopAudio() {
    if (this.audio) { try { this.audio.pause() } catch {} this.audio = null }
  }

  speakWebSpeech(text) {
    if (!window.speechSynthesis) { this.onSpeakEnd(); return }
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = this.cfg.rate ?? 1.05
    utt.pitch = this.cfg.pitch ?? 1.0
    utt.volume = this.cfg.volume ?? 1.0
    if (this.cfg.webSpeechVoice) {
      const v = window.speechSynthesis.getVoices().find(v => v.voiceURI === this.cfg.webSpeechVoice)
      if (v) utt.voice = v
    }
    utt.onend = () => this.onSpeakEnd()
    utt.onerror = () => this.onSpeakEnd()
    window.speechSynthesis.speak(utt)
  }

  onSpeakEnd() {
    this.speaking = false
    this.setState('idle')
  }

  stopSpeaking() {
    this.speaking = false
    this.stopAudio()
    try { window.speechSynthesis?.cancel() } catch {}
  }

  destroy() {
    this.clearCap()
    this.stopSpeaking()
    try { this.recorder?.cancel() } catch {}
    this.recorder = null
  }
}
