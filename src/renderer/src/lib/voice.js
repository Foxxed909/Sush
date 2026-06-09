// Jarvis-style voice engine for Seducia.
//
// Responsibilities:
//   - Wake word: continuous Web-Speech recognition scanning for "seducia".
//   - STT: capture the spoken command (after the wake word, or push-to-talk).
//   - TTS: stream ElevenLabs audio (low-latency flash/turbo) via MediaSource,
//     falling back to the Web Speech synthesizer when no key is set.
//   - Barge-in: the moment the user speaks, stop whatever Seducia is saying.
//
// State machine (reported via onState): idle -> wake -> listening -> thinking
//   -> speaking -> (wake | idle). `thinking` / `speaking` are driven by the
//   caller (the brain) via setThinking()/speak(); `wake`/`listening` are driven
//   by recognition. Everything is defensive: the Web Speech API is flaky, so we
//   wrap every call and auto-restart recognition when it ends unexpectedly.

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

export const speechRecognitionSupported = !!SR

// Accept common mishearings of the wake word.
const WAKE_PATTERNS = ['seducia', 'sedusia', 'seducea', 'sedducia', 'the ducia', 'sir ducia', 'saducia', 'seductia']

function stripWake(transcript) {
  const lower = transcript.toLowerCase()
  for (const w of WAKE_PATTERNS) {
    const i = lower.indexOf(w)
    if (i !== -1) return transcript.slice(i + w.length).replace(/^[\s,.:!?-]+/, '').trim()
  }
  return null // no wake word present
}

export class VoiceEngine {
  constructor(handlers = {}) {
    this.on = handlers // { onState, onPartial, onCommand, onError }
    this.cfg = {}
    this.state = 'idle'
    this.armed = false // wake word heard, now capturing a command
    this.pushToTalk = false // a one-shot manual capture is active
    this.wakeEnabled = false
    this.rec = null
    this.restartTimer = null
    this.audio = null
    this.ttsAbort = null
    this.speaking = false
    this.lastSpoken = ''
  }

  configure(cfg) { this.cfg = { ...this.cfg, ...cfg } }

  setState(s) {
    if (this.state === s) return
    this.state = s
    this.on.onState?.(s)
  }

  setThinking(on) { if (on) this.setState('thinking'); else this.setState(this.wakeEnabled ? 'wake' : 'idle') }

