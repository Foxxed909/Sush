import React, { useEffect, useState } from 'react'
import { rgba } from '../lib/ui'

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

// Beat 1: the shush mark — pink lips with a near-white finger raised over them.
function ShushMark({ accent }) {
  return (
    <svg width="132" height="132" viewBox="0 0 120 120" fill="none" aria-hidden>
      {/* lips (pink) */}
      <g style={{ opacity: 0, animation: 'sush-reveal 0.45s var(--ease-out) backwards' }}>
        <path d="M28 56 Q 42 43 52 51 Q 60 46 68 51 Q 78 43 92 56 Q 75 51 60 56 Q 45 51 28 56 Z" fill={accent} />
        <path d="M28 56 Q 45 75 60 75 Q 75 75 92 56 Q 75 64 60 64 Q 45 64 28 56 Z" fill={accent} opacity="0.92" />
        <path d="M28 56 Q 45 53 60 57 Q 75 53 92 56" stroke={rgba('#000000', 0.25)} strokeWidth="1.5" fill="none" />
      </g>
      {/* finger (near-white, raised — the "shh") */}
      <g style={{ transformOrigin: '60px 52px', animation: 'sush-finger-rise 0.6s cubic-bezier(0.22,1,0.36,1) 0.15s backwards' }}>
        <rect x="54" y="22" width="12" height="52" rx="6" fill="#f7f8f8" />
        <rect x="54" y="22" width="12" height="52" rx="6" fill="none" stroke={rgba(accent, 0.5)} strokeWidth="1" />
        <ellipse cx="60" cy="28" rx="3.2" ry="4.2" fill={rgba('#ffffff', 0.7)} />
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
          <span>Ember</span>
        </div>
        <div style={{ color: 'var(--text-5)', fontSize: 10, fontWeight: 600, letterSpacing: 0.5 }}>{tip}</div>
        <div className="sush-progress" style={{ width: 140, marginTop: 10, '--accent': accent }} />
      </div>

      {/* Bottom glow line */}
      <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 240, height: 1, background: `linear-gradient(90deg, transparent, ${rgba(accent, 0.5)}, transparent)`, opacity: 0, animation: 'sush-fade-up 0.6s var(--ease-out) 0.3s forwards' }} />
    </div>
  )
}
