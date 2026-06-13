// Voice engine for Seducia — push-to-talk STT + system TTS.
//
// The always-on wake word ("Seducia") and the ElevenLabs streaming TTS are
// gone: the wake loop held the microphone hostage (it fought Hush for the
// mic and burned battery listening 24/7), and ElevenLabs was a paid demo
// feature. What remains is the honest core: tap the mic, speak a command,
// and — if TTS is enabled in Settings — she answers in your system voice.
//
// State machine (reported via onState): idle -> listening -> thinking ->
// speaking -> idle. `thinking`/`speaking` are driven by the caller via
// setThinking()/speak(); `listening` by recognition. Everything is
// defensive: the Web Speech API is flaky, so every call is wrapped.

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

export const speechRecognitionSupported = !!SR

export class VoiceEngine {
  constructor(handlers = {}) {
    this.on = handlers // { onState, onPartial, onCommand, onError }
    this.cfg = {}
    this.state = 'idle'
    this.pushToTalk = false // a one-shot manual capture is active
    this.rec = null
    this.speaking = false
    this.lastSpoken = ''
  }

  configure(cfg) { this.cfg = { ...this.cfg, ...cfg } }

  setState(s) {
    if (this.state === s) return
    this.state = s
    this.on.onState?.(s)
  }

  setThinking(on) { if (on) this.setState('thinking'); else this.setState('idle') }

  // ---- Recognition -------------------------------------------------------
  ensureRec() {
    if (!SR || this.rec) return this.rec
    const rec = new SR()
    rec.lang = navigator.language || 'en-US'
    rec.continuous = false
    rec.interimResults = true
    rec.onresult = (e) => this.handleResult(e)
    rec.onerror = (e) => {
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        this.on.onError?.('Microphone permission denied.')
        this.setState('idle')
      }
    }
    rec.onend = () => {
      this.pushToTalk = false
      if (this.state === 'listening') this.setState(this.speaking ? 'speaking' : 'idle')
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

    this.on.onPartial?.(transcript)
    this.setState('listening')
    if (result.isFinal) this.commit(transcript)
  }

  commit(text) {
    const command = text.trim()
    this.pushToTalk = false
    if (command) {
      this.setState('thinking')
      this.on.onCommand?.(command)
    } else {
      this.setState('idle')
    }
  }

  isEcho(transcript) {
    if (!this.lastSpoken) return false
    const a = transcript.toLowerCase()
    const b = this.lastSpoken.toLowerCase()
    return b.includes(a) || a.includes(b.slice(0, Math.min(b.length, 24)))
  }

  // ---- Public controls ---------------------------------------------------
  // One-shot manual capture (push-to-talk / mic button).
  listenOnce() {
    if (!SR) { this.on.onError?.('Voice recognition is not available in this build.'); return }
    this.pushToTalk = true
    this.setState('listening')
    this.startRec()
  }

  cancelListen() {
    this.pushToTalk = false
    try { this.rec?.stop() } catch {}
    this.setState('idle')
  }

  // ---- TTS (system voice) -------------------------------------------------
  speak(text) {
    const clean = String(text || '').replace(/ACTION:[^\n]*/g, '').replace(/[*_`#>]/g, '').trim()
    if (!clean) return
    this.stopSpeaking()
    this.lastSpoken = clean
    this.speaking = true
    this.setState('speaking')
    this.speakWebSpeech(clean)
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
    try { window.speechSynthesis?.cancel() } catch {}
  }

  destroy() {
    this.pushToTalk = false
    this.stopSpeaking()
    try { this.rec?.abort() } catch {}
    this.rec = null
  }
}
