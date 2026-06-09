import { useEffect, useRef, useState } from 'react'
import { classify, summarize } from '../lib/agentActivity'

// Mission Control's data layer.
//
// A single global subscription to the PTY data/exit streams feeds a per-tab
// ring of recent output (kept in a ref so byte traffic never triggers a React
// render). A low-frequency timer reclassifies every known session and only
// commits to state when something actually changed — so a swarm of busy agents
// costs one cheap pass per tick, not a render per byte.

const TAIL_CHARS = 700     // how much trailing output we keep per session
const TICK_MS = 700        // how often we reclassify

export function useAgentActivity(tabs) {
  const recordsRef = useRef(new Map())   // tabId -> { tail, lastDataAt, exited, exitCode, startedAt }
  const [states, setStates] = useState({})   // tabId -> stateId
  const tabIdsRef = useRef([])

  // Track the live tab ids so the tick can prune records for closed sessions.
  useEffect(() => {
    tabIdsRef.current = tabs.map(t => t.id)
    const live = new Set(tabIdsRef.current)
    const recs = recordsRef.current
    for (const id of recs.keys()) if (!live.has(id)) recs.delete(id)
    // Seed a record for any freshly-opened tab so it can show "Starting".
    const now = Date.now()
    for (const t of tabs) {
      if (!recs.has(t.id)) recs.set(t.id, { tail: '', lastDataAt: 0, exited: false, exitCode: 0, startedAt: now })
    }
  }, [tabs])

  // One subscription for the whole app, mounted once.
  useEffect(() => {
    const recs = recordsRef.current

    const ensure = (id) => {
      let rec = recs.get(id)
      if (!rec) { rec = { tail: '', lastDataAt: 0, exited: false, exitCode: 0, startedAt: Date.now() }; recs.set(id, rec) }
      return rec
    }

    const offData = window.sush.onPtyData(({ tabId, data }) => {
      if (!tabId || data == null) return
      const rec = ensure(tabId)
      rec.tail = (rec.tail + String(data)).slice(-TAIL_CHARS)
      rec.lastDataAt = Date.now()
      rec.exited = false
    })

    const offExit = window.sush.onPtyExit(({ tabId, exitCode }) => {
      if (!tabId) return
      const rec = ensure(tabId)
      rec.exited = true
      rec.exitCode = exitCode ?? 0
    })

    const timer = setInterval(() => {
      const now = Date.now()
      const next = {}
      let changed = false
      setStates(prev => {
        for (const id of tabIdsRef.current) {
          next[id] = classify(recs.get(id), now)
          if (prev[id] !== next[id]) changed = true
        }
        if (!changed && Object.keys(prev).length === Object.keys(next).length) return prev
        return next
      })
    }, TICK_MS)

    return () => { offData?.(); offExit?.(); clearInterval(timer) }
  }, [])

  return { states, summary: summarize(states) }
}