  // ---- Recognition -------------------------------------------------------
  ensureRec() {
    if (!SR || this.rec) return this.rec
    const rec = new SR()
    rec.lang = 'en-US'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => this.handleResult(e)
    rec.onerror = (e) => {
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        this.wakeEnabled = false
        this.on.onError?.('Microphone permission denied.')
        this.setState('idle')
      }
    }
    rec.onend = () => {
      // Auto-restart for the always-on wake loop unless we deliberately stopped.
      if (this.wakeEnabled || this.pushToTalk) {
        clearTimeout(this.restartTimer)
        this.restartTimer = setTimeout(() => this.startRec(), 250)
      } else {
        this.setState(this.speaking ? 'speaking' : 'idle')
      }
    }
    this.rec = rec
    return rec
  }

  startRec() {
    const rec = this.ensureRec()
    if (!rec) return
    try { rec.start() } catch { /* already started */ }
  }

  handleResult(e) {
    const result = e.results[e.results.length - 1]
    const transcript = Array.from(e.results).slice(-1).map(r => r[0].transcript).join('').trim()
    if (!transcript) return

    // Barge-in: if Seducia is talking and the user clearly says something new
    // (not just our own audio echoing back), cut the speech immediately.
    if (this.speaking && transcript.length > 2 && !this.isEcho(transcript)) {
      this.stopSpeaking()
    }

    if (this.pushToTalk) {
      this.on.onPartial?.(transcript)
      this.setState('listening')
      if (result.isFinal) this.commit(transcript)
      return
    }

    if (!this.armed) {
      const after = stripWake(transcript)
      if (after === null) return // wake word not heard yet
      this.armed = true
      this.setState('listening')
      if (after) {
        this.on.onPartial?.(after)
        if (result.isFinal) this.commit(after)
      }
      return
    }

    // Already armed -> everything after the wake word is the command.
    const after = stripWake(transcript)
    const command = after !== null ? after : transcript
    this.on.onPartial?.(command)
    if (result.isFinal) this.commit(command)
  }

  commit(text) {
    const command = text.trim()
    this.armed = false
    this.pushToTalk = false
    if (command) {
      this.setState('thinking')
      this.on.onCommand?.(command)
    } else {
      this.setState(this.wakeEnabled ? 'wake' : 'idle')
    }
  }

  isEcho(transcript) {
    if (!this.lastSpoken) return false
    const a = transcript.toLowerCase()
    const b = this.lastSpoken.toLowerCase()
    return b.includes(a) || a.includes(b.slice(0, Math.min(b.length, 24)))
  }

  // ---- Public controls ---------------------------------------------------
  startWakeWord() {
    if (!SR) { this.on.onError?.('Voice recognition is not available in this build.'); return }
    this.wakeEnabled = true
    this.armed = false
    this.setState('wake')
    this.startRec()
  }

  stopWakeWord() {
    this.wakeEnabled = false
    this.armed = false
    clearTimeout(this.restartTimer)
    try { this.rec?.stop() } catch {}
    if (!this.speaking) this.setState('idle')
  }

  // One-shot manual capture (push-to-talk / mic button).
  listenOnce() {
    if (!SR) { this.on.onError?.('Voice recognition is not available in this build.'); return }
    this.pushToTalk = true
    this.armed = false
    this.setState('listening')
    this.startRec()
  }

  cancelListen() {
    this.pushToTalk = false
    this.armed = false
    try { this.rec?.stop() } catch {}
    this.setState(this.wakeEnabled ? 'wake' : 'idle')
  }

  // ---- TTS ---------------------------------------------------------------
  async speak(text) {
    const clean = String(text || '').replace(/ACTION:[^\n]*/g, '').replace(/[*_`#>]/g, '').trim()
    if (!clean) return
    this.stopSpeaking()
    this.lastSpoken = clean
    this.speaking = true
    this.setState('speaking')

    const { elevenLabsKey, elevenLabsVoice } = this.cfg
    try {
      if (elevenLabsKey && elevenLabsVoice) await this.speakEleven(clean)
      else this.speakWebSpeech(clean)
    } catch {
      // Network / decode failure -> fall back so Seducia is never mute.
      try { this.speakWebSpeech(clean) } catch {}
    }
  }

  async speakEleven(text) {
    const { elevenLabsKey, elevenLabsVoice, elevenLabsModel } = this.cfg
    const abort = new AbortController()
    this.ttsAbort = abort
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoice}/stream?optimize_streaming_latency=3&output_format=mp3_44100_128`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': elevenLabsKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: text.slice(0, 900),
        model_id: elevenLabsModel || 'eleven_flash_v2_5',
        voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true }
      }),
      signal: abort.signal
    })
    if (!res.ok) throw new Error(`eleven ${res.status}`)

    const audio = new Audio()
    audio.autoplay = true
    this.audio = audio
    const finish = () => { if (this.audio === audio) this.onSpeakEnd() }
    audio.onended = finish
    audio.onerror = finish

    // Prefer MediaSource streaming for near-instant start; fall back to a blob.
    const canStream = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg') && res.body
    if (canStream) {
      const ms = new MediaSource()
      audio.src = URL.createObjectURL(ms)
      await new Promise(resolve => ms.addEventListener('sourceopen', resolve, { once: true }))
      const sb = ms.addSourceBuffer('audio/mpeg')
      const queue = []
      let reading = true
      const pump = () => {
        if (sb.updating) return
        if (queue.length) { try { sb.appendBuffer(queue.shift()) } catch {} }
        else if (!reading && ms.readyState === 'open') { try { ms.endOfStream() } catch {} }
      }
      sb.addEventListener('updateend', pump)
      const reader = res.body.getReader()
      audio.play().catch(() => {})
      while (true) {
        const { value, done } = await reader.read()
        if (abort.signal.aborted) { reader.cancel().catch(() => {}); break }
        if (done) { reading = false; pump(); break }
        queue.push(value); pump()
      }
    } else {
      const blob = await res.blob()
      audio.src = URL.createObjectURL(blob)
      audio.play().catch(() => {})
    }
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
    if (this.audio) { try { this.audio.pause() } catch {}; this.audio = null }
    this.setState(this.wakeEnabled ? 'wake' : 'idle')
  }

  stopSpeaking() {
    this.speaking = false
    try { this.ttsAbort?.abort() } catch {}
    this.ttsAbort = null
    if (this.audio) { try { this.audio.pause(); this.audio.src = '' } catch {}; this.audio = null }
    try { window.speechSynthesis?.cancel() } catch {}
  }

  destroy() {
    this.wakeEnabled = false
    this.pushToTalk = false
    clearTimeout(this.restartTimer)
    this.stopSpeaking()
    try { this.rec?.abort() } catch {}
    this.rec = null
  }
}

// List ElevenLabs voices for the Settings picker. Returns [] on any failure.
export async function fetchElevenVoices(apiKey) {
  if (!apiKey) return []
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': apiKey } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.voices || []).map(v => ({ id: v.voice_id, name: v.name, category: v.category }))
  } catch {
    return []
  }
}
