import React, { useEffect, useRef } from 'react'

// ── Ambient starfield ────────────────────────────────────────────────────────
// "Wireframes in moonlight" finally gets its night sky: a sparse field of
// drifting, twinkling stars on the canvas layer UNDER everything. Moonlight
// grays with a few accent-tinted ones; terminals are opaque so it only shows
// on the home/lock/empty surfaces and as a soft wash through glass chrome.
//
// Battery-honest by construction (the brand rule: every ornament has an
// off-switch, polling is focus-gated):
//   • The App only mounts it when ambient is enabled AND none of lite/saver/
//     eco/reduce-motion are active (canvas animation is JS, so the CSS kill
//     switches can't reach it — the mount gate is the kill switch).
//   • OS prefers-reduced-motion paints ONE static frame and never animates.
//   • The loop pauses when the tab is hidden, the window loses focus, or the
//     idle-sleep veil is up (body[data-sleeping]).
//   • ~30fps cap, devicePixelRatio capped at 1.5, star count capped.
export default function Starfield({ accent = '#ff6b9d', density = 1, maxOpacity = 0.85, style }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    let stars = []
    let raf = 0
    let running = false
    let last = 0
    let acc = 0
    const FRAME = 1000 / 30

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)

    const seed = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      // Sparse: roughly one star per 9000 px², hard-capped so a huge monitor
      // doesn't turn the backdrop into noise (or work).
      const count = Math.min(220, Math.round((w * h) / 9000 * density))
      stars = Array.from({ length: count }, () => spawn(w, h, true))
    }

    const spawn = (w, h, anywhere) => {
      const r = 0.4 + Math.random() * 1.1
      return {
        x: Math.random() * w,
        y: anywhere ? Math.random() * h : h + 2,
        r,
        // Bigger stars drift faster — cheap parallax.
        vy: -(2 + r * 5) * (0.6 + Math.random() * 0.8),
        vx: (Math.random() - 0.5) * 1.6,
        base: 0.12 + Math.random() * 0.55,
        phase: Math.random() * Math.PI * 2,
        // Slow twinkle, desynced per star.
        tw: 0.4 + Math.random() * 1.4,
        // Most stars are moonlight; a few carry the theme accent.
        tinted: Math.random() < 0.16
      }
    }

    const draw = (t) => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      for (const s of stars) {
        const twinkle = 0.65 + 0.35 * Math.sin(s.phase + t * 0.001 * s.tw * Math.PI)
        ctx.globalAlpha = Math.min(1, s.base * twinkle * maxOpacity)
        ctx.fillStyle = s.tinted ? accent : '#cfd6e4'
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    const step = (dt) => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]
        s.y += s.vy * dt
        s.x += s.vx * dt
        if (s.y < -3 || s.x < -3 || s.x > w + 3) stars[i] = spawn(w, h, false)
      }
    }

    const loop = (t) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden || !document.hasFocus() || document.body?.hasAttribute('data-sleeping')) { last = t; return }
      const dt = Math.min(100, t - last)
      last = t
      acc += dt
      if (acc < FRAME) return
      step(acc / 1000)
      draw(t)
      acc = 0
    }

    const start = () => {
      if (running || reduceMotion) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }

    seed()
    if (reduceMotion) {
      // Calm path: the sky exists, it just holds still.
      draw(0)
    } else {
      start()
    }

    const ro = new ResizeObserver(() => { seed(); if (reduceMotion) draw(0) })
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      running = false
      ro.disconnect()
    }
  }, [accent, density, maxOpacity])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: -1, ...style }}
    />
  )
}
