import { useEffect, useState } from 'react'

// Battery level + charge state for the auto power-saver. Deliberately polled
// SLOWLY — battery % barely moves minute to minute, and this user is on a weak
// laptop with no grid power, so we don't want a tight timer of our own draining
// the very thing we're watching. main pushes a `power-changed` event the instant
// the charger goes in/out, so the slow poll is just a safety net.
const POLL_MS = 90_000        // 1.5 min
const POLL_MS_SAVER = 180_000 // 3 min once we're already conserving

export function useBattery({ saver = false } = {}) {
  const [bat, setBat] = useState({ hasBattery: false, percent: 100, charging: true })

  useEffect(() => {
    let alive = true
    const poll = async () => {
      const r = await window.sush?.batteryStatus?.().catch(() => null)
      if (alive && r) setBat({ hasBattery: !!r.hasBattery, percent: r.percent ?? 100, charging: !!r.charging })
    }
    poll()
    const id = setInterval(poll, saver ? POLL_MS_SAVER : POLL_MS)
    const off = window.sush?.onPowerChanged?.(poll) // re-read immediately on plug/unplug
    const onVis = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; clearInterval(id); off?.(); document.removeEventListener('visibilitychange', onVis) }
  }, [saver])

  return bat
}
