import React, { useCallback, useState } from 'react'
import Icon from './Icons'
import { usePolling } from '../hooks/usePolling'

// What the classic status bar used to say and Nightly stopped saying: the
// machine is offline, rendering is being throttled (and why), the battery is
// draining. Renders nothing while everything is normal, so the rail stays
// quiet; CPU/memory are opt-in (Settings > System) because polling has a cost.

const MODE = {
  eco: { label: 'Eco', title: 'Eco mode: fewest features, most battery. Settings > Power to change.' },
  saver: { label: 'Saver', title: 'Power saver is on. Ctrl+Shift+E toggles it.' },
  quiet: { label: 'Quiet hours', title: 'Power saver is on for quiet hours.' },
  battery: { label: 'Low battery', title: 'Power saver switched on automatically because the battery is low.' }
}

function Stats() {
  const [stats, setStats] = useState(null)
  const read = useCallback(() => {
    window.sush?.getSystemStatsLite?.()
      .then(s => { if (s && !s.error) setStats(s) })
      .catch(() => {})
  }, [])
  usePolling(read, 5000)
  const cpu = stats ? Math.round(stats.cpu?.load ?? 0) : null
  const mem = stats?.memory?.total ? Math.round((stats.memory.used / stats.memory.total) * 100) : null
  if (cpu == null && mem == null) return null
  const hot = v => (v >= 85 ? 'is-hot' : v >= 60 ? 'is-warm' : '')
  return (
    <>
      <span className={`nightly-status-item ${hot(cpu)}`} title="CPU load"><Icon name="cpu" size={12} />{cpu ?? '—'}%</span>
      <span className={`nightly-status-item ${hot(mem)}`} title="Memory used"><Icon name="activity" size={12} />{mem ?? '—'}%</span>
    </>
  )
}

export default function NightlyStatusStrip({ online = true, saverReason = null, battery = null, showStats = false }) {
  const onBattery = battery?.hasBattery && !battery.charging
  const items = []
  if (!online) {
    items.push(
      <span key="offline" className="nightly-status-item is-warn" title="Network polls are paused until the connection comes back.">
        <Icon name="wifi" size={12} />Offline
      </span>
    )
  }
  if (saverReason && MODE[saverReason]) {
    items.push(
      <span key="mode" className="nightly-status-item is-ok" title={MODE[saverReason].title}>
        <Icon name="leaf" size={12} />{MODE[saverReason].label}
      </span>
    )
  }
  if (onBattery) {
    const low = battery.percent <= 15
    items.push(
      <span key="battery" className={`nightly-status-item${low ? ' is-hot' : battery.percent <= 30 ? ' is-warm' : ''}`} title={`Battery ${battery.percent}%, not charging`}>
        <Icon name="battery" size={13} />{battery.percent}%
      </span>
    )
  }
  if (!items.length && !showStats) return null
  return (
    <div className="nightly-status" role="status" aria-label="System status">
      {items}
      {showStats && <Stats />}
    </div>
  )
}
