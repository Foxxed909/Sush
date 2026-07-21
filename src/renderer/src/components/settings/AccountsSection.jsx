import React, { useEffect, useState } from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { useOnline } from '../../hooks/useOnline'
import AccountConnect from '../AccountConnect'
import { Section, Row, Label, ago } from './primitives'

// The account switcher. One row per signed-in account, per CLI: "Account 1"
// is the identity's own login, extra accounts get their own isolated config
// dir. Adding one opens a session running that CLI so its normal browser
// sign-in (Google and friends) takes over — Sush never sees the credentials,
// it only points the CLI at the right slot. Provider Connect (OAuth, Plus+)
// lives at the bottom: it complements the slots with stored tokens.

// A thin usage bar (session / week %). Goes amber past 70%, red past 90% so a
// near-limit account reads at a glance.
function MiniBar({ label, pct, accent }) {
  const p = Math.max(0, Math.min(100, pct ?? 0))
  const col = p >= 90 ? '#ff7a8a' : p >= 70 ? '#ffb74d' : accent
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', width: 48, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 3, background: col, transform: `scaleX(${p / 100})`, transformOrigin: 'left', transition: 'transform 0.4s var(--ease-out)' }} />
      </div>
      <span style={{ fontSize: 9.5, fontWeight: 800, color: p >= 90 ? '#ff7a8a' : 'var(--text-2)', width: 30, textAlign: 'right' }}>{p}%</span>
    </div>
  )
}

function MiniSparkline({ history, accent }) {
  const values = (Array.isArray(history) ? history : [])
    .map(h => h.weekPct ?? h.sessionPct)
    .filter(v => typeof v === 'number' && isFinite(v))
    .slice(-18)
  if (values.length < 2) return null
  const width = 86
  const height = 22
  const step = width / Math.max(1, values.length - 1)
  const points = values.map((v, i) => {
    const y = height - Math.max(0, Math.min(100, v)) / 100 * (height - 4) - 2
    return `${Math.round(i * step)},${Math.round(y)}`
  }).join(' ')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 1 }}>
      <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-4)', width: 48, textTransform: 'uppercase', letterSpacing: 0.4 }}>Trend</span>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        <polyline points={points} fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: 9, color: 'var(--text-5)', fontWeight: 700 }}>{values.length}</span>
    </div>
  )
}

// Per-account usage readout under a slot row. Shows the session/week bars when
// a provider reported utilization numbers; otherwise falls back to the bounded
// CLI health result, without misrepresenting configuration as a quota figure.
function SlotUsage({ usage, history, accent }) {
  if (!usage) return null
  const hasBars = usage.sessionPct != null || usage.weekPct != null
  const resetTxt = usage.resetsAt ? new Date(usage.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
  return (
    <div style={{ padding: '1px 13px 9px 24px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {hasBars ? (
        <>
          {usage.sessionPct != null && <MiniBar label="Session" pct={usage.sessionPct} accent={accent} />}
          {usage.weekPct != null && <MiniBar label="Week" pct={usage.weekPct} accent={accent} />}
        </>
      ) : usage.kind === 'health' ? (
        <div style={{ fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: usage.healthy ?? usage.signedIn ? '#5fd3a8' : '#ff7a8a', flexShrink: 0 }} />
          <span style={{ color: usage.healthy ?? usage.signedIn ? 'var(--text-2)' : '#ff9aa8' }}>{usage.status}</span>
          {usage.note && <span style={{ color: 'var(--text-4)', fontWeight: 600 }}>· {usage.note}</span>}
          {usage.detail && <span style={{ color: 'var(--text-4)', fontWeight: 600 }} title={usage.detail}>· {usage.detail.slice(0, 80)}</span>}
        </div>
      ) : (
        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700 }}>
          {usage.status === 'allowed' ? 'Within limits' : `Status: ${(usage.status || 'unknown').replace(/_/g, ' ')}`}
          {resetTxt ? ` · resets ${resetTxt}` : ''}
        </div>
      )}
      <MiniSparkline history={history} accent={accent} />
      <div style={{ fontSize: 9, color: 'var(--text-5)', fontWeight: 600 }}>updated {ago(usage.at) || 'just now'}</div>
    </div>
  )
}

