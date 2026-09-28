import React from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'

// Shared helpers for the right-panel tabs (each tab lives in its own file
// in this folder; the RightPanel shell only owns the strip and routing).

// Best-effort clipboard helper — uses Sush IPC, falls back to the web API.
export function copyToClipboard(text) {
  const str = String(text ?? '')
  try {
    if (window.sush?.copyText) { window.sush.copyText(str); return }
  } catch {}
  try { navigator.clipboard?.writeText(str) } catch {}
}

export function joinPath(parent, name) {
  const sep = parent.includes('\\') ? '\\' : '/'
  return `${parent.replace(/[\\/]+$/, '')}${sep}${name}`
}

export function fileName(path) {
  return String(path || '').split(/[\\/]/).filter(Boolean).pop() || path
}

// ---- Git status code → colour + label ----
const STATUS_META = {
  M: { c: '#ffcb6b', t: 'M' },
  A: { c: '#c3e88d', t: 'A' },
  D: { c: '#ff5370', t: 'D' },
  R: { c: '#82aaff', t: 'R' },
  C: { c: '#82aaff', t: 'C' },
  U: { c: '#ff9aaa', t: 'U' },
  '??': { c: '#89ddff', t: 'U' }
}
export function statusMeta(code) {
  return STATUS_META[code] || STATUS_META[code?.[0]] || { c: 'var(--text-3)', t: code || '?' }
}

export function PanelEmpty({ icon, accent, children, hint }) {
  return (
    <div className="flex flex-col items-center justify-center" style={{ height: '100%', gap: 10, padding: 24, textAlign: 'center' }}>
      <span className="flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 12, background: rgba(accent, 0.1), border: `1px solid ${rgba(accent, 0.25)}`, color: accent }}>
        <Icon name={icon} size={20} />
      </span>
      <div style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 700 }}>{children}</div>
      {hint && <div style={{ color: 'var(--text-3)', fontSize: 11.5, maxWidth: 240 }}>{hint}</div>}
    </div>
  )
}

export function TabHeader({ accent, icon, title, sub, onRefresh, right }) {
  return (
    <div className="flex items-center" style={{ gap: 11, padding: '12px 14px', borderBottom: '1px solid var(--border-1)' }}>
      <Icon name={icon} size={15} color="var(--text-3)" strokeWidth={2} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {sub && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-4)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
      </span>
      {right}
      {onRefresh && (
        <button onClick={onRefresh} title="Refresh" className="sush-icon-btn flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border-1)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
          <Icon name="refresh" size={14} />
        </button>
      )}
    </div>
  )
}
