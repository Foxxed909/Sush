import React from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

export default function TitleBar({ accent, onSettings }) {
  const ctrl = (action) => window.sush.windowControl(action)

  return (
    <div
      className="flex items-center justify-between px-3 shrink-0"
      style={{ background: '#0c0e11', height: 34, WebkitAppRegion: 'drag', borderBottom: `1px solid ${rgba(accent, 0.08)}` }}
    >
      <div className="flex items-center" style={{ gap: 9, WebkitAppRegion: 'no-drag' }}>
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: 5,
            background: `linear-gradient(150deg, ${accent}, ${rgba(accent, 0.4)})`,
            boxShadow: `0 0 10px ${rgba(accent, 0.5)}`
          }}
        />
        <span style={{ color: accent, fontWeight: 800, fontSize: 12.5, letterSpacing: 2 }}>SUSH</span>
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

        <div className="flex" style={{ gap: 8, marginLeft: 4 }}>
          {[
            { action: 'minimize', symbol: '-', color: '#ffbd2e' },
            { action: 'maximize', symbol: '⤢', color: '#28ca42' },
            { action: 'close', symbol: '×', color: '#ff5f57' }
          ].map(({ action, symbol, color }) => (
            <button
              key={action}
              onClick={() => ctrl(action)}
              title={action}
              style={{
                width: 13,
                height: 13,
                borderRadius: '50%',
                background: color,
                border: 'none',
                cursor: 'pointer',
                fontSize: 9,
                lineHeight: 1,
                color: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(0,0,0,0.55)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'transparent' }}
            >
              {symbol}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
