import React from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

export default function TitleBar({ accent, onSettings, sessionCount = 0 }) {
  const ctrl = (action) => window.sush.windowControl(action)

  return (
    <div
      data-glass
      className="flex items-center justify-between px-3 shrink-0"
      style={{
        background: '#0c0e11',
        height: 38,
        WebkitAppRegion: 'drag',
        borderBottom: `1px solid ${rgba(accent, 0.08)}`,
        boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.03)'
      }}
    >
      <div className="flex items-center" style={{ gap: 9, WebkitAppRegion: 'no-drag' }}>
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: 'var(--r-sm)',
            background: `linear-gradient(150deg, ${accent}, ${rgba(accent, 0.4)})`,
            boxShadow: `0 0 10px ${rgba(accent, 0.5)}`
          }}
        />
        <span style={{ color: accent, fontWeight: 800, fontSize: 12.5, letterSpacing: 2, fontFeatureSettings: "'ss01', 'kern'" }}>SUSH</span>
        {sessionCount > 0 && (
          <span
            title={`${sessionCount} active session${sessionCount !== 1 ? 's' : ''}`}
            style={{ fontSize: 10, fontWeight: 700, color: '#5a646d', background: '#111519', border: '1px solid #1d242b', borderRadius: 'var(--r-pill)', padding: '2px 7px', letterSpacing: 0.5 }}
          >
            {sessionCount}
          </span>
        )}
      </div>

      <div className="flex items-center" style={{ gap: 10, WebkitAppRegion: 'no-drag' }}>
        <button
          onClick={onSettings}
          title="Settings"
          className="flex items-center justify-center"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#69727a', padding: 4, borderRadius: 6, transition: 'color .15s' }}
          onMouseEnter={e => { e.currentTarget.style.color = accent }}
          onMouseLeave={e => { e.currentTarget.style.color = '#69727a' }}
        >
          <Icon name="settings" size={15} />
        </button>

        {/* macOS traffic-light buttons — symbols show on group hover */}
        <div
          className="flex traffic-lights"
          style={{ gap: 6, marginLeft: 4 }}
          onMouseEnter={e => { e.currentTarget.querySelectorAll('button').forEach(b => { b.style.color = 'rgba(0,0,0,0.6)' }) }}
          onMouseLeave={e => { e.currentTarget.querySelectorAll('button').forEach(b => { b.style.color = 'transparent' }) }}
        >
          {[
            { action: 'minimize', symbol: '−', color: '#ffbd2e' },
            { action: 'maximize', symbol: '⤢', color: '#28ca42' },
            { action: 'close', symbol: '×', color: '#ff5f57' }
          ].map(({ action, symbol, color }) => (
            <button
              key={action}
              onClick={() => ctrl(action)}
              title={action}
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: color,
                border: 'none',
                cursor: 'pointer',
                fontSize: 8,
                lineHeight: 1,
                color: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color .1s',
                boxShadow: `0 1px 2px rgba(0,0,0,0.3)`
              }}
            >
              {symbol}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
