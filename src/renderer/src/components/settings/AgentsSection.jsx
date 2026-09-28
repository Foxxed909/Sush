import React, { useState } from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { loadCustomAgents, addCustomAgent, removeCustomAgent, BUILTIN_AGENTS } from '../../lib/agents'
import { Section, Row, Label, Hint, Segment, LockNote, inputStyle } from './primitives'

// Agents & Seducia — who does the thinking. The Seducia engine picker (one
// control) merged into the agent catalog: they're the same concern, and a
// whole nav section for three buttons was noise.

export default function AgentsSection({ accent, ent, settings, set }) {
  const [custom, setCustom] = useState(() => loadCustomAgents())
  const [form, setForm] = useState({ label: '', command: '', resumeCommand: '' })
  const [err, setErr] = useState('')

  const locked = !ent.can('customAgents')

  const add = () => {
    if (locked) return
    const r = addCustomAgent(form)
    if (!r.ok) { setErr(r.error); return }
    setErr('')
    setForm({ label: '', command: '', resumeCommand: '' })
    setCustom(loadCustomAgents())
  }

  return (
    <Section id="Agents & Seducia" icon="rocket" label="Agents & Seducia" accent={accent}>
      <Row>
        <Label>Seducia's engine</Label>
        <Segment
          accent={accent}
          value={settings.seduciaCliEngine || 'auto'}
          options={[['auto', 'Auto'], ['claude', 'Claude'], ['codex', 'Codex'], ['gemini', 'Gemini']]}
          onChange={(v) => set('seduciaCliEngine', v)}
        />
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', background: rgba(accent, 0.05), border: `1px solid ${rgba(accent, 0.16)}`, borderRadius: 8, padding: '9px 12px', lineHeight: 1.5, marginTop: 8 }}>
          Seducia drives your logged-in agent CLIs — no API key, no extra billing, it just rides your existing subscription. <strong style={{ color: accent }}>Auto</strong> tries claude first and rolls over to codex, then gemini when one is limited or missing. Manage logins and limit behaviour under <strong style={{ color: accent }}>Accounts</strong>.
        </div>
      </Row>

      <Row>
        <Label>Ask before Seducia acts</Label>
        <Segment
          accent={accent}
          value={settings.seduciaConfirm === false ? 'off' : 'on'}
          options={[['on', 'Ask first'], ['off', 'Act immediately']]}
          onChange={(v) => set('seduciaConfirm', v === 'on')}
        />
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5, marginTop: 8 }}>
          Seducia reads terminal output, which can contain text from the web or other people's repos. With this on, anything she wants to <strong style={{ color: 'var(--text-2)' }}>launch, run or close</strong> waits for your click, even when you asked for it, because her reply passes through a model. Turn this off if you trust everything she can read.
        </div>
      </Row>

      <Row>
        <Label>Custom agents</Label>
        <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 12 }}>
          {BUILTIN_AGENTS.length - 1} agent CLIs ship built in (Claude Code, Codex, Gemini, …).
          Add your own below — it appears in the launcher, Seducia can spawn it, and a
          resume command (if the CLI has one) lets restored sessions pick up where they left off.
        </div>
        {custom.map(a => (
          <div key={a.id} className="flex items-center sush-row-hover" style={{ gap: 10, padding: '7px 11px', borderRadius: 'var(--r-md)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 6 }}>
            <span className="flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: 7, background: rgba(a.color, 0.14), border: `1px solid ${rgba(a.color, 0.4)}`, color: a.color, fontSize: 10, fontWeight: 900, flexShrink: 0 }}>{a.mono}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-2)' }}>{a.label}</div>
              <div className="sush-mono" style={{ fontSize: 10, color: 'var(--text-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.command}{a.resumeCommand ? `  ·  resume: ${a.resumeCommand}` : ''}</div>
            </div>
            <button onClick={() => { removeCustomAgent(a.id); setCustom(loadCustomAgents()) }} title="Remove agent" style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 2px' }}>×</button>
          </div>
        ))}
        {locked ? (
          <div style={{ marginTop: custom.length ? 8 : 0 }}>
            <LockNote accent={accent}>
              Custom agents are a <strong style={{ color: accent }}>Plus</strong> feature.
              Redeem a code under <strong style={{ color: accent }}>Plan</strong> to add your own CLIs.
            </LockNote>
          </div>
        ) : (
          <div style={{ borderRadius: 'var(--r-lg)', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', padding: 12, marginTop: custom.length ? 8 : 0 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input placeholder="Name (e.g. Aider)" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} style={{ ...inputStyle, flex: '0 0 160px' }} />
              <input className="sush-mono" placeholder="Command (e.g. aider)" value={form.command} onChange={e => setForm({ ...form, command: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="sush-mono" placeholder="Resume command (optional, e.g. aider --restore)" value={form.resumeCommand} onChange={e => setForm({ ...form, resumeCommand: e.target.value })} style={inputStyle} />
              <button
                onClick={add}
                disabled={!form.label.trim() || !form.command.trim()}
                style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: form.label.trim() && form.command.trim() ? accent : 'var(--text-4)', background: rgba(accent, form.label.trim() && form.command.trim() ? 0.1 : 0.03), border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 999, padding: '6px 14px', cursor: 'pointer' }}
              >
                + Add agent
              </button>
            </div>
            {err && <div style={{ color: '#ff8aa0', fontSize: 11, fontWeight: 700, marginTop: 8 }}>{err}</div>}
          </div>
        )}
      </Row>
    </Section>
  )
}
