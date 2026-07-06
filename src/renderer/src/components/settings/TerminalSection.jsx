import React from 'react'
import { Section, Row, Label, Hint, Segment, Toggle, inputStyle } from './primitives'

// Terminal — how sessions render and behave. Session behavior (history
// restore, agent resume, the per-session resource meter) moved here from
// Appearance/Usage: they're terminal concerns, not looks.

const FONTS = ["'Cascadia Code'", "'Fira Code'", "Consolas", "'JetBrains Mono'", "'Courier New'"]
const CURSORS = ['block', 'bar', 'underline']

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
    </Section>
  )
}
