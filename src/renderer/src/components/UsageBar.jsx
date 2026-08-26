import React, { useEffect, useState, useCallback } from 'react'
import { rgba } from '../lib/ui'

// Compact pool usage bar. Shows how much capacity remains across all account
// slots for one provider (e.g. 6 Codex Free accounts feel like one big pool).
// Reads from the cheap accounts list / pool stats — never spawns a CLI.

const barColor = (pct) => {
  if (pct == null) return 'var(--text-4)'
  if (pct >= 50) return '#5fd3a8'
  if (pct >= 20) return '#ffcb6b'
  return '#ff5370'
}

export default function UsageBar({
  provider = 'claude',
  accent,
  compact = true,
  showLabel = true,
  style = {}
}) {
  const [pool, setPool] = useState(null)

  const pull = useCallback(async () => {
    try {
      const r = await window.sush?.accountsPoolStats?.({ provider })
      if (r?.ok) setPool(r)
      else {
        // Fallback: derive a rough view from accounts-list if pool IPC not ready.
        const list = await window.sush?.accountsList?.()
        const st = list?.providers?.[provider]
        if (!st) return
        const slots = st.slots || []
        let totalRem = 0
        let known = 0
        for (const s of slots) {
          const u = s.usage
          if (!u) continue
          const used = Math.max(u.sessionPct ?? 0, u.weekPct ?? 0)
          if (typeof used === 'number') {
            totalRem += Math.max(0, 100 - used)
            known += 1
          }
        }
        setPool({
          ok: true,
          slotCount: slots.length,
          healthyCount: slots.length,
          poolPct: known > 0 ? Math.min(100, Math.round(totalRem / slots.length)) : null,
          avgRemaining: known > 0 ? Math.round(totalRem / known) : null,
          label: provider
        })
      }
    } catch {}
  }, [provider])

  useEffect(() => {
    pull()
    const id = setInterval(pull, 60000)
    return () => clearInterval(id)
  }, [pull])

  if (!pool || pool.slotCount < 1) return null

  const pct = pool.poolPct ?? pool.avgRemaining
  const color = barColor(pct)
  const title = `${pool.label || provider}: ${pool.slotCount} account${pool.slotCount === 1 ? '' : 's'} · ${pool.healthyCount} healthy${pct != null ? ` · ~${pct}% pool remaining` : ''}`

  if (compact) {
    return (
      <span
        title={title}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: '100%',
          padding: '0 8px',
          fontSize: 10.5,
          fontWeight: 700,
          color: 'var(--text-3)',
          ...style
        }}
      >
        {showLabel && (
          <span style={{ textTransform: 'uppercase', letterSpacing: 0.4, fontSize: 9.5 }}>
            {provider === 'claude' ? 'Claude' : provider === 'codex' ? 'Codex' : provider}
          </span>
        )}
        <span
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: pct != null ? `${Math.max(4, pct)}%` : '0%',
              background: color,
              borderRadius: 2,
              transition: 'width 0.35s ease'
            }}
          />
        </span>
        {pool.slotCount > 1 && (
          <span style={{ color: 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>
            {pool.healthyCount}/{pool.slotCount}
          </span>
        )}
      </span>
    )
  }

  // Expanded card (for Settings)
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.02)',
        ...style
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, fontWeight: 700 }}>
        <span style={{ color: 'var(--text-2)' }}>{pool.label || provider}</span>
        <span style={{ color }}>{pct != null ? `${pct}% pool` : '—'}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: pct != null ? `${Math.max(3, pct)}%` : '0%',
            background: color,
            borderRadius: 3,
            transition: 'width 0.35s ease',
            boxShadow: pct != null && pct < 20 ? `0 0 8px ${rgba(color, 0.5)}` : 'none'
          }}
        />
      </div>
      <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--text-4)' }}>
        {pool.slotCount} account{pool.slotCount === 1 ? '' : 's'} · {pool.healthyCount} healthy
        {pool.limitPolicy === 'auto' && ' · auto-switch on'}
      </div>
    </div>
  )
}
