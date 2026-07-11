import React, { useEffect, useState } from 'react'
import Starfield from './Starfield'
import { rgba } from '../lib/ui'
import { CHANGELOG } from '../lib/changelog'

const LETTERS = ['S', 'U', 'S', 'H']
const TIPS = [
  'Ctrl+R to search command history',
  'Ctrl+K to summon Seducia',
  'Ctrl+Shift+G toggles grid layout',
  'Ctrl+P opens the command palette',
  'F2 to rename the active session',
  'Ctrl+Tab cycles sessions (MRU)',
  'Ctrl+Shift+D duplicates a tab',
  'Ctrl+Shift+E flips power saver',
  'Type a path to navigate directly',
]

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
        <filter id="sushGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* soft pink bloom behind the lips */}
      <ellipse cx="60" cy="62" rx="40" ry="22" fill={accent} opacity="0.18" filter="url(#sushGlow)" />

      {/* lips */}
      <g style={{ opacity: 0, animation: 'sush-reveal 0.5s var(--ease-out) backwards' }} filter="url(#sushGlow)">
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
      <g style={{ transformOrigin: '60px 54px', animation: 'sush-finger-rise 0.62s cubic-bezier(0.22,1,0.36,1) 0.18s backwards' }} filter="url(#sushGlow)">
        <path d="M52.5 82 C 52 64 52.2 42 53.4 32 C 54 24 56.4 20 60 20 C 63.6 20 66 24 66.6 32 C 67.8 42 68 64 67.5 82 C 67.5 86.5 52.5 86.5 52.5 82 Z" fill="url(#sushFinger)" stroke={rgba('#783c28', 0.35)} strokeWidth="0.7" />
        {/* nail */}
        <ellipse cx="60" cy="28" rx="3.6" ry="5.2" fill="#ffe9d6" opacity="0.85" />
        {/* knuckle crease + soft length highlight */}
        <path d="M55 49 C 58 50.5 62 50.5 65 49" stroke={rgba('#783c28', 0.2)} strokeWidth="1" fill="none" strokeLinecap="round" />
        <path d="M56.5 24 C 56 42 56 62 56.2 78" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>

      {/* breath wisps — the faint "shh" */}
      <g stroke={accent} strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.5" style={{ animation: 'sush-shh-glow 1s ease 0.4s both' }}>
        <path d="M86 40 q 6 -3 11 0" />
        <path d="M88 47 q 7 -3 13 0" />
      </g>
    </svg>
  )
}

export default function SplashScreen({ accent = '#ff6b9d', onDone }) {
  const [exiting, setExiting] = useState(false)
  const [version, setVersion] = useState('v4.6.0')
  const tip = TIPS[Math.floor(TIPS.length * 0.5) % TIPS.length]  // stable pick
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  useEffect(() => {
    window.sush?.appVersion?.().then(v => { if (v) setVersion(`v${v}`) }).catch(() => {})
  }, [])

  useEffect(() => {
    // Reduced motion: skip the choreography, hold the wordmark briefly, leave.
    const t = reduced ? { exit: 750, done: 1150 } : { exit: 2050, done: 2500 }
    const exitAt = setTimeout(() => setExiting(true), t.exit)
    const doneAt = setTimeout(() => onDone?.(), t.done)
    return () => { clearTimeout(exitAt); clearTimeout(doneAt) }
  }, [onDone, reduced])

  const cursor = (color, dir, delay) => ({
    width: 7, height: 36, borderRadius: 2, flexShrink: 0,
    background: color,
    boxShadow: `0 0 16px ${rgba(color, 0.7)}`,
    opacity: reduced ? 1 : 0,
    animation: reduced ? 'none' : `sush-cursor-in-${dir} 0.45s var(--ease-out) ${delay}s backwards`
  })

  return (
    <div
      className={exiting ? 'sush-splash-out' : ''}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-0)', gap: 26 }}
    >
      {/* Night sky behind the choreography (static under reduced motion). */}
      <Starfield accent={accent} density={1.2} />

      {/* Stage holds both beats stacked in the same centre. */}
      <div style={{ position: 'relative', width: 220, height: 132, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Beat 1 — shush (skipped entirely under reduced motion) */}
        {!reduced && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'sush-beat-out 0.4s ease 0.85s forwards' }}>
            <div style={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', background: `radial-gradient(circle, ${rgba(accent, 0.4)}, transparent 65%)`, filter: 'blur(8px)', opacity: 0, animation: 'sush-shh-glow 1s ease 0.2s both' }} />
            <ShushMark accent={accent} />
          </div>
        )}

        {/* Beat 2 — two cursors converge and type the wordmark */}
        <div className="flex items-center" style={{ gap: 11, position: 'absolute' }}>
          <span style={cursor(accent, 'left', 0.95)} />
          <div className="flex" style={{ gap: 3, alignItems: 'baseline' }}>
            {LETTERS.map((l, i) => (
              <span
                key={i}
                style={{
                  color: 'var(--text-1)', fontSize: 48, fontWeight: 900, letterSpacing: 2,
                  opacity: reduced ? 1 : 0,
                  animation: reduced ? 'none' : `sush-type-in 0.35s var(--ease-out) ${1.3 + i * 0.07}s backwards`
                }}
              >
                {l}
              </span>
            ))}
          </div>
          <span style={cursor(COOL, 'right', 0.95)} />
        </div>
      </div>

      {/* Version + codename + tip + progress hairline */}
      <div style={{ opacity: reduced ? 1 : 0, animation: reduced ? 'none' : 'sush-fade-up 0.4s var(--ease-out) 1.6s backwards', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-4)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
          <span>{version}</span>
          <span style={{ color: 'var(--text-5)' }}>·</span>
          {/* Codename rides the changelog's top entry — it was hardcoded once
              ("Ember") and quietly went four releases stale. */}
          <span style={{ textTransform: 'capitalize' }}>{CHANGELOG[0].codename}</span>
        </div>
        <div style={{ color: 'var(--text-5)', fontSize: 10, fontWeight: 600, letterSpacing: 0.5 }}>{tip}</div>
        <div className="sush-progress" style={{ width: 140, marginTop: 10, '--accent': accent }} />
      </div>

      {/* Bottom glow line */}
      <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 240, height: 1, background: `linear-gradient(90deg, transparent, ${rgba(accent, 0.5)}, transparent)`, opacity: 0, animation: 'sush-fade-up 0.6s var(--ease-out) 0.3s forwards' }} />
    </div>
  )
}
