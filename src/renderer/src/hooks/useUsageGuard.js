import { useState, useRef, useCallback, useEffect } from 'react'
import { usePolling } from './usePolling'

// Usage Guard (Pro+): watch Claude's utilization from the PASSIVE rate-limit
// snapshot (no probe spawned, no tokens spent) and act at the user's
// threshold. Extracted from App so the shell keeps one job.
//
// Modes: 'warn' (notify + pill), 'handoff' (also hand each live Claude session
// to the next model, once per trip, via onHandoff), 'block' (the caller drops
// keystrokes to Claude sessions while `blocked`).
export function useUsageGuard({ enabled, thresholdPct, mode, tabsRef, onHandoff }) {
  const [trip, setTrip] = useState(null)          // { pct } while tripped
  const handledRef = useRef(new Set())            // sessions handed off this trip
  const modeRef = useRef(mode)
  modeRef.current = mode
  const onHandoffRef = useRef(onHandoff)
  onHandoffRef.current = onHandoff

  const poll = useCallback(async () => {
    try {
      const r = await window.sush.claudeLimitsGet?.()
      const lim = r?.limits
      const pct = Math.max(lim?.sessionPct ?? -1, lim?.weekPct ?? -1)
      if (pct < 0) return
      setTrip(prev => {
        if (pct >= thresholdPct) return prev ? { ...prev, pct } : { pct }
        // Hysteresis: only stand down once clearly below the line, so a value
        // hovering at the threshold doesn't flap the guard on and off.
        if (prev && pct < thresholdPct - 5) { handledRef.current.clear(); return null }
        return prev
      })
    } catch {}
  }, [thresholdPct])
  usePolling(poll, 45000, enabled)

  useEffect(() => {
    if (!enabled) { setTrip(null); handledRef.current.clear() }
  }, [enabled])

  // Trip actions: one notification per trip; hands-free mode hands off each
  // live Claude session exactly once per trip.
  useEffect(() => {
    if (!trip) return
    try { new Notification('Sush — Usage Guard', { body: `Claude is at ${trip.pct}% of its window (threshold ${thresholdPct}%).`, silent: true }) } catch {}
    if (modeRef.current !== 'handoff') return
    const targets = tabsRef.current.filter(t => t.agentId === 'claude' && t.status !== 'exited' && !handledRef.current.has(t.id))
    targets.forEach(t => {
      handledRef.current.add(t.id)
      onHandoffRef.current?.(t.id)
    })
    // Deliberately only on trip start — re-polls refresh pct without re-firing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!trip])

  return { trip, dismiss: useCallback(() => setTrip(null), []), blocked: !!trip && mode === 'block' }
}
