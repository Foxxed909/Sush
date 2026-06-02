import React from 'react'
import { themes } from '../themes'

const FONTS = ["'Cascadia Code'", "'Fira Code'", "Consolas", "'JetBrains Mono'", "'Courier New'"]
const CURSORS = ['block', 'bar', 'underline']

export default function Settings({ settings, onChange, onClose, accent }) {
  const set = (key, val) => onChange({ ...settings, [key]: val })

  const label = (text) => (
    <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{text}</div>
  )

  const row = (children) => (
    <div style={{ marginBottom: 20 }}>{children}</div>
  )

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300, display: 'flex',
        justifyContent: 'flex-end', background: '#0005'
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 320, height: '100%', background: '#141414',
        borderLeft: `1px solid ${accent}22`, padding: 24,
        overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <span style={{ color: accent, fontWeight: 700, fontSize: 15 }}>Settings</span>
          <button onClick={onClose} style={{ color: '#666', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        <div style={{ color: accent, fontSize: 12, fontWeight: 700, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Terminal</div>

        {row(<>
          {label('Font Size')}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="range" min={8} max={28} value={settings.fontSize ?? 14}
              onChange={e => set('fontSize', Number(e.target.value))}
              style={{ flex: 1, accentColor: accent }} />
            <span style={{ color: '#eee', fontSize: 13, width: 24, textAlign: 'right' }}>{settings.fontSize ?? 14}</span>
          </div>
        </>)}

        {row(<>
          {label('Font Family')}
          <select value={settings.fontFamily ?? FONTS[0]}
            onChange={e => set('fontFamily', e.target.value)}
            style={{ width: '100%', background: '#1f1f1f', border: `1px solid ${accent}33`, color: '#eee', borderRadius: 4, padding: '5px 8px', fontSize: 13 }}>
            {FONTS.map(f => <option key={f} value={f}>{f.replace(/'/g, '')}</option>)}
          </select>
        </>)}

        {row(<>
          {label('Cursor Style')}
          <div style={{ display: 'flex', gap: 6 }}>
            {CURSORS.map(c => (
              <button key={c} onClick={() => set('cursorStyle', c)}
                style={{
                  flex: 1, padding: '5px 0', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                  background: (settings.cursorStyle ?? 'block') === c ? accent : '#1f1f1f',
                  color: (settings.cursorStyle ?? 'block') === c ? '#000' : '#aaa',
                  border: `1px solid ${accent}33`, fontWeight: 600
                }}>
                {c}
              </button>
            ))}
          </div>
        </>)}

        <div style={{ color: accent, fontSize: 12, fontWeight: 700, marginBottom: 16, marginTop: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Theme</div>

        {row(<>
          {label('Color Scheme')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.values(themes).map(t => (
              <button key={t.id} onClick={() => set('themeId', t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                  background: (settings.themeId ?? 'pink') === t.id ? `${t.ui.accent}22` : '#1f1f1f',
                  border: `1px solid ${(settings.themeId ?? 'pink') === t.id ? t.ui.accent : '#2a2a2a'}`,
                  color: '#eee', fontSize: 13, textAlign: 'left'
                }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: t.ui.accent, flexShrink: 0 }} />
                {t.label}
              </button>
            ))}
          </div>
        </>)}

        <div style={{ color: accent, fontSize: 12, fontWeight: 700, marginBottom: 16, marginTop: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Window</div>

        {row(<>
          {label('Background Opacity')}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="range" min={70} max={100} value={settings.opacity ?? 100}
              onChange={e => set('opacity', Number(e.target.value))}
              style={{ flex: 1, accentColor: accent }} />
            <span style={{ color: '#eee', fontSize: 13, width: 32, textAlign: 'right' }}>{settings.opacity ?? 100}%</span>
          </div>
        </>)}
      </div>
    </div>
  )
}
