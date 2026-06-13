import { useEffect, useRef, useState } from 'react'
import { classify, summarize, detectLimit } from '../lib/agentActivity'

// Mission Control's data layer.
//
// A single global subscription to the PTY data/exit streams feeds a per-tab
// ring of recent output (kept in a ref so byte traffic never triggers a React
// render). A low-frequency timer reclassifies every known session and only
// commits to state when something actually changed — so a swarm of busy agents
// costs one cheap pass per tick, not a render per byte.

const TAIL_CHARS = 700     // how much trailing output we keep per session
const TICK_MS = 700        // how often we reclassify
const NOTIFY_COOLDOWN_MS = 30000   // don't re-notify the same session this often

export function useAgentActivity(tabs, { notify = false } = {}) {
  const recordsRef = useRef(new Map())   // tabId -> { tail, lastDataAt, exited, exitCode, startedAt }
  const [states, setStates] = useState({})   // tabId -> stateId
  const [limits, setLimits] = useState({})   // tabId -> true when a limit-hit is detected
  const tabIdsRef = useRef([])
  const labelsRef = useRef({})           // tabId -> label, for notifications
  const prevStatesRef = useRef({})
  const lastNotifyRef = useRef({})       // tabId -> ts of last notification
  const notifyRef = useRef(notify)
  notifyRef.current = notify

  // Track the live tab ids so the tick can prune records for closed sessions.
  useEffect(() => {
    tabIdsRef.current = tabs.map(t => t.id)
    labelsRef.current = Object.fromEntries(tabs.map(t => [t.id, t.label]))
    const live = new Set(tabIdsRef.current)
    const recs = recordsRef.current
    for (const id of recs.keys()) if (!live.has(id)) recs.delete(id)
    // Seed a record for any freshly-opened tab so it can show "Starting".
    // isAgent gates the "Needs you"/error sniffing — plain shells skip it so an
    // idle prompt never reads as needing attention. Refresh it on every tabs
    // change so a session that gains/loses an agent stays correctly classified.
    const now = Date.now()
    for (const t of tabs) {
      const isAgent = !!t.agentId && t.agentId !== 'shell'
      const rec = recs.get(t.id)
      if (!rec) recs.set(t.id, { tail: '', lastDataAt: 0, exited: false, exitCode: 0, startedAt: now, isAgent })
      else rec.isAgent = isAgent
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

    // Fire an OS notification when a session needs you / errored / finished
    // while the window is unfocused. Throttled per session so a flapping state
    // can't spam. Gated by the `notify` setting (read via ref so this
    // mounted-once effect always sees the current value).
    const maybeNotify = (id, from, to, now) => {
      if (!notifyRef.current || document.hasFocus()) return
      const interesting = to === 'waiting' || to === 'error' || to === 'done'
      if (!interesting || from === to || from === undefined) return
      // 'done'/'error' only matter coming out of an active state.
      if ((to === 'done' || to === 'error') && from !== 'working' && from !== 'booting') return
      if (now - (lastNotifyRef.current[id] ?? 0) < NOTIFY_COOLDOWN_MS) return
      lastNotifyRef.current[id] = now
      const label = labelsRef.current[id] || 'A session'
      const msg = to === 'waiting' ? 'needs your input' : to === 'error' ? 'hit an error' : 'finished'
      try { new Notification('Sush — agent update', { body: `${label} ${msg}.`, silent: true }) } catch {}
    }

    const timer = setInterval(() => {
      const now = Date.now()
      const nextStates = {}
      const nextLimits = {}
      let statesChanged = false
      const prev = prevStatesRef.current

      for (const id of tabIdsRef.current) {
        const rec = recs.get(id)
        const st = classify(rec, now)
        nextStates[id] = st
        // A limit only counts once the session has settled — the message stays
        // in the tail, and an actively-streaming agent isn't actually blocked.
        if (st !== 'working' && st !== 'booting' && rec && detectLimit(rec.tail)) nextLimits[id] = true
        if (prev[id] !== st) { statesChanged = true; maybeNotify(id, prev[id], st, now) }
      }
      prevStatesRef.current = nextStates

      setStates(prevS => {
        if (!statesChanged && Object.keys(prevS).length === Object.keys(nextStates).length) return prevS
        return nextStates
      })
      setLimits(prevL => {
        const keys = Object.keys(nextLimits)
        const changed = keys.length !== Object.keys(prevL).length || keys.some(k => !prevL[k])
        return changed ? nextLimits : prevL
      })
    }, TICK_MS)

    return () => { offData?.(); offExit?.(); clearInterval(timer) }
  }, [])

  return { states, limits, summary: summarize(states) }
}
