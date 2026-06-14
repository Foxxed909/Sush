import React from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

// MRU session switcher. Shown while Ctrl is held after Ctrl+Tab; releasing Ctrl
// commits the highlighted session (handled in App). Purely presentational.
export default function QuickSwitcher({ accent, tabs, order, index }) {
  const byId = new Map(tabs.map(t => [t.id, t]))
  const items = order.map(id => byId.get(id)).filter(Boolean)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}>
      <div
        className="sush-fade-up"
        style={{ width: '100%', maxWidth: 460, background: '#0d1015', border: `1px solid ${rgba(accent, 0.35)}`, borderRadius: 'var(--r-xl)', boxShadow: '0 24px 64px rgba(0,0,0,0.7)', overflow: 'hidden' }}
      >
        <div className="flex items-center" style={{ gap: 9, padding: '12px 16px', borderBottom: `1px solid ${rgba(accent, 0.12)}` }}>
          <Icon name="shuffle" size={15} color={accent} strokeWidth={2} />
          <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-2)' }}>Switch session</span>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-4)' }}>
            <kbd style={{ background: '#141a20', border: '1px solid #2a333c', borderRadius: 4, padding: '1px 5px' }}>Ctrl</kbd>
            +
            <kbd style={{ background: '#141a20', border: '1px solid #2a333c', borderRadius: 4, padding: '1px 5px' }}>Tab</kbd>
          </span>
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: 6 }} className="sush-scroll">
          {items.map((tab, i) => {
            const on = i === index
            const exited = tab.status === 'exited'
            return (
              <div
                key={tab.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px',
                  borderRadius: 'var(--r-md)',
                  background: on ? rgba(accent, 0.14) : 'transparent',
                  border: `1px solid ${on ? rgba(accent, 0.4) : 'transparent'}`
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: exited ? '#ff5370' : '#42d392', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: on ? 'var(--text-1)' : '#cbd3da', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.label}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.cwd || tab.profileLabel || tab.shell}</span>
                </span>
                {i === 0 && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-4)', background: '#141a20', border: '1px solid #1d242b', borderRadius: 'var(--r-xs)', padding: '1px 6px', flexShrink: 0 }}>current</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
