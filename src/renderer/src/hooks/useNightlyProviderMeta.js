import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePolling } from './usePolling'

// One spawn-free data source for Nightly's title/composer chrome. It reads the
// same cached usage/account snapshot already used by Settings, so merely
// opening a workspace never launches provider CLIs or spends tokens.
export function useNightlyProviderMeta(activeTab, enabled = true) {
  const [snapshot, setSnapshot] = useState(null)

  const read = useCallback(async () => {
    try {
      const next = await window.sush?.usageSnapshot?.()
      if (next?.ok) setSnapshot(next)
    } catch {}
  }, [])

  usePolling(read, 15000, enabled)

  // A session/provider change is user-visible state, so do not wait for the
  // background polling cadence to refresh account/usage chrome. This also
  // makes account rotation update immediately after the replacement tab opens.
  useEffect(() => {
    if (!enabled || !activeTab?.id) return
    read()
  }, [enabled, activeTab?.id, activeTab?.agentId, read])

  return useMemo(() => {
    const provider = activeTab?.agentId
    if (!provider || provider === 'shell') {
      return {
        provider: provider || 'shell',
        installed: true,
        accountLabel: null,
        accountCount: 0,
        sessionPct: null,
        weekPct: null,
        usagePct: null,
        model: activeTab?.model || null,
        effort: activeTab?.effort || null,
        contextTokens: null
      }
    }

    const state = snapshot?.[provider] || null
    const account = state?.account || null
    const cached = account?.usage || null
    const claudeLimits = provider === 'claude' ? state?.limits?.limits : null
    const sessionPct = typeof claudeLimits?.sessionPct === 'number'
      ? claudeLimits.sessionPct
      : (typeof cached?.sessionPct === 'number' ? cached.sessionPct : null)
    const weekPct = typeof claudeLimits?.weekPct === 'number'
      ? claudeLimits.weekPct
      : (typeof cached?.weekPct === 'number' ? cached.weekPct : null)
    const known = [sessionPct, weekPct].filter(v => typeof v === 'number')

    return {
      provider,
      installed: state?.installed !== false,
      accountLabel: account?.label || null,
      accountCount: account?.count || 0,
      sessionPct,
      weekPct,
      usagePct: known.length ? Math.max(...known) : null,
      model: activeTab?.model || null,
      effort: activeTab?.effort || null,
      contextTokens: null,
      lastLimitAt: account?.lastLimitAt || null
    }
  }, [snapshot, activeTab])
}
