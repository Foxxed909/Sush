import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePolling } from './usePolling'

// One spawn-free data source for Nightly's title/composer chrome. It reads the
// same cached usage/account snapshot already used by Settings, so merely
// opening a workspace never launches provider CLIs or spends tokens.
export function useNightlyProviderMeta(activeTab, enabled = true) {
  const [snapshot, setSnapshot] = useState(null)
  const [claudeByCwd, setClaudeByCwd] = useState({})
  const panelCwdRef = useRef(new Map())

  const read = useCallback(async () => {
    try {
      const next = await window.sush?.usageSnapshot?.()
      if (next?.ok) setSnapshot(next)
    } catch {}
  }, [])

  usePolling(read, 15000, enabled)

  useEffect(() => {
    const off = window.sush?.onClaudePanelEvent?.((ev) => {
      if (!ev?.panelId || ev.panelId === '*') return
      if (ev.kind === 'init') {
        const cwd = String(ev.cwd || '').replace(/[\\/]+$/, '').toLowerCase()
        if (!cwd) return
        panelCwdRef.current.set(ev.panelId, cwd)
        setClaudeByCwd(prev => ({
          ...prev,
          [cwd]: {
            ...(prev[cwd] || {}),
            model: ev.model || prev[cwd]?.model || null,
            at: Date.now()
          }
        }))
        return
      }
      if (ev.kind === 'usage') {
        const cwd = panelCwdRef.current.get(ev.panelId)
        if (!cwd) return
        setClaudeByCwd(prev => ({
          ...prev,
          [cwd]: {
            ...(prev[cwd] || {}),
            contextTokens: Number.isFinite(ev.contextTokens) ? ev.contextTokens : prev[cwd]?.contextTokens ?? null,
            outputTokens: Number.isFinite(ev.outputTokens) ? ev.outputTokens : prev[cwd]?.outputTokens ?? null,
            at: Date.now()
          }
        }))
      }
    })
    return off
  }, [])

  return useMemo(() => {
    const provider = activeTab?.agentId
    const cwdKey = String(activeTab?.cwd || '').replace(/[\\/]+$/, '').toLowerCase()
    const streamMeta = provider === 'claude' && cwdKey ? claudeByCwd[cwdKey] : null
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
      model: streamMeta?.model || activeTab?.model || null,
      contextTokens: streamMeta?.contextTokens ?? null,
      lastLimitAt: account?.lastLimitAt || null
    }
  }, [snapshot, activeTab, claudeByCwd])
}
