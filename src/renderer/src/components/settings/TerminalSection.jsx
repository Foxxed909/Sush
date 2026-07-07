import React from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { Section, Row, Label, Hint, Segment, Toggle, inputStyle } from './primitives'
import { TAB_GROUPS, DEFAULT_HIDDEN_TABS } from '../../lib/panelTabs'

// Terminal — how sessions render and behave. Session behavior (history
// restore, agent resume, the per-session resource meter) moved here from
// Appearance/Usage: they're terminal concerns, not looks. The right-panel
// tab visibility also lives here — every ornament gets an off-switch.

const FONTS = ["'Cascadia Code'", "'Fira Code'", "Consolas", "'JetBrains Mono'", "'Courier New'"]
const CURSORS = ['block', 'bar', 'underline']

// Right-panel tab chooser: tap a chip to show/hide that tab in the sidebar
// strip. Agent stays mandatory (it's the panel's whole point). Stored as a
// hidden-list so new tabs Sush ships appear by default.
function PanelTabChooser({ accent, settings, set }) {
  const hidden = new Set(Array.isArray(settings.hiddenPanelTabs) ? settings.hiddenPanelTabs : DEFAULT_HIDDEN_TABS)
  const toggle = (id) => {
    const next = new Set(hidden)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    set('hiddenPanelTabs', [...next])
  }
  return (
    <Row>
      <Label>Sidebar tabs</Label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {TAB_GROUPS.map(g => (
          <div key={g.id}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.8, color: 'var(--text-5)', textTransform: 'uppercase', marginBottom: 5 }}>{g.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {g.tabs.map(t => {
                const on = !hidden.has(t.id)
                const locked = t.id === 'agent'
                return (
                  <button
                    key={t.id}
                    onClick={() => { if (!locked) toggle(t.id) }}
                    disabled={locked}
                    title={locked ? 'Agent is always shown' : on ? 'Visible — click to hide' : 'Hidden — click to show'}
                    className="flex items-center"
                    style={{ gap: 6, padding: '5px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: locked ? 'default' : 'pointer', background: on ? rgba(accent, 0.12) : 'var(--surface-2)', color: on ? accent : 'var(--text-4)', border: `1px solid ${on ? rgba(accent, 0.4) : 'var(--border-2)'}`, opacity: locked ? 0.7 : 1 }}
                  >
                    <Icon name={t.icon} size={12} strokeWidth={2} />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <Hint>Hide tools you don’t use so the sidebar strip stays short. History and Snippets are hidden by default — they live in the command palette (Ctrl+P).</Hint>
    </Row>
  )
}

export default function TerminalSection({ accent, settings, set }) {
  return (
    <Section id="Terminal" icon="terminal" label="Terminal" accent={accent}>
      <Row>
        <Label>Font size</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="range" min={8} max={28} value={settings.fontSize ?? 14} onChange={e => set('fontSize', Number(e.target.value))} style={{ flex: 1, accentColor: accent }} />
          <span style={{ color: 'var(--text-2)', fontSize: 12, width: 24, textAlign: 'right', fontWeight: 700 }}>{settings.fontSize ?? 14}</span>
        </div>
      </Row>
      <Row>
        <Label>Font family</Label>
        <select value={settings.fontFamily ?? FONTS[0]} onChange={e => set('fontFamily', e.target.value)} style={inputStyle}>
          {FONTS.map(f => <option key={f} value={f}>{f.replace(/'/g, '')}</option>)}
        </select>
      </Row>
      <Row>
        <Label>Cursor style</Label>
        <Segment
          accent={accent}
          value={settings.cursorStyle ?? 'block'}
          options={CURSORS.map(c => [c, c])}
          onChange={(c) => set('cursorStyle', c)}
        />
      </Row>
      <Row>
        <Label>Restore session history</Label>
        <Toggle
          accent={accent}
          icon="clock"
          on={settings.persistScrollback !== false}
          onText="Replaying recent output on reopen"
          offText="History restore off"
          onClick={() => set('persistScrollback', settings.persistScrollback === false)}
        />
      </Row>
      <Row>
        <Label>Resume agent sessions on launch</Label>
        <Toggle
          accent={accent}
          icon="terminal"
          on={settings.resumeAgents !== false}
          onText="Re-launching agents (claude --continue, …)"
          offText="Restored tabs open a bare shell"
          onClick={() => set('resumeAgents', settings.resumeAgents === false)}
        />
        <Hint>When on, a restored Claude/Codex tab re-runs its CLI in resume mode so the previous conversation continues. Applies on next launch.</Hint>
      </Row>
      <Row>
        <Label>Per-session resource meter</Label>
        <Toggle
          accent={accent}
          icon="cpu"
          on={settings.sessionResourceMeter === true}
          onText="On — Mission Control shows CPU/RAM per session"
          offText="Off — no per-process scan"
          onClick={() => set('sessionResourceMeter', settings.sessionResourceMeter !== true)}
        />
        <Hint>Opt-in because it reads the process table. Power saver and focus mode turn it off automatically.</Hint>
      </Row>
      <PanelTabChooser accent={accent} settings={settings} set={set} />
    </Section>
  )
}
