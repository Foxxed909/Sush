import React from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { Section, Row, Label, Hint, Toggle } from './primitives'

// System — the app's relationship with your machine: tray, notifications,
// and the .sushrc profile.

export default function SystemSection({ accent, settings, set, onEditSushrc }) {
  return (
    <Section id="System" icon="layers" label="System" accent={accent}>
      <Row>
        <Label>Minimize to tray</Label>
        <Toggle
          accent={accent}
          on={!!settings.minimizeToTray}
          onText="On — minimize hides Sush into the tray"
          offText="Off — minimize goes to the taskbar"
          onClick={() => set('minimizeToTray', !settings.minimizeToTray)}
          fullWidth={false}
        />
        <Hint>When on, the minimize dot tucks Sush into the system tray. Click the tray icon to bring it back.</Hint>
      </Row>

      <Row>
        <Label>Agent notifications</Label>
        <Toggle
          accent={accent}
          icon="activity"
          on={settings.agentNotifications !== false}
          onText="Notify when an agent needs you / finishes"
          offText="Agent notifications off"
          onClick={() => set('agentNotifications', settings.agentNotifications === false)}
        />
        <Hint>A desktop notification when a session needs input, errors, or finishes while Sush is in the background. Never fires while the window is focused.</Hint>
      </Row>

      <Row>
        <Label>Suggest aliases from habits</Label>
        <Toggle
          accent={accent}
          icon="sparkles"
          on={settings.autoAlias !== false}
          onText="Offering aliases for repeated commands"
          offText="Alias suggestions off"
          onClick={() => set('autoAlias', settings.autoAlias === false)}
        />
        <Hint>Run a command ~15× and Sush offers to save it as a short alias in your .sushrc. Nothing is written until you accept.</Hint>
      </Row>

      <Row>
        <Label>.sushrc — aliases, env, startup</Label>
        <button
          onClick={() => onEditSushrc?.()}
          className="sush-btn"
          style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 9, background: 'var(--surface-2)', border: `1px solid ${rgba(accent, 0.3)}`, color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, width: '100%' }}
        >
          <Icon name="fileText" size={14} color={accent} strokeWidth={2} />
          Edit .sushrc profile
          <Icon name="arrowRight" size={13} color="var(--text-4)" style={{ marginLeft: 'auto' }} />
        </button>
      </Row>
    </Section>
  )
}
