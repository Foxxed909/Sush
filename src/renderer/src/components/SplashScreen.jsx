import React, { useEffect, useState } from 'react'
import { rgba } from '../lib/ui'

const LETTERS = ['S', 'U', 'S', 'H']
const TIPS = [
  'Ctrl+R to search command history',
  'Ctrl+K to summon Seducia',
  'Ctrl+Shift+H for split pane',
  'Ctrl+P opens the command palette',
  'F2 to rename the active session',
  'Ctrl+Tab cycles sessions (MRU)',
  'Ctrl+Shift+D duplicates a tab',
  'Type a path to navigate directly',
]

export default function SplashScreen({ accent = '#ff6b9d', onDone }) {
  const [exiting, setExiting] = useState(false)
  const [version, setVersion] = useState('v3.0.0')
  const tip = TIPS[Math.floor(TIPS.length * 0.5) % TIPS.length]  // stable pick

  useEffect(() => {
    window.sush?.appVersion?.().then(v => { if (v) setVersion(`v${v}`) }).catch(() => {})
  }, [])

  useEffect(() => {
    const exitAt = setTimeout(() => setExiting(true), 1100)
    const doneAt = setTimeout(() => onDone?.(), 1650)
    return () => { clearTimeout(exitAt); clearTimeout(doneAt) }
  }, [onDone])

  return (
    <div
      className={exiting ? 'sush-splash-out' : ''}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#080a0d',
        gap: 22
      }}
    >
      {/* Logo orb */}
      <div style={{
        width: 56,
        height: 56,
        borderRadius: 16,
        background: `linear-gradient(150deg, ${accent}, ${rgba(accent, 0.35)})`,
        boxShadow: `0 0 48px ${rgba(accent, 0.45)}, 0 0 100px ${rgba(accent, 0.15)}`,
        opacity: 0,
        animation: 'sush-reveal 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
        animationDelay: '0ms'
      }} />

      {/* Letter-by-letter stagger */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
        {LETTERS.map((letter, i) => (
          <span
            key={i}
            style={{
              color: accent,
              fontSize: 44,
              fontWeight: 900,
              letterSpacing: 6,
              opacity: 0,
              animation: 'sush-letter 0.45s cubic-bezier(0.16,1,0.3,1) forwards',
              animationDelay: `${120 + i * 75}ms`
            }}
          >
            {letter}
          </span>
        ))}
      </div>

      {/* Version + codename */}
      <div style={{
        opacity: 0,
        animation: 'sush-fade-up 0.4s cubic-bezier(0.16,1,0.3,1) forwards',
        animationDelay: '520ms',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#364048', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
          <span>{version}</span>
          <span style={{ color: '#222a32' }}>·</span>
          <span>Lumen</span>
        </div>
        <div style={{ color: '#2a3540', fontSize: 10, fontWeight: 600, letterSpacing: 0.5 }}>{tip}</div>
        {/* Indeterminate hairline — the splash reads as loading, not frozen */}
        <div className="sush-progress" style={{ width: 140, marginTop: 10, '--accent': accent }} />
      </div>

      {/* Bottom glow line */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 240,
        height: 1,
        background: `linear-gradient(90deg, transparent, ${rgba(accent, 0.5)}, transparent)`,
        opacity: 0,
        animation: 'sush-fade-up 0.6s cubic-bezier(0.16,1,0.3,1) forwards',
        animationDelay: '300ms'
      }} />
    </div>
  )
}
