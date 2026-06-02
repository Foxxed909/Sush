import React, { useEffect, useRef } from 'react'

export default function ContextMenu({ x, y, onCopy, onPaste, onClear, onNewTab, onClose, hasSelection, accent }) {
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const item = (label, onClick, disabled = false) => (
    <button
      key={label}
      onClick={() => { if (!disabled) { onClick(); onClose() } }}
      disabled={disabled}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '6px 14px', background: 'none', border: 'none',
        color: disabled ? '#555' : '#eee', fontSize: 13, cursor: disabled ? 'default' : 'pointer',
        borderRadius: 4, transition: 'background 0.1s'
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = `${accent}22` }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
    >
      {label}
    </button>
  )

  const divider = <div style={{ height: 1, background: '#2a2a2a', margin: '3px 0' }} />

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', left: x, top: y, zIndex: 9999,
        background: '#1a1a1a', border: `1px solid ${accent}33`,
        borderRadius: 6, padding: '4px 0', minWidth: 160,
        boxShadow: '0 8px 24px #0009'
      }}
    >
      {item('Copy', onCopy, !hasSelection)}
      {item('Paste', onPaste)}
      {divider}
      {item('Clear', onClear)}
      {divider}
      {item('New Tab', onNewTab)}
    </div>
  )
}
