import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePolling } from './usePolling'
import { threadCentered } from '../lib/shellModes'

// Structured Thread for one live session: polls main by tab id (main owns the
// transcript path) and merges hook-captured prompts Claude has not flushed yet.
// Shared by the side pane and the Nightly shell's centred transcript.
export function useThreadFeed(activeTab) {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const tabId = activeTab?.id
  const supported = !!tabId && threadCentered(activeTab)

  // Never show one session's transcript under another while the next read is
  // in flight.
  useEffect(() => { setState(null); setError('') }, [tabId])

  const read = useCallback(async () => {
    if (!supported) return
    try {
      const result = await window.sush?.threadRead?.({ tabId })
      if (!result?.ok) {
        setError(result?.error || 'Could not read structured Thread data.')
        return
      }
      setError('')
      setState(result)
    } catch (e) {
      setError(e?.message || 'Could not read structured Thread data.')
    }
  }, [tabId, supported])

  usePolling(read, 1200, supported)

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
