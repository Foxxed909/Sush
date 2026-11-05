import { useEffect, useRef } from 'react'

// Live microphone loudness (0..1) while `active`, for the orb to react to.
// Opens its own analyser stream next to speech recognition and closes it the
// moment listening stops. Never records or sends audio anywhere. Returns a
// ref (read per frame by the orb) so it causes no re-renders.
export function useMicLevel(active) {
  const level = useRef(0)
  useEffect(() => {
    if (!active || !navigator.mediaDevices?.getUserMedia) { level.current = 0; return undefined }
    let stream, ctx, raf, cancelled = false
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(s => {
      if (cancelled) { s.getTracks().forEach(t => t.stop()); return }
      stream = s
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      const src = ctx.createMediaStreamSource(s)
      const an = ctx.createAnalyser()
      an.fftSize = 512
      src.connect(an)
      const buf = new Uint8Array(an.fftSize)
      const tick = () => {
        an.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v }
        const rms = Math.sqrt(sum / buf.length)
        level.current = Math.min(1, rms * 4.5)
        raf = requestAnimationFrame(tick)
      }
      tick()
    }).catch(() => {})
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach(t => t.stop())
      ctx?.close?.().catch(() => {})
      level.current = 0
    }
  }, [active])
  return level
}
