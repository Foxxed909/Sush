import React, { useRef, useState } from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { TIER_META } from '../PlansPage'
import { loadCustomAgents, saveCustomAgents } from '../../lib/agents'
import { Section, Row, Label, Hint } from './primitives'

// Plan summary + preferences backup. Full pricing wall (PlansPage) is soft-retired
// for solo use — see docs/ladder-pricing-tier-layout.md. Unlock codes still work.

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

function RedeemRow({ accent, ent }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const redeem = async () => {
    const c = code.trim()
    if (!c || busy) return
    setBusy(true); setMsg(null)
    const r = await ent.redeem?.(c)
    setBusy(false)
    if (r?.ok) {
      setMsg({ ok: true, text: `Unlocked ${TIER_META[r.tier]?.label || r.tier}.` })
      setCode('')
    } else {
      setMsg({ ok: false, text: r?.error || 'Could not redeem that code.' })
    }
  }

  return (
    <Row>
      <Label>Unlock code</Label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') redeem() }}
          placeholder="SUSH-PLUS-…"
          spellCheck={false}
          className="sush-mono"
          style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)', borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none', letterSpacing: 0.4 }}
        />
        <button
          onClick={redeem}
          disabled={!code.trim() || busy}
          style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color: code.trim() && !busy ? '#0a0a0a' : 'var(--text-4)', background: code.trim() && !busy ? accent : 'var(--surface-2)', border: `1px solid ${rgba(accent, 0.4)}`, borderRadius: 999, padding: '0 16px', cursor: code.trim() && !busy ? 'pointer' : 'default' }}
        >
          {busy ? '…' : 'Redeem'}
        </button>
      </div>
      {msg && <div style={{ fontSize: 11, fontWeight: 700, color: msg.ok ? '#7fd6a0' : '#ff8aa0', marginTop: 6 }}>{msg.text}</div>}
      <Hint>Offline unlock — no account, no payment rails. Ladder layout docs: docs/ladder-pricing-tier-layout.md</Hint>
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
        </div>
        <Hint>Plans comparison page is soft-retired (solo). Redeem a code below if you have one.</Hint>
      </Row>
      <RedeemRow accent={accent} ent={ent} />
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
