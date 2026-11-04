import React, { useEffect, useRef, useState } from 'react'
import { rgba } from '../lib/ui'

const LETTERS = ['S', 'U', 'S', 'H']

// The cooler second tone — "Seducia / Claude" to the pink "you" (Nifemi). Violet
// pairs with pink without clashing, and reads clearly as the other hand.
const COOL = '#a78bff'

// Beat 1: the shush mark — glossy pink lips (cupid's bow, gradient + specular
// highlight, soft pink glow) with a tapered near-white finger raised over them.
// All vector: crisp at any DPI, animatable, near-free on a weak GPU.
function ShushMark({ accent }) {
  return (
    <svg width="148" height="148" viewBox="0 0 120 120" fill="none" aria-hidden>
      <defs>
        <linearGradient id="sushLip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffb3d4" />
          <stop offset="45%" stopColor={accent} />
          <stop offset="100%" stopColor="#c43670" />
        </linearGradient>
        <linearGradient id="sushFinger" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#d8a17e" />
          <stop offset="40%" stopColor="#f3cda9" />
          <stop offset="100%" stopColor="#c98a63" />
        </linearGradient>
        <radialGradient id="sushBloom">
          <stop offset="0%" stopColor={accent} stopOpacity="0.32" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* soft pink bloom behind the lips */}
      <ellipse cx="60" cy="62" rx="52" ry="32" fill="url(#sushBloom)" />

      {/* lips */}
      <g className="splash-lips">
        {/* upper lip — cupid's bow */}
        <path d="M30 60 C 37 53 46 52 51 54 C 55 55 57 58 60 58 C 63 58 65 55 69 54 C 74 52 83 53 90 60 C 80 58 70 59 60 59 C 50 59 40 58 30 60 Z" fill="url(#sushLip)" />
        {/* lower lip — fuller curve */}
        <path d="M30 60 C 40 73 50 79 60 79 C 70 79 80 73 90 60 C 79 64 70 65 60 65 C 50 65 41 64 30 60 Z" fill="url(#sushLip)" />
        {/* seam */}
        <path d="M31 60 C 42 62 50 62 60 62 C 70 62 78 62 89 60" stroke="#7a1e44" strokeOpacity="0.55" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        {/* specular gloss on lower lip */}
        <ellipse cx="52" cy="70" rx="11" ry="3.4" fill="#ffffff" opacity="0.45" />
        <ellipse cx="71" cy="69" rx="5" ry="2.2" fill="#ffffff" opacity="0.3" />
      </g>

      {/* finger raised over the lips — tapered, warm-toned, glossed */}
      <g className="splash-finger">
        <path d="M52.5 82 C 52 64 52.2 42 53.4 32 C 54 24 56.4 20 60 20 C 63.6 20 66 24 66.6 32 C 67.8 42 68 64 67.5 82 C 67.5 86.5 52.5 86.5 52.5 82 Z" fill="url(#sushFinger)" stroke={rgba('#783c28', 0.35)} strokeWidth="0.7" />
        {/* nail */}
        <ellipse cx="60" cy="28" rx="3.6" ry="5.2" fill="#ffe9d6" opacity="0.85" />
        {/* knuckle crease + soft length highlight */}
        <path d="M55 49 C 58 50.5 62 50.5 65 49" stroke={rgba('#783c28', 0.2)} strokeWidth="1" fill="none" strokeLinecap="round" />
        <path d="M56.5 24 C 56 42 56 62 56.2 78" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>

      {/* breath wisps — the faint "shh" */}
      <g className="splash-wisp" stroke={accent} strokeWidth="1.4" strokeLinecap="round" fill="none">
        <path d="M86 40 q 6 -3 11 0" />
        <path d="M88 47 q 7 -3 13 0" />
      </g>
    </svg>
  )
}

// Launch: "shush, then build" in 1.55s. The mark rises and settles, steps
// aside, two cursors (you in the accent, Seducia in violet) land either side
// and type the wordmark, then the stage fades into whatever is underneath
// (onboarding, the lock screen or the workspace). All motion is CSS on
// transform/opacity (no animated SVG filters), so Windows stays smooth.
// Any key, click or wheel skips it. Reduced motion: a quiet 0.85s fade.
export default function SplashScreen({ accent = '#ff6b9d', onDone }) {
  const [exiting, setExiting] = useState(false)
  const [version, setVersion] = useState('')
  // App passes an inline arrow; holding it in a ref keeps a parent re-render
  // from restarting the timers (which used to stretch the splash).
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    window.sush?.appVersion?.().then(v => { if (v) setVersion(`v${v}`) }).catch(() => {})
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const reduced = root.classList.contains('sush-motion-reduced') ||
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const t = reduced ? { exit: 700, done: 850 } : { exit: 1400, done: 1550 }
    let exitT, doneT
    let finished = false
    const run = (exitIn, doneIn) => {
      clearTimeout(exitT); clearTimeout(doneT)
      exitT = setTimeout(() => setExiting(true), exitIn)
      doneT = setTimeout(() => { if (!finished) { finished = true; doneRef.current?.() } }, doneIn)
    }
    run(t.exit, t.done)
    const skip = () => run(0, 160)
    window.addEventListener('keydown', skip, { once: true })
    window.addEventListener('pointerdown', skip, { once: true })
    window.addEventListener('wheel', skip, { once: true, passive: true })
    return () => {
      clearTimeout(exitT); clearTimeout(doneT)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('wheel', skip)
    }
  }, [])

  return (
    <div
      className="splash"
      data-exiting={exiting || undefined}
      role="status"
      aria-label="Starting Sush"
      style={{ '--accent': accent, '--splash-accent-glow': rgba(accent, 0.55), '--splash-cool': COOL, '--splash-cool-glow': rgba(COOL, 0.55) }}
    >
      <div className="splash-halo" aria-hidden />
      <div className="splash-stage">
        <div className="splash-mark"><ShushMark accent={accent} /></div>
        <div className="splash-word" aria-hidden>
          <span className="splash-cursor is-left" />
          <span className="splash-letters">
            {LETTERS.map((l, i) => <span key={i} style={{ '--i': i }}>{l}</span>)}
          </span>
          <span className="splash-cursor is-right" />
        </div>
      </div>
      <div className="splash-meta">
        {version && <span style={{ textTransform: 'none', letterSpacing: '.06em' }}>{version}</span>}
        {version && <span className="splash-meta-dot">·</span>}
        <span>Sotto</span>
      </div>
      <div className="splash-line" aria-hidden />
    </div>
  )
}
