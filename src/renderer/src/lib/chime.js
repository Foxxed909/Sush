// A short two-note chime for "an agent needs you". WebAudio only (no asset),
// created lazily on first use because browsers require a user gesture before
// audio can start, and silent if the context is unavailable.
let ctx = null

export function playChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    ctx = ctx || new AudioCtx()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const now = ctx.currentTime
    ;[[659.25, 0], [880, 0.13]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + at)
      gain.gain.exponentialRampToValueAtTime(0.06, now + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.28)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + at)
      osc.stop(now + at + 0.3)
    })
  } catch {}
}
