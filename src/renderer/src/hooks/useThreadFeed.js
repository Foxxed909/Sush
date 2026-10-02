import { useCallback, useEffect, useMemo, useState } from 'react'
import { refreshThreadFeed, subscribeThreadFeed } from '../lib/threadFeedStore'
import { threadCentered } from '../lib/shellModes'

// Structured Thread for one live session: polls main by tab id (main owns the
// transcript path) and merges hook-captured prompts Claude has not flushed yet.
// Shared by the side pane and the Nightly shell's centred transcript.
export function useThreadFeed(activeTab) {
  const tabId = activeTab?.id
  const supported = !!tabId && threadCentered(activeTab)
  const [snapshot, setSnapshot] = useState({ state: null, error: '', tabId: null })

  useEffect(() => {
    // Never show one session's transcript under another: reset, then only
    // accept snapshots for the tab this effect subscribed to.
    setSnapshot({ state: null, error: '', tabId })
    if (!supported) return undefined
    return subscribeThreadFeed(tabId, next => setSnapshot({ ...next, tabId }))
  }, [tabId, supported])

  const current = snapshot.tabId === tabId ? snapshot : { state: null, error: '' }
  const state = current.state
  const error = current.error
  const read = useCallback(() => refreshThreadFeed(tabId), [tabId])

  const items = useMemo(() => {
    const persisted = Array.isArray(state?.items) ? state.items : []
    const hooks = Array.isArray(state?.hookPrompts) ? state.hookPrompts : []
    if (!hooks.length) return persisted

    // UserPromptSubmit can arrive before Claude flushes the corresponding user
    // record. Compare occurrence counts rather than a Set so repeated prompts
    // such as "continue" remain truthful.
    const persistedCounts = new Map()
    for (const item of persisted) {
      if (item?.type !== 'user') continue
      const key = String(item.text || '')
      persistedCounts.set(key, (persistedCounts.get(key) || 0) + 1)
    }

    const seenHooks = new Map()
    const live = []
    hooks.forEach((prompt, index) => {
      const key = String(prompt?.text || '')
      if (!key) return
      const nth = (seenHooks.get(key) || 0) + 1
      seenHooks.set(key, nth)
      if (nth <= (persistedCounts.get(key) || 0)) return
      live.push({
        id: `hook-prompt-${index}`,
        type: 'user',
        text: key,
        live: true
      })
    })
    return [...persisted, ...live]
  }, [state])

  return { state, error, items, read, supported }
}
