import React from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { PERF_MODES, perfModeOf, withPerfMode, isFeather, withFeather } from '../../lib/power'
import { Section, Row, Label, Hint, Toggle, Segment } from './primitives'

// Power — everything battery/CPU shaped in one place. The headline is the
// performance-mode LADDER: four rungs where each includes everything below
// it, replacing the old flat pile of eco/saver/lite toggles whose hierarchy
// only existed in code. Schedules (auto-saver, quiet hours, idle sleep) stay
// separate rows — they're triggers, not rendering levels.

const MODE_META = {
  full:    { label: 'Full',    icon: 'sparkles', blurb: 'Everything on — glass, glow, ambient motion. For desktops and full batteries.' },
  reduced: { label: 'Reduced', icon: 'activity', blurb: 'Drops the frosted-glass blur and ambient glows. A big GPU saver with no feature loss.' },
  saver:   { label: 'Saver',   icon: 'leaf',     blurb: 'Reduced, plus every animation frozen and background polling slowed. Ctrl+Shift+E toggles this anywhere.' },
  eco:     { label: 'Eco',     icon: 'leaf',     blurb: 'Saver, plus the Seducia orb hidden, wallpaper-through-terminals off, and agent notifications muted. Terminals and agents keep running.' }
}

const SLEEP_MINUTES = [0, 5, 10, 20, 30]

export default function PowerSection({ accent, settings, set, onChange }) {
  const mode = perfModeOf(settings)
  const feather = isFeather(settings)
  // Picking a rung by hand ends Feather first, so the choice sticks instead
  // of being silently owned by the preset.
  const setMode = (m) => onChange(withPerfMode(feather ? withFeather(settings, false) : settings, m))

  return (
    <Section id="Power" icon="leaf" label="Power" accent={accent}>
      <Row>
        <Label>Feather mode</Label>
        <Toggle
          accent={accent}
          icon="feather"
          on={feather}
          onText="On — eco rendering, no motion, solid window"
          offText="Off — your own ladder and appearance apply"
          onClick={() => onChange(withFeather(settings, !feather))}
        />
        <Hint>The whole light profile in one switch: Eco mode plus reduced motion and a solid window material. Turning it off puts back exactly what you had before.</Hint>
      </Row>

      <Row>
        <Label>Performance mode</Label>
        {/* The ladder: rungs light up cumulatively so "Saver includes Reduced"
            is visible, not documentation. */}
        <Segment
          accent={accent}
          value={mode}
          onChange={setMode}
          options={PERF_MODES.map(m => [m, MODE_META[m].label])}
        />
        <Hint><strong style={{ color: 'var(--text-2)', fontWeight: 600 }}>{MODE_META[mode].label}:</strong> {MODE_META[mode].blurb}</Hint>
        <Hint>Each mode includes everything to its left. Battery, quiet hours, and focus mode can raise the level temporarily; your choice here is the floor.</Hint>
      </Row>

      <Row>
        <Label>Auto saver on low battery</Label>
        <Toggle
          accent={accent}
          icon="leaf"
          on={settings.autoPowerSaver !== false}
          onText="On — Saver kicks in under 20% on battery"
          offText="Off — only the ladder above applies"
          onClick={() => set('autoPowerSaver', settings.autoPowerSaver === false)}
        />
        <Hint>When you’re unplugged and the battery drops below 20%, Sush steps up to Saver on its own, then steps back once you charge.</Hint>
      </Row>

      <Row>
        <Label>Quiet hours / scheduled sleep</Label>
        <Toggle
          accent={accent}
          icon="clock"
          on={settings.quietHoursEnabled === true}
          onText="On — sleep and Saver during quiet hours"
          offText="Off — no scheduled sleep"
          onClick={() => set('quietHoursEnabled', settings.quietHoursEnabled !== true)}
        />
        {settings.quietHoursEnabled === true && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <input type="time" value={settings.quietHoursStart || '22:00'} onChange={e => set('quietHoursStart', e.target.value)} style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)', borderRadius: 8, padding: '7px 10px', fontSize: 12 }} />
            <span style={{ color: 'var(--text-4)', fontSize: 11, fontWeight: 800 }}>to</span>
            <input type="time" value={settings.quietHoursEnd || '07:00'} onChange={e => set('quietHoursEnd', e.target.value)} style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)', borderRadius: 8, padding: '7px 10px', fontSize: 12 }} />
          </div>
        )}
        <Hint>During quiet hours Sush sleeps once you go idle and renders in Saver. PTYs and agents keep running untouched.</Hint>
      </Row>

      <Row>
        <Label>Sleep after inactivity</Label>
        <Segment
          accent={accent}
          value={settings.idleSleepMinutes ?? 10}
          onChange={mins => set('idleSleepMinutes', mins)}
          options={SLEEP_MINUTES.map(mins => [mins, mins === 0 ? 'Off' : `${mins} min`])}
        />
        <Hint>No input for this long and Sush dims, freezes animations, and stops every poll — terminals and agents keep running. Any key or click wakes it.</Hint>
      </Row>
    </Section>
  )
}
