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
  const dismissedRef = useRef(false)              // user dismissed this trip; holds until stand-down
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
      // Hysteresis: only stand down once clearly below the line, so a value
      // hovering at the threshold doesn't flap the guard on and off. The
      // stand-down also re-arms a dismissed guard — "dismiss" holds for the
      // whole trip, not just until the next 45s poll.
      if (pct < thresholdPct - 5) {
        handledRef.current.clear()
        dismissedRef.current = false
      }
      setTrip(prev => {
        if (pct >= thresholdPct) {
          if (dismissedRef.current) return prev   // dismissed: stay quiet this trip
          return prev ? { ...prev, pct } : { pct }
        }
        if (prev && pct < thresholdPct - 5) return null
        return prev
      })
    } catch {}
  }, [thresholdPct])
  usePolling(poll, 45000, enabled)

  useEffect(() => {
    if (!enabled) { setTrip(null); handledRef.current.clear(); dismissedRef.current = false }
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

  return {
    trip,
    // Dismissing marks the whole trip as handled, so the pill/notification
    // can't come back 45 seconds later while utilization is still high.
    dismiss: useCallback(() => { dismissedRef.current = true; setTrip(null) }, []),
    blocked: !!trip && mode === 'block'
  }
}
