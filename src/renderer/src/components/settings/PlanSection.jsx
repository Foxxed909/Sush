import React, { useRef, useState } from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { TIER_META } from '../PlansPage'
import { loadCustomAgents, saveCustomAgents } from '../../lib/agents'
import { Section, Row, Label, Hint } from './primitives'

// Plan summary + preferences backup. The full pricing wall lives on its own
// page (PlansPage) — Settings shows where you are and hands you the door.
// Backup lives here (not with .sushrc) because a preferences file is an
// account-shaped artifact: it's what you carry to a new machine.

function BackupRow({ accent, settings, onChange }) {
  const fileRef = useRef(null)
  const [msg, setMsg] = useState('')

  const btn = (primary) => ({ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '8px 12px', borderRadius: 8, background: primary ? rgba(accent, 0.1) : 'var(--surface-2)', border: `1px solid ${primary ? rgba(accent, 0.35) : 'var(--border-2)'}`, color: primary ? accent : 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontWeight: 700 })

  const doExport = () => {
    try {
      const data = { app: 'sush', kind: 'preferences', version: 1, exportedAt: new Date().toISOString(), settings: settings || {}, customAgents: loadCustomAgents() }
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url; a.download = 'sush-preferences.json'; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMsg('Exported sush-preferences.json')
    } catch { setMsg('Export failed.') }
  }

  const onPick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || '{}'))
        if (data.app !== 'sush' || !data.settings) { setMsg('That isn’t a Sush backup file.'); return }
        if (Array.isArray(data.customAgents)) saveCustomAgents(data.customAgents)
        onChange({ ...settings, ...data.settings })
        setMsg('Restored. A few changes apply on next launch.')
      } catch { setMsg('Could not read that file.') }
    }
    reader.readAsText(file)
  }

  return (
    <Row>
      <Label>Preferences backup</Label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={doExport} style={btn(true)}><Icon name="download" size={13} strokeWidth={2} /> Export</button>
        <button onClick={() => fileRef.current?.click()} style={btn(false)}><Icon name="upload" size={13} strokeWidth={2} /> Import</button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onPick} style={{ display: 'none' }} />
      </div>
      <Hint>Saves your settings and custom agents to a file. No API keys or account logins are included.</Hint>
      {msg && <div style={{ fontSize: 11, fontWeight: 700, color: accent, marginTop: 6 }}>{msg}</div>}
    </Row>
  )
}

export default function PlanSection({ accent, ent, settings, onChange }) {
  const tier = ent.tier || 'free'
  const meta = TIER_META[tier] || TIER_META.free
  return (
    <Section id="Plan" icon="star" label="Plan" accent={accent}>
      <Row>
        <div className="flex items-center" style={{ gap: 13, padding: '14px 16px', borderRadius: 'var(--r-lg)', border: `1px solid ${rgba(meta.color, 0.35)}`, background: rgba(meta.color, 0.07) }}>
          <span className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 10, background: rgba(meta.color, 0.15), border: `1px solid ${rgba(meta.color, 0.4)}`, color: meta.color, flexShrink: 0 }}>
            <Icon name="star" size={16} strokeWidth={2} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 900, color: 'var(--text-1)' }}>
              {meta.label} plan {ent.expiry && <span style={{ color: 'var(--text-3)', fontWeight: 700, fontSize: 11 }}>· trial</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{meta.blurb}</div>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('sush:open-plans'))}
            style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: '#0a0a0a', background: accent, border: `1px solid ${accent}`, borderRadius: 999, padding: '8px 16px', cursor: 'pointer' }}
          >
            View plans →
          </button>
        </div>
        <Hint>Compare tiers, redeem an unlock code, or revert to Free — all on the Plans page.</Hint>
      </Row>
      <Row>
        <Label>What’s new</Label>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('sush:open-changelog'))}
          className="flex items-center"
          style={{ gap: 9, padding: '9px 12px', borderRadius: 9, background: 'var(--surface-2)', border: `1px solid ${rgba(accent, 0.3)}`, color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, width: '100%' }}
        >
          <Icon name="sparkles" size={14} color={accent} strokeWidth={2} />
          See what changed in this release
          <Icon name="arrowRight" size={13} color="var(--text-4)" style={{ marginLeft: 'auto' }} />
        </button>
      </Row>
      <BackupRow accent={accent} settings={settings} onChange={onChange} />
    </Section>
  )
}
