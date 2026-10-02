import { useCallback, useEffect, useRef, useState } from 'react'
import { applyXpTick } from '../lib/officeStats'
import { threadKey } from '../lib/shellSidebar'
import { workspaceKey } from '../lib/workspaces'

const XP_KEY = 'sush-office-xp'

function loadLedger() {
  try {
    const value = JSON.parse(localStorage.getItem(XP_KEY) || '{}')
    return value && typeof value === 'object' ? { agents: value.agents || {}, offices: value.offices || {} } : { agents: {}, offices: {} }
  } catch {
    return { agents: {}, offices: {} }
  }
}

// XP accrues from what Sush observes whether or not the Office is open:
// state transitions as they happen, working minutes once a minute. Token XP is
// added by the Office while it reads Claude transcripts (awardTokens).
export function useOfficeProgress(tabs, states, limits) {
  const [ledger, setLedger] = useState(loadLedger)
  const prevRef = useRef({})
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const statesRef = useRef(states)
  statesRef.current = states

  const stateOf = useCallback((tab) => (limits?.[tab.id] ? 'limit' : tab.status === 'exited' ? 'error' : (statesRef.current?.[tab.id] || 'idle')), [limits])

  const apply = useCallback((ticks) => {
    if (!ticks.length) return
    setLedger(prev => {
      let next = prev
      for (const tick of ticks) next = applyXpTick(next, tick).ledger
      try { localStorage.setItem(XP_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  // Transitions (turn completed, recovered).
  useEffect(() => {
    const ticks = []
    for (const tab of tabs) {
      const state = stateOf(tab)
      const prevState = prevRef.current[tab.id]
      if (prevState && prevState !== state) ticks.push({ tabKey: threadKey(tab), officeKey: workspaceKey(tab), prevState, state })
      prevRef.current[tab.id] = state
    }
    apply(ticks)
  }, [tabs, states, limits, stateOf, apply])

  // Working minutes.
  useEffect(() => {
    const id = setInterval(() => {
      const ticks = tabsRef.current
        .filter(tab => stateOf(tab) === 'working')
        .map(tab => ({ tabKey: threadKey(tab), officeKey: workspaceKey(tab), prevState: 'working', state: 'working', minutes: 1 }))
      apply(ticks)
    }, 60_000)
    return () => clearInterval(id)
  }, [apply, stateOf])

  const awardTokens = useCallback((tab, outputTokens) => {
    if (!tab || outputTokens == null) return
    const state = stateOf(tab)
    apply([{ tabKey: threadKey(tab), officeKey: workspaceKey(tab), prevState: state, state, outputTokens }])
  }, [apply, stateOf])

  return { ledger, awardTokens }
}
