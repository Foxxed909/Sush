import React, { useEffect, useRef } from 'react'
import { themes, defaultTheme } from '../themes'

export default function ProfilePicker({ profiles, onSelect, onClose, anchorRef }) {
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target) &&
          anchorRef?.current && !anchorRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', onKey) }
  }, [onClose, anchorRef])

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', top: 36, left: 0, zIndex: 200,
        background: '#1a1a1a', border: '1px solid #ff6b9d33',
        borderRadius: 8, padding: '6px 0', minWidth: 180,
        boxShadow: '0 8px 24px #0009'
      }}
    >
      <div style={{ color: '#666', fontSize: 11, padding: '4px 14px 6px', textTransform: 'uppercase', letterSpacing: 1 }}>
        Open with profile
      </div>
      {profiles.map(p => {
        const t = themes[p.themeId] ?? defaultTheme
        return (
          <button
            key={p.id}
            onClick={() => { onSelect(p); onClose() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '7px 14px', background: 'none',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              transition: 'background 0.1s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = `${t.ui.accent}22`}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span style={{ color: t.ui.accent, fontSize: 14 }}>{p.icon}</span>
            <span style={{ color: '#eee', fontSize: 13 }}>{p.label}</span>
            <span style={{ color: '#555', fontSize: 11, marginLeft: 'auto' }}>{p.shell || p.prompt || 'powershell'}</span>
          </button>
        )
      })}
    </div>
  )
}
