import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'
import { themes, presetThemeIds } from '../themes'

// Compact in-shell theme switcher: a row of accent swatches that writes straight
// to settings.themeId (the same mechanism Settings + the palette use). Lives in
// the TitleBar so the premium preset family is always one click away.
function ThemeSwitcher({ accent, themeId, onThemeChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const presets = presetThemeIds.map(id => themes[id]).filter(Boolean)

  return (
    <div ref={ref} style={{ position: 'relative', WebkitAppRegion: 'no-drag', display: 'flex', alignItems: 'center' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Theme"
        className="flex items-center justify-center"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: open ? accent : '#69727a', padding: 4, borderRadius: 6, transition: 'color .15s' }}
        onMouseEnter={e => { e.currentTarget.style.color = accent }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.color = '#69727a' }}
      >
        <Icon name="palette" size={15} />
      </button>

      {open && (
        <div
          className="sush-swatch-pop flex items-center"
          data-glass
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 400,
            gap: 9,
            padding: '9px 11px',
            borderRadius: 'var(--r-lg)',
            background: 'rgba(10,12,16,0.92)',
            border: `1px solid ${rgba(accent, 0.22)}`,
            boxShadow: '0 14px 38px rgba(0,0,0,0.6)'
          }}
        >
          {presets.map(t => (
            <button
              key={t.id}
              onClick={() => { onThemeChange?.(t.id); setOpen(false) }}
              title={t.label}
              data-active={t.id === themeId}
              className="sush-swatch"
              style={{ background: t.ui.accent, '--swatch-glow': rgba(t.ui.accent, 0.7) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function TitleBar({ accent, onSettings, sessionCount = 0, themeId, onThemeChange }) {
  const ctrl = (action) => window.sush.windowControl(action)

  return (
    <div
      data-glass
      className="flex items-center justify-between shrink-0"
      style={{
        background: 'rgba(12,14,17,0.55)',
        height: 40,
        padding: '0 14px',
        WebkitAppRegion: 'drag',
        borderBottom: `1px solid ${rgba(accent, 0.1)}`
      }}
    >
      {/* Brand lockup */}
      <div className="flex items-center" style={{ gap: 10, WebkitAppRegion: 'no-drag' }}>
        <span
          style={{
            width: 17,
            height: 17,
            borderRadius: 'var(--r-sm)',
            background: `linear-gradient(145deg, ${accent}, ${rgba(accent, 0.35)})`,
            boxShadow: `0 0 12px ${rgba(accent, 0.45)}, inset 0 1px 0 rgba(255,255,255,0.35)`
          }}
        />
        <span style={{ color: '#f1f4f6', fontWeight: 800, fontSize: 12.5, letterSpacing: 2.5, fontFeatureSettings: "'ss01', 'kern'" }}>SUSH</span>
        {sessionCount > 0 && (
          <span
            title={`${sessionCount} active session${sessionCount !== 1 ? 's' : ''}`}
            className="flex items-center"
            style={{ gap: 5, fontSize: 10, fontWeight: 700, color: accent, background: rgba(accent, 0.1), border: `1px solid ${rgba(accent, 0.2)}`, borderRadius: 'var(--r-pill)', padding: '2px 8px', letterSpacing: 0.3 }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: accent, boxShadow: `0 0 6px ${accent}` }} />
            {sessionCount}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center" style={{ gap: 4, WebkitAppRegion: 'no-drag' }}>
        <ThemeSwitcher accent={accent} themeId={themeId} onThemeChange={onThemeChange} />

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

        {/* Divider */}
        <span style={{ width: 1, height: 16, background: rgba(accent, 0.12), margin: '0 8px 0 6px' }} />

        {/* macOS traffic-light buttons — symbols show on group hover */}
        <div
          className="flex traffic-lights"
          style={{ gap: 7 }}
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
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.35), 0 1px 2px rgba(0,0,0,0.3)'
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
