import React from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'

// Shared building blocks for every settings section. These exist because the
// old single-file Settings hand-copied the same toggle-button markup ~15
// times — one drifted style tweak away from an inconsistent page. The DESIGN
// vocabulary ("full-width labeled buttons with state text, never bare
// switches") lives here once.

export const inputStyle = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--border-2)',
  color: 'var(--text-2)',
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: 12,
  outline: 'none'
}

export function Label({ children }) {
  return <div style={{ color: 'var(--text-3)', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 7 }}>{children}</div>
}

// Every setting lives in a Row. `data-setting-row` is what powers row-level
// search in the shell: the query is matched against each row's rendered text,
// so a control is findable by its label, its state text, or its description.
export function Row({ children }) {
  return <div data-setting-row style={{ marginBottom: 16 }}>{children}</div>
}

// The small gray explainer under a control.
export function Hint({ children, warn }) {
  return <div style={{ fontSize: 10.5, color: warn ? '#ffb74d' : 'var(--text-4)', marginTop: 6, lineHeight: 1.5 }}>{children}</div>
}

// Section header + scroll anchor. Self-describing (id/icon/label as props) so
// the shell's nav and the body can never disagree about a section again.
export function Section({ id, icon, label, accent, children }) {
  return (
    <div data-settings-sec={id} style={{ marginBottom: 30, scrollMarginTop: 12 }}>
      <div className="flex items-center" style={{ gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-1)' }}>
        {icon && (
          <span className="flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 8, background: `linear-gradient(145deg, ${rgba(accent, 0.22)}, ${rgba(accent, 0.05)})`, border: `1px solid ${rgba(accent, 0.28)}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)', color: accent, flexShrink: 0 }}>
            <Icon name={icon} size={13} strokeWidth={2} />
          </span>
        )}
        <span style={{ color: 'var(--text-1)', fontSize: 'var(--fs-lg)', fontWeight: 800, letterSpacing: 0.2 }}>{label}</span>
      </div>
      {children}
    </div>
  )
}

// The house toggle: a full-width button whose label IS the state, per the
// design system ("state is always written out"). `on` decides the accent
// treatment; `onText`/`offText` are the written states.
export function Toggle({ accent, on, onText, offText, icon, onClick, disabled = false, fullWidth = true }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '8px 12px',
        borderRadius: 8,
        background: on ? rgba(accent, 0.1) : 'var(--surface-2)',
        border: `1px solid ${on ? rgba(accent, 0.4) : 'var(--border-2)'}`,
        color: on ? accent : 'var(--text-3)',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 12.5,
        fontWeight: 700,
        width: fullWidth ? '100%' : undefined,
        opacity: disabled ? 0.7 : 1
      }}
    >
      {icon && <Icon name={icon} size={14} strokeWidth={2} />}
      {on ? onText : offText}
    </button>
  )
}

// The house pill-row picker. options: [value, label, { locked, lockTitle }?].
// Locked options render with a lock glyph and don't fire.
export function Segment({ accent, value, options, onChange, disabled = false }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map(([val, lbl, meta]) => {
        const on = value === val
        const locked = !!meta?.locked
        return (
          <button
            key={String(val)}
            onClick={() => { if (!locked && !disabled) onChange(val) }}
            disabled={disabled || locked}
            title={locked ? (meta?.lockTitle || '') : ''}
            className="flex items-center justify-center"
            style={{
              gap: 5,
              flex: 1,
              padding: '7px 0',
              borderRadius: 'var(--r-sm)',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: (locked || disabled) ? 'default' : 'pointer',
              opacity: locked ? 0.55 : 1,
              background: on ? accent : 'var(--surface-2)',
              color: on ? '#0a0a0a' : 'var(--text-3)',
              border: `1px solid ${on ? accent : 'var(--border-2)'}`
            }}
          >
            {locked && <Icon name="lock" size={10} strokeWidth={2.2} />}
            {lbl}
          </button>
        )
      })}
    </div>
  )
}

// Tier-gate banner: what the feature is + which plan opens it. Gating is
// gentle — it teaches, it doesn't fight.
export function LockNote({ accent, children }) {
  return (
    <div className="flex items-center" style={{ gap: 11, borderRadius: 'var(--r-lg)', border: `1px solid ${rgba(accent, 0.25)}`, background: rgba(accent, 0.05), padding: '12px 14px' }}>
      <span className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 8, background: rgba(accent, 0.12), color: accent, flexShrink: 0 }}>
        <Icon name="lock" size={14} strokeWidth={2} />
      </span>
      <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.5 }}>{children}</div>
    </div>
  )
}

// Relative timestamp ("3m ago") shared by Accounts and Usage.
export function ago(ts) {
  if (!ts) return null
  const m = (Date.now() - ts) / 60000
  if (m < 1) return 'just now'
  if (m < 60) return `${Math.round(m)}m ago`
  const h = m / 60
  if (h < 24) return `${Math.round(h)}h ago`
  return `${Math.round(h / 24)}d ago`
}
