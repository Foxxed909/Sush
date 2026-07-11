import React from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

// The one search-sheet recipe (DESIGN.md ▸ Overlays): a dimmed backdrop and a
// centered card with a search header, a scrollable result list, and a footer
// of key hints. CommandPalette and HuntOverlay both render through this so
// the two sheets can never drift apart visually.
export const kbdStyle = {
  fontSize: 10,
  color: 'var(--text-4)',
  background: '#1a2128',
  border: '1px solid #2a333c',
  borderRadius: 5,
  padding: '2px 6px'
}

const footKbd = { background: '#141a20', border: '1px solid #1d242b', borderRadius: 4, padding: '1px 5px' }

export default function SearchOverlay({
  accent,
  onClose,
  zIndex,
  maxWidth,
  maxHeight = 400,
  inputRef,
  query,
  onQueryChange,
  onKeyDown,
  placeholder,
  hints = [],
  children
}) {
  return (
    <div
      className="sush-backdrop"
      style={{ position: 'fixed', inset: 0, zIndex, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', paddingTop: '14vh' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="sush-pop"
        style={{ width: '100%', maxWidth, background: '#0d1015', border: `1px solid ${rgba(accent, 0.35)}`, borderRadius: 'var(--r-xl)', boxShadow: `0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px ${rgba(accent, 0.1)}`, overflow: 'hidden' }}
      >
        <div className="flex items-center" style={{ gap: 10, padding: '12px 16px', borderBottom: `1px solid ${rgba(accent, 0.12)}` }}>
          <Icon name="search" size={16} color={accent} strokeWidth={2} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-1)', fontSize: 15, outline: 'none', fontFamily: 'inherit' }}
          />
          <kbd style={kbdStyle}>ESC</kbd>
        </div>

        <div style={{ maxHeight, overflowY: 'auto' }} className="sush-scroll">
          {children}
        </div>

        <div style={{ padding: '8px 16px', borderTop: `1px solid ${rgba(accent, 0.08)}`, display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-5)' }}>
          {hints.map(([key, label]) => (
            <span key={label}><kbd style={footKbd}>{key}</kbd> {label}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
