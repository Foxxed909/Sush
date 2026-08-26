import React, { useEffect, useState, useCallback, useRef } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

// Account pool capacity. Default chrome is a quiet circle; click opens a
// popover: total remaining (sum across slots, e.g. 4 × 100% → 400%) plus
// one row per account. Settings uses variant="panel" for the same content
// always expanded. Never spawns a CLI — pool IPC or accounts-list only.

const STATE = {
  ok: '#5fd3a8',
  warn: '#ffcb6b',
  low: '#ff6b81',
  muted: 'var(--text-4)'
}

const barColor = (pct) => {
  if (pct == null) return STATE.muted
  if (pct >= 50) return STATE.ok
  if (pct >= 20) return STATE.warn
  return STATE.low
}

function providerLabel(provider) {
  if (provider === 'claude') return 'Claude'
  if (provider === 'codex') return 'Codex'
  if (provider === 'gemini') return 'Gemini'
  if (provider === 'opencode') return 'OpenCode'
  return provider
}

function derivePoolFromList(list, provider) {
  const st = list?.providers?.[provider]
  if (!st) return null
  const slots = st.slots || []
  let totalRem = 0
  let known = 0
  const details = []
  for (const s of slots) {
    const u = s.usage
    let rem = null
    if (u) {
      const used = Math.max(u.sessionPct ?? 0, u.weekPct ?? 0)
      if (typeof used === 'number') {
        rem = Math.max(0, 100 - used)
        totalRem += rem
        known += 1
      }
    }
    details.push({
      id: s.id,
      label: s.label || s.id,
      remainingPct: rem,
      active: s.id === st.active,
      healthy: rem == null ? true : rem > 5
    })
  }
  return {
    ok: true,
    slotCount: slots.length,
    healthyCount: details.filter(d => d.healthy).length,
    knownCount: known,
    poolTotalPct: known > 0 ? Math.round(totalRem) : null,
    poolPct: known > 0 ? Math.min(100, Math.round(totalRem / slots.length)) : null,
    avgRemaining: known > 0 ? Math.round(totalRem / known) : null,
    label: providerLabel(provider),
    slots: details,
    limitPolicy: st.limitPolicy
  }
}

function PoolBreakdown({ pool, accent }) {
  if (!pool || pool.slotCount < 1) {
    return (
      <div style={{ fontSize: 11, color: 'var(--text-4)', lineHeight: 1.5 }}>
        No account slots yet. Add logins in Settings ▸ Accounts.
      </div>
    )
  }

  const total = pool.poolTotalPct
  const slots = pool.slots || []

  return (
    <div style={{ minWidth: 220 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-2)', letterSpacing: 0.2 }}>
          {pool.slotCount} account{pool.slotCount === 1 ? '' : 's'}
        </div>
        <div style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: total != null ? barColor(pool.avgRemaining) : 'var(--text-3)' }}>
          {total != null ? `${total}%` : '—'}
        </div>
      </div>
      <div style={{ height: 1, background: 'var(--border-1)', marginBottom: 8 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {slots.map((s, i) => {
          const rem = s.remainingPct
          const color = barColor(rem)
          return (
            <div
              key={s.id || i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 11.5,
                color: 'var(--text-2)'
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: s.active ? (accent || 'var(--accent)') : (s.healthy ? STATE.ok : STATE.warn),
                  boxShadow: s.active ? `0 0 6px ${rgba(accent || '#ff6b9d', 0.45)}` : 'none'
                }}
              />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: s.active ? 800 : 600 }}>
                {s.label || `Account ${i + 1}`}
                {s.active ? <span style={{ color: 'var(--text-4)', fontWeight: 600 }}> · active</span> : null}
              </span>
              <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', color, minWidth: 36, textAlign: 'right' }}>
                {rem != null ? `~${Math.round(rem)}` : '—'}
              </span>
            </div>
          )
        })}
      </div>
      {pool.limitPolicy === 'auto' && (
        <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-4)' }}>Auto-switch on</div>
      )}
    </div>
  )
}

/** Fetch pool for one or all default providers. */
function usePoolData(providers) {
  const list = Array.isArray(providers) ? providers : [providers || 'claude']
  const [pools, setPools] = useState({})

  const pull = useCallback(async () => {
    const next = {}
    for (const provider of list) {
      try {
        const r = await window.sush?.accountsPoolStats?.({ provider })
        if (r?.ok) {
          next[provider] = r
          continue
        }
        const accounts = await window.sush?.accountsList?.()
        const derived = derivePoolFromList(accounts, provider)
        if (derived) next[provider] = derived
      } catch {}
    }
    setPools(next)
  }, [list.join(',')])

  useEffect(() => {
    pull()
    const id = setInterval(pull, 60000)
    return () => clearInterval(id)
  }, [pull])

  return { pools, refresh: pull }
}

/**
 * variant:
 *  - "icon" (default): circle in the status strip; click toggles popover
 *  - "panel": always-expanded breakdown (Settings)
 *  - "provider-panel": single-provider expanded card
 */
export default function UsageBar({
  provider,
  providers,
  accent,
  variant = 'icon',
  style = {}
}) {
  const providerList = providers || (provider ? [provider] : ['claude', 'codex'])
  const { pools } = usePoolData(providerList)
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const anySlots = providerList.some(p => (pools[p]?.slotCount || 0) > 0)
  const worstAvg = providerList.reduce((acc, p) => {
    const a = pools[p]?.avgRemaining
    if (a == null) return acc
    return acc == null ? a : Math.min(acc, a)
  }, null)
  const ringColor = barColor(worstAvg)

  if (variant === 'provider-panel' || variant === 'panel') {
    const single = provider || providerList[0]
    const pool = pools[single]
    if (!pool || pool.slotCount < 1) return null
    return (
      <div
        style={{
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid var(--border-2)',
          background: 'var(--surface-2)',
          ...style
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {pool.label || providerLabel(single)}
        </div>
        <PoolBreakdown pool={pool} accent={accent} />
      </div>
    )
  }

  // Icon control — hide entirely when no slots exist for any listed provider.
  if (!anySlots) return null

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', height: '100%', ...style }}>
      <button
        type="button"
        className="sush-press"
        aria-label="Account usage pool"
        aria-expanded={open}
        title="Account usage"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: `1.5px solid ${open ? (accent || 'var(--accent)') : ringColor}`,
          background: open ? rgba(accent || '#ff6b9d', 0.12) : 'transparent',
          color: open ? (accent || 'var(--accent)') : ringColor,
          cursor: 'pointer',
          padding: 0,
          boxShadow: open ? `0 0 0 2px ${rgba(accent || '#ff6b9d', 0.15)}` : 'none'
        }}
      >
        <Icon name="activity" size={11} strokeWidth={2.2} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Account usage pool"
          className="sush-pop"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            right: 0,
            zIndex: 400,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid var(--border-2)',
            background: 'var(--surface-3)',
            boxShadow: 'var(--shadow-float)',
            maxWidth: 320,
            maxHeight: 360,
            overflowY: 'auto'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {providerList.map(p => {
              const pool = pools[p]
              if (!pool || pool.slotCount < 1) return null
              return (
                <div key={p}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                    {pool.label || providerLabel(p)}
                  </div>
                  <PoolBreakdown pool={pool} accent={accent} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
