import React, { useEffect } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'
import { CHANGELOG } from '../lib/changelog'

// A full-page changelog, opened from the palette ("What's New"), Settings ▸
// Plan, or automatically once after an update. Same standalone-page shape as
// PlansPage — a header + a scroll, never a section buried in Settings.

const GROUPS = [
  { key: 'new', label: 'New', icon: 'sparkles', color: '#5fd3a8' },
  { key: 'improved', label: 'Improved', icon: 'activity', color: '#82aaff' },
  { key: 'fixed', label: 'Fixed', icon: 'check', color: '#ffcb6b' }
]

function ChangeGroup({ group, items, accent }) {
  if (!items?.length) return null
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="flex items-center" style={{ gap: 7, marginBottom: 8 }}>
        <Icon name={group.icon} size={12} strokeWidth={2.4} color={group.color} />
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: group.color }}>{group.label}</span>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {items.map((text, i) => (
          <li key={i} className="flex" style={{ gap: 9, fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-2)' }}>
            <span style={{ flexShrink: 0, marginTop: 7, width: 4, height: 4, borderRadius: '50%', background: rgba(group.color, 0.8) }} />
            <span style={{ minWidth: 0 }}>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ChangelogPage({ accent, onDismiss }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onDismiss?.() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  return (
    <div className="sush-page-in" style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', background: 'var(--surface-0)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 26px', borderBottom: '1px solid var(--border-1)', flexShrink: 0 }}>
        <div className="flex items-center" style={{ gap: 13 }}>
          <span className="flex items-center justify-center" style={{ width: 38, height: 38, borderRadius: 11, background: `linear-gradient(150deg, ${rgba(accent, 0.3)}, ${rgba(accent, 0.06)})`, border: `1px solid ${rgba(accent, 0.4)}`, boxShadow: `0 8px 22px ${rgba(accent, 0.2)}, inset 0 1px 0 rgba(255,255,255,0.1)`, color: accent }}>
            <Icon name="sparkles" size={18} strokeWidth={2} />
          </span>
          <div>
            <div style={{ color: 'var(--text-1)', fontWeight: 900, fontSize: 19, letterSpacing: -0.4, lineHeight: 1.1 }}>What’s New</div>
            <div style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)', fontWeight: 600, marginTop: 1 }}>Everything that’s changed in Sush, newest first</div>
          </div>
        </div>
        <button onClick={onDismiss} title="Close (Esc)" className="flex items-center" style={{ gap: 7, height: 32, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border-2)', background: 'var(--surface-1)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
          <Icon name="x" size={13} /> Close
        </button>
      </div>

      {/* Timeline */}
      <div className="sush-scroll" style={{ flex: 1, overflowY: 'auto', padding: '26px 30px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          {CHANGELOG.map((rel, i) => {
            const tint = accent
            return (
              <div key={rel.v} className="flex" style={{ gap: 18, marginBottom: 30 }}>
                {/* Rail */}
                <div className="flex flex-col items-center" style={{ flexShrink: 0, width: 12, paddingTop: 4 }}>
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: i === 0 ? accent : 'var(--surface-3)', border: `2px solid ${i === 0 ? rgba(accent, 0.4) : 'var(--border-3)'}`, boxShadow: i === 0 ? `0 0 12px ${rgba(accent, 0.6)}` : 'none' }} />
                  {i < CHANGELOG.length - 1 && <span style={{ flex: 1, width: 1, background: 'var(--border-2)', marginTop: 6, minHeight: 40 }} />}
                </div>

                {/* Body */}
                <div style={{ flex: 1, minWidth: 0, paddingBottom: 6 }}>
                  <div className="flex items-center" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-1)', letterSpacing: -0.3 }}>v{rel.v}</span>
                    {rel.codename && (
                      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: tint, background: rgba(tint, 0.12), border: `1px solid ${rgba(tint, 0.3)}`, borderRadius: 999, padding: '2px 9px' }}>{rel.codename}</span>
                    )}
                    {i === 0 && (
                      <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.6, textTransform: 'uppercase', color: '#05070b', background: accent, borderRadius: 999, padding: '2px 9px' }}>Latest</span>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-4)', fontWeight: 600 }}>{rel.date}</span>
                  </div>
                  {rel.summary && <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5, marginBottom: 14 }}>{rel.summary}</div>}
                  {GROUPS.map(g => <ChangeGroup key={g.key} group={g} items={rel.changes?.[g.key]} accent={accent} />)}
                </div>
              </div>
            )
          })}
          <div style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--text-5)', fontWeight: 700, letterSpacing: 1, paddingTop: 6 }}>
            SUSH · the terminal your agents live in
          </div>
        </div>
      </div>
    </div>
  )
}