export default function AccountsSection({ accent }) {
  const online = useOnline()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [usageBusy, setUsageBusy] = useState({})   // `${provider}:${slotId}` -> bool

  useEffect(() => {
    window.sush.accountsList?.().then(r => { if (r?.ok) setData(r.providers) }).catch(() => {})
  }, [])

  // On-demand provider read for one account slot. It is never auto-polled: the
  // provider only launches after the user explicitly asks to check it.
  const readUsage = async (provider, slotId, options = {}) => {
    const key = `${provider}:${slotId}`
    setUsageBusy(b => ({ ...b, [key]: true }))
    setErr('')
    const r = await window.sush.accountsUsageRead?.({ provider, slotId, ...options })
    if (r?.ok) setData(r.providers)
    else if (r?.error) setErr(r.error)
    setUsageBusy(b => ({ ...b, [key]: false }))
  }

  const setPolicy = (provider, policy) => call(() => window.sush.accountsSetPolicy({ provider, policy }))

  const call = async (fn) => {
    setBusy(true)
    setErr('')
    const r = await fn()
    if (r?.ok) setData(r.providers)
    // Every failure is shown — a swallowed 'no-user' here let "+ Add account"
    // fail invisibly and the user think the slot feature was a no-op.
    else setErr(r?.error === 'no-user' ? 'No Sush profile is signed in - sign in first.' : (r?.error || 'Something went wrong'))
    setBusy(false)
  }

  const providers = [
    ['claude', 'Claude', 'Claude Pro / Max subscription'],
    ['codex', 'Codex', 'ChatGPT subscription'],
    ['gemini', 'Gemini', 'Google account'],
    ['opencode', 'OpenCode', 'any provider']
  ]
  const slotName = (slot, i) => slot.id === 'default' && slot.label === 'Default' ? 'Account 1' : (slot.label || `Account ${i + 1}`)
  const limitAgo = (slot) => {
    if (!slot.lastLimitAt) return null
    const h = (Date.now() - slot.lastLimitAt) / 3600000
    if (h > 12) return null
    return h < 1 ? 'limit hit <1h ago' : `limit hit ${Math.round(h)}h ago`
  }
  const [editing, setEditing] = useState(null)  // { provider, slotId, value }
  const commitRename = () => {
    const e = editing
    setEditing(null)
    if (!e || !e.value.trim()) return
    call(() => window.sush.accountsRename?.({ provider: e.provider, slotId: e.slotId, label: e.value.trim() }))
  }

  return (
    <Section id="Accounts" icon="users" label="Accounts" accent={accent}>
      <Row>
      <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 14 }}>
        Each account is a separate CLI login. Add a second one and Sush can hop
        over when the first hits its session limit. Sign-in happens in the
        CLI's own browser flow (Google sign-in supported) — Sush never sees
        your credentials.
      </div>
      {!data && (
        <div className="flex items-center" style={{ gap: 8, color: 'var(--text-4)', fontSize: 11.5, fontWeight: 700, padding: '6px 0 14px' }}>
          <span className="sush-spinner" style={{ width: 13, height: 13 }} />
          Loading accounts…
        </div>
      )}
      {data && providers.map(([p, label, sub]) => {
        const st = data[p] || { active: 'default', slots: [] }
        return (
          <div key={p} style={{ marginBottom: 14, borderRadius: 'var(--r-lg)', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
            <div className="flex items-center" style={{ gap: 9, padding: '10px 13px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-2)' }}>{label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 1 }}>{sub}</div>
              </div>
              <button
                onClick={() => call(async () => {
                  const r = await window.sush.accountsAdd({ provider: p })
                  // Hand the user straight to the sign-in: the new slot is
                  // already active, so a fresh session of this CLI prompts
                  // its own login flow (browser OAuth) — no manual steps.
                  if (r?.ok) window.dispatchEvent(new CustomEvent('sush:open-login-session', { detail: { provider: p } }))
                  return r
                })}
                disabled={busy}
                className="sush-mini-btn"
                style={{ fontSize: 10.5, fontWeight: 800, color: accent, background: rgba(accent, 0.08), border: `1px solid ${rgba(accent, 0.28)}`, borderRadius: 999, padding: '4px 12px', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
              >
                + Add account
              </button>
            </div>
            {st.slots.map((slot, i) => {
              const on = st.active === slot.id
              const isEditing = editing && editing.provider === p && editing.slotId === slot.id
              const uKey = `${p}:${slot.id}`
              return (
                <div key={slot.id} className="sush-row-hover">
                  <div className="flex items-center" style={{ gap: 10, padding: '8px 13px' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: on ? '#5fd3a8' : 'rgba(255,255,255,0.16)', boxShadow: on ? '0 0 7px rgba(95,211,168,0.6)' : 'none' }} />
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editing.value}
                        onChange={e2 => setEditing({ ...editing, value: e2.target.value })}
                        onBlur={commitRename}
                        onKeyDown={e2 => { if (e2.key === 'Enter') commitRename(); if (e2.key === 'Escape') setEditing(null) }}
                        style={{ flex: 1, background: 'var(--surface-2)', border: `1px solid ${rgba(accent, 0.4)}`, borderRadius: 6, color: 'var(--text-2)', fontSize: 12, fontWeight: 700, padding: '2px 7px', outline: 'none' }}
                      />
                    ) : (
                      <span
                        title="Double-click to rename"
                        onDoubleClick={() => setEditing({ provider: p, slotId: slot.id, value: slotName(slot, i) })}
                        style={{ flex: 1, fontSize: 12, fontWeight: 700, color: on ? 'var(--text-2)' : 'var(--text-3)', cursor: 'text' }}
                      >
                        {slotName(slot, i)}
                        {limitAgo(slot) && <span style={{ marginLeft: 8, fontSize: 9.5, fontWeight: 800, color: '#ffb74d' }}>{limitAgo(slot)}</span>}
                      </span>
                    )}
                    {on ? (
                      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, color: '#5fd3a8' }}>ACTIVE</span>
                    ) : (
                      <button
                        onClick={() => call(() => window.sush.accountsSwitch({ provider: p, slotId: slot.id }))}
                        disabled={busy}
                        style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-2)', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 999, padding: '3px 11px', cursor: 'pointer' }}
                      >
                        Switch
                      </button>
                    )}
                    {!isEditing && (
                      <button
                        onClick={() => readUsage(p, slot.id, p === 'codex' ? { doctor: true } : {})}
                        disabled={usageBusy[uKey] || ((p === 'claude' || p === 'codex') && !online)}
                        title={p === 'claude' ? 'Check Claude quota' : p === 'codex' ? (online ? 'Run Codex health check' : 'Codex health check waits for network') : `Check ${label} CLI health`}
                        className="flex items-center justify-center"
                        style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: ((p === 'claude' || p === 'codex') && !online) ? 'default' : 'pointer', padding: '0 2px', flexShrink: 0, opacity: ((p === 'claude' || p === 'codex') && !online) ? 0.45 : 1 }}
                        onMouseEnter={e => { e.currentTarget.style.color = accent }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)' }}
                      >
                        {usageBusy[uKey] ? <span className="sush-spinner" style={{ width: 11, height: 11 }} /> : <Icon name="refresh" size={12} strokeWidth={2.2} />}
                      </button>
                    )}
                    {!isEditing && (
                      <button
                        onClick={() => setEditing({ provider: p, slotId: slot.id, value: slotName(slot, i) })}
                        disabled={busy}
                        title="Rename this account"
                        className="flex items-center justify-center"
                        style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.color = accent }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)' }}
                      >
                        <Icon name="edit" size={12} strokeWidth={2.2} />
                      </button>
                    )}
                    {slot.id !== 'default' && (
                      <button onClick={() => call(() => window.sush.accountsRemove({ provider: p, slotId: slot.id }))} disabled={busy} title="Remove this account" style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', padding: '0 2px', fontSize: 13, lineHeight: 1 }}>
                        ×
                      </button>
                    )}
                  </div>
                  {slot.usage && <SlotUsage usage={slot.usage} history={slot.usageHistory} accent={accent} />}
                </div>
              )
            })}
            {st.slots.length >= 2 && (
              <div style={{ padding: '4px 13px 11px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: 'var(--text-3)', textTransform: 'uppercase', margin: '8px 0 6px' }}>When this CLI hits its limit</div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[['never', 'Never'], ['ask', 'Ask me'], ['auto', 'Auto switch']].map(([val, lbl]) => {
                    const on2 = (st.limitPolicy || 'ask') === val
                    return (
                      <button
                        key={val}
                        onClick={() => setPolicy(p, val)}
                        disabled={busy}
                        style={{ flex: 1, padding: '6px 0', borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: on2 ? accent : 'var(--surface-2)', color: on2 ? '#0a0a0a' : 'var(--text-3)', border: `1px solid ${on2 ? accent : 'var(--border-2)'}` }}
                      >
                        {lbl}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {err && <div style={{ color: '#ff8aa0', fontSize: 11, fontWeight: 700, marginTop: 4 }}>{err}</div>}
      </Row>

      {/* Provider Connect (Plus+) — OAuth tokens as first-class accounts. */}
      <Row>
        <Label>Connect provider accounts (OAuth)</Label>
        <AccountConnect accent={accent} />
      </Row>
    </Section>
  )
}
