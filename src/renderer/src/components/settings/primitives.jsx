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
  height: 34,
  background: 'var(--surface-2)',
  border: '1px solid var(--border-2)',
  color: 'var(--text-1)',
  borderRadius: 8,
  padding: '0 11px',
  fontSize: 13,
  outline: 'none'
}

// A row's title: sentence case, readable size. (The old 10.5px uppercase
// 800-weight eyebrows on every row were most of the page's visual noise.)
export function Label({ children }) {
  return <div className="st-label">{children}</div>
}

// Every setting lives in a Row. `data-setting-row` is what powers row-level
// search in the shell: the query is matched against each row's rendered text,
// so a control is findable by its label, its state text, or its description.
export function Row({ children }) {
  return <div data-setting-row className="st-row">{children}</div>
}

// The small gray explainer under a control.
export function Hint({ children, warn }) {
  return <div className={`st-hint${warn ? ' is-warn' : ''}`}>{children}</div>
}

// Section = one settings page (or one block of results while searching).
// Self-describing (id/icon/label as props) so the shell's nav and the body
// can never disagree about a section.
export const SECTION_DESCRIPTIONS = {
  Plan: 'Your plan, unlock codes and settings backup.',
  Accounts: 'CLI logins Sush can rotate between when one hits its limit.',
  'Usage & Guard': 'Track usage and stop agents before they hit a limit.',
  'Agents & Seducia': 'Which agents you launch, and how Seducia helps.',
  'Voice & Dictation': 'Talk to your agents and hear them back.',
  Terminal: 'Fonts, cursor, scrollback and shell behaviour.',
  Appearance: 'Theme, accent, wallpaper and motion.',
  Power: 'Battery, quiet hours and performance.',
  System: 'Startup, notifications, data and advanced options.'
}

export const SECTION_TITLES = {
  Plan: 'Profile & plan', 'Usage & Guard': 'Usage & limits', 'Agents & Seducia': 'Agents',
  'Voice & Dictation': 'Voice', Power: 'Performance', System: 'Advanced'
}

export function Section({ id, label, description, children }) {
  const desc = description ?? SECTION_DESCRIPTIONS[id]
  label = SECTION_TITLES[id] || label
  return (
    <section data-settings-sec={id} className="st-section">
      <header className="st-section-head">
        <h2>{label}</h2>
        {desc && <p>{desc}</p>}
      </header>
      <div className="st-section-body">{children}</div>
    </section>
  )
}

// A switch row. The written state stays (DESIGN: "state is always written
// out") as the row's label, with a real switch beside it so on/off reads at
// a glance.
export function Toggle({ accent, on, onText, offText, icon, onClick, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      onClick={onClick}
      disabled={disabled}
      className={`st-toggle${on ? ' is-on' : ''}`}
      style={{ '--st-accent': accent }}
    >
      {icon && <Icon name={icon} size={15} strokeWidth={1.8} />}
      <span className="st-toggle-text">{on ? onText : offText}</span>
      <span className="st-switch" aria-hidden><span /></span>
    </button>
  )
}

// The house pill-row picker. options: [value, label, { locked, lockTitle }?].
// Locked options render with a lock glyph and don't fire.
export function Segment({ accent, value, options, onChange, disabled = false }) {
  return (
    <div className="st-segment">
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
              height: 28,
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: on ? 600 : 500,
              cursor: (locked || disabled) ? 'default' : 'pointer',
              opacity: locked ? 0.55 : 1,
              background: on ? 'var(--surface-4, rgba(255,255,255,.12))' : 'transparent',
              color: on ? 'var(--text-1)' : 'var(--text-3)',
              border: 0,
              boxShadow: on ? '0 1px 2px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.08)' : 'none',
              transition: 'background-color var(--dur-quick) ease, color var(--dur-quick) ease'
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
