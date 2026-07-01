// Mic capture for Whisper dictation. Replaces the old Web Speech API path —
// Electron ships no Google speech backend, so SpeechRecognition failed with a
// `network` error in the packaged app. MediaRecorder + getUserMedia DO work in
// Chromium/Electron, so we record a short clip and hand the bytes to main,
// which transcribes them via the user's Whisper key.

export const dictationSupported =
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof window !== 'undefined' &&
  typeof window.MediaRecorder !== 'undefined'

// Pick the best container the platform's MediaRecorder actually supports.
// Whisper accepts webm/ogg/mp4/wav; opus-in-webm is the Chromium default.
function pickMime() {
  const want = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  for (const m of want) {
    try { if (window.MediaRecorder?.isTypeSupported?.(m)) return m } catch {}
  }
  return ''
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onloadend = () => {
      const s = String(r.result || '')
      const comma = s.indexOf(',')
      resolve(comma >= 0 ? s.slice(comma + 1) : '')
    }
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

// One capture at a time. start() opens the mic and records; stop() resolves the
// clip; cancel() throws it away. The stream is always released so the OS mic
// indicator turns off the moment we're done.
export class DictationRecorder {
  constructor() {
    this.stream = null
    this.rec = null
    this.chunks = []
    this.startedAt = 0
  }

  get active() { return !!this.rec }

  async start() {
    if (this.rec) return
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeType = pickMime()
    this.chunks = []
    this.rec = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined)
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data) }
    this.startedAt = Date.now()
    this.rec.start()
  }

  // Stop and resolve { base64, mime, seconds }, or null when nothing usable was
  // captured (too short / mic produced no data).
  stop() {
    return new Promise((resolve) => {
      const rec = this.rec
      if (!rec) { resolve(null); return }
      const seconds = (Date.now() - this.startedAt) / 1000
      rec.onstop = async () => {
        this.releaseStream()
        const mime = rec.mimeType || 'audio/webm'
        const blob = new Blob(this.chunks, { type: mime })
        this.chunks = []
        this.rec = null
        if (!blob.size) { resolve(null); return }
        try {
          const base64 = await blobToBase64(blob)
          resolve(base64 ? { base64, mime, seconds } : null)
        } catch { resolve(null) }
      }
      try { rec.stop() } catch { this.releaseStream(); this.rec = null; resolve(null) }
    })
  }

  cancel() {
    const rec = this.rec
    this.rec = null
    this.chunks = []
    try { if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop() } } catch {}
    this.releaseStream()
  }

  releaseStream() {
    try { this.stream?.getTracks().forEach(t => t.stop()) } catch {}
    this.stream = null
  }
}

// "12m left" / "45s left" from a seconds balance, for the dictation UI.
export function formatCredits(remainingSec) {
  const s = Math.max(0, Math.round(Number(remainingSec) || 0))
  if (s >= 600) return `${Math.round(s / 60)}m left`
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s left`
  return `${s}s left`
}
