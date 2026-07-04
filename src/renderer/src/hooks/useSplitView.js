import { useState, useCallback, useEffect } from 'react'

// 2-up split: the active session plus one partner, side by side (Ctrl+\).
// Extracted from App so the shell keeps one job; App renders the pair through
// the same keyed grid wrappers so neither terminal remounts on toggle.
export function useSplitView({ tabs, tabsRef, mruRef, activeIdRef, setBootedIds, setView }) {
  const [splitId, setSplitId] = useState(null)

  // Toggling on picks the most-recently-used other session; toggling off
  // returns to the single-terminal view. The partner boots if it was a lazy
  // rail entry.
  const toggleSplit = useCallback(() => {
    setSplitId(prev => {
      if (prev) return null
      const activeNow = activeIdRef.current
      const partner = mruRef.current.find(id => id !== activeNow && tabsRef.current.some(t => t.id === id))
        || tabsRef.current.find(t => t.id !== activeNow)?.id
      if (!partner) return null
      setBootedIds(b => b.has(partner) ? b : new Set(b).add(partner))
      setView('terminal')
      return partner
    })
  }, [tabsRef, mruRef, activeIdRef, setBootedIds, setView])

  // Drop the split when its partner closes.
  useEffect(() => {
    if (splitId && !tabs.some(t => t.id === splitId)) setSplitId(null)
  }, [tabs, splitId])

  return { splitId, setSplitId, toggleSplit }
}
