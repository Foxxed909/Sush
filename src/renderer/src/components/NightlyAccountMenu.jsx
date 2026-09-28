import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import NightlyAnchoredPopover from './NightlyAnchoredPopover'

function usageOf(slot) {
  const u = slot?.usage
  const values = [u?.sessionPct, u?.weekPct].filter(v => typeof v === 'number')
  return values.length ? Math.max(...values) : null
}

export default function NightlyAccountMenu({ provider, label, count = 0, accent, onSwitch }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(null)
  const anchorRef = useRef(null)

  useEffect(() => {
    if (!open || !provider || provider === 'shell') return
    let live = true
    window.sush?.accountsList?.()
      .then(r => { if (live && r?.ok) setState(r.providers?.[provider] || null) })
      .catch(() => {})
    return () => { live = false }
  }, [open, provider])

  if (!provider || provider === 'shell' || !label) return null
  const slots = state?.slots || []
  const activeId = state?.active

  return (
    <div className="nightly-account-menu">
      <button
        ref={anchorRef}
        className="nightly-chip nightly-account-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        title={count > 1 ? `${count} connected account slots` : 'Active CLI account'}
      >
        <Icon name="users" size={10} />
        {label}
        {count > 1 && <span className="nightly-account-count">{count}</span>}
        <Icon name="chevronDown" size={9} />
      </button>

      <NightlyAnchoredPopover
        open={open}
        anchorRef={anchorRef}
        align="center"
        className="nightly-account-popover"
        onClose={() => setOpen(false)}
      >
          <div className="nightly-account-popover-head">
            <span>Accounts</span>
            <small>{provider}</small>
          </div>
          {!slots.length && <div className="nightly-account-empty">No account slots found.</div>}
          {slots.map(slot => {
            const active = slot.id === activeId
            const usage = usageOf(slot)
            return (
              <button
                key={slot.id}
                disabled={active || busy === slot.id}
                onClick={async () => {
                  if (active || busy) return
                  setBusy(slot.id)
                  const r = await onSwitch?.(slot.id)
                  setBusy(null)
                  if (r?.ok !== false) setOpen(false)
                }}
                className={`nightly-account-row${active ? ' is-active' : ''}`}
              >
                <span className="nightly-account-dot" style={{ background: active ? accent : 'var(--text-5)' }} />
                <span className="nightly-account-copy">
                  <strong>{slot.label}</strong>
                  <small>
                    {active ? 'Active' : busy === slot.id ? 'Switching…' : slot.lastLimitAt ? 'Previously limited' : 'Available'}
                  </small>
                </span>
                {usage != null && (
                  <span
                    className={`nightly-account-usage${usage >= 80 ? ' is-high' : ''}`}
                    title={`Session ${slot.usage?.sessionPct ?? '—'}% · week ${slot.usage?.weekPct ?? '—'}%`}
                  >
                    {usage}%
                  </span>
                )}
                {active && <Icon name="check" size={12} color={accent} />}
              </button>
            )
          })}
          <div className="nightly-account-foot">
            Switching restarts this agent and resumes its conversation on the selected account.
          </div>
      </NightlyAnchoredPopover>
    </div>
  )
}
