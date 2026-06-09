import React, { useEffect, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

// A quiet, dismissible toast: "You've run X 15 times — alias it?" Anchored
// bottom-left, above the status bar, clear of the Seducia orb (bottom-right).
export default function AliasNudge({ suggestion, accent, onAccept, onDismiss, onClose }) {
  const [alias, setAlias] = useState(suggestion?.alias ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Reset the editable alias when a new suggestion comes in.
  useEffect(() => { setAlias(suggestion?.alias ?? ''); setSaved(false) }, [suggestion?.command, suggestion?.alias])

  if (!suggestion) return null
  const { command, count } = suggestion

  const accept = async () => {
    const name = alias.trim()
    if (!name || saving) return
    setSaving(true)
    await onAccept?.(name, command)
    setSaving(false)
    setSaved(true)
  }

  return (
    <div
      data-glass
      className="sush-glass-ui sush-fade-up"
      style={{
        position: 'fixed', left: 16, bottom: 44, zIndex: 340,
        width: 320, maxWidth: '88vw',
        borderRadius: 'var(--r-lg, 12px)',
        border: `1px solid ${rgba(accent, 0.28)}`,
        background: 'rgba(11,14,19,0.94)',
        boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
        padding: '13px 14px 12px'
      }}
    >
      {saved ? (
        <div className="flex items-center" style={{ gap: 9, padding: '2px 0' }}>
          <Icon name="check" size={15} color="#7ee787" strokeWidth={2.6} />
          <span style={{ color: '#cdd5dc', fontSize: 12.5, fontWeight: 700 }}>
            Aliased — type <code style={{ color: accent, fontWeight: 800 }}>{alias.trim()}</code> anywhere now.
          </span>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center" style={{ gap: 8, marginBottom: 9 }}>
            <Icon name="sparkles" size={14} color={accent} strokeWidth={2} />
            <span style={{ color: '#e6ebef', fontSize: 12, fontWeight: 800, letterSpacing: 0.2 }}>Make an alias?</span>
            <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, color: accent, background: rgba(accent, 0.12), border: `1px solid ${rgba(accent, 0.28)}`, borderRadius: 99, padding: '1px 7px' }}>
              {count}× run
            </span>
            <button onClick={onClose} title="Hide for now" style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: '#5a646d', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="x" size={13} />
            </button>
          </div>

          {/* The command */}
          <div style={{ fontFamily: 'var(--mono, monospace)', fontSize: 12, color: '#aeb7c0', background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '7px 9px', marginBottom: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {command}
          </div>

          {/* Alias name + actions */}
          <div className="flex items-center" style={{ gap: 7 }}>
            <div className="flex items-center" style={{ flex: 1, background: '#0f1318', border: `1px solid ${rgba(accent, 0.35)}`, borderRadius: 8, padding: '0 9px', height: 32, gap: 7 }}>
              <span style={{ color: '#5a646d', fontSize: 12, fontWeight: 700 }}>as</span>
              <input
                value={alias}
                onChange={e => setAlias(e.target.value.replace(/\s+/g, ''))}
                onKeyDown={e => { if (e.key === 'Enter') accept() }}
                spellCheck={false}
                autoFocus
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: accent, fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono, monospace)' }}
              />
            </div>
            <button
              onClick={accept}
              disabled={saving || !alias.trim()}
              style={{ height: 32, padding: '0 13px', borderRadius: 8, border: 'none', background: accent, color: '#05070b', fontSize: 12, fontWeight: 800, cursor: saving || !alias.trim() ? 'default' : 'pointer', opacity: saving || !alias.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {saving ? <Icon name="sparkles" size={13} className="sush-spin" /> : <Icon name="check" size={13} strokeWidth={2.6} />}
              Add
            </button>
          </div>

          <button
            onClick={() => onDismiss?.(command)}
            style={{ marginTop: 8, background: 'transparent', border: 'none', color: '#5a646d', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}
          >
            Never suggest this one
          </button>
        </>
      )}
    </div>
  )
}
