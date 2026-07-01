import React, { useEffect, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

// The pricing page — a full page of its own (opened from Settings ▸ Plan, the
// palette, or any upgrade hint), not a section buried in the Settings scroll.
//
// Structure is deliberate: the three core plans read as a ladder; Ultra and
// Max sit below as one wide "performance" band with a different shape, so the
// page is a hierarchy, not five identical cards. Accent is restrained — tier
// color marks each plan's identity, the pink accent only marks actions.

export const TIER_META = {
  free:  { label: 'Free',  price: '$0',  unit: 'forever',  color: '#9aa2ad', blurb: 'The essentials, no code needed.' },
  plus:  { label: 'Plus',  price: '$8',  unit: '/ month',  color: '#5ab0ff', blurb: 'Multi-account work + cloud voice.', popular: true },
  pro:   { label: 'Pro',   price: '$16', unit: '/ month',  color: '#c08bff', blurb: 'Bigger grid + the Usage Guard.' },
  ultra: { label: 'Ultra', price: '$29', unit: '/ month',  color: '#ffb454', blurb: 'Standing swarms, hands-free handoff.' },
  max:   { label: 'Max',   price: '$49', unit: '/ month',  color: '#ff6b81', blurb: 'Everything Sush can do, maxed.' }
}

// Mirror of main/credits.js TIER_ALLOWANCE_SEC so the cards and the real
// meter never disagree.
export const CREDIT_MINUTES = { free: 5, plus: 60, pro: 150, ultra: 600, max: 1500 }

const CORE = ['free', 'plus', 'pro']
const PERFORMANCE = ['ultra', 'max']

const FEATURES = [
  ['Accounts per CLI', t => String(t.slots)],
  ['Grid sessions', t => String(t.gridCap)],
  ['Quiet Credits', (t, name) => `${CREDIT_MINUTES[name] ?? 5}m / mo`],
  ['Custom agents', t => t.customAgents],
  ['Cloud voices', t => t.cloudTts],
  ['Usage Guard', t => !!t.usageGuard],
  ['Auto-handoff', t => !!t.autoHandoff]
]

function FeatureLine({ name, value, color }) {
  const bool = typeof value === 'boolean'
  const off = bool && !value
  return (
    <div className="flex items-center" style={{ gap: 8, fontSize: 12 }}>
      <Icon name={off ? 'x' : 'check'} size={12} strokeWidth={2.4} color={off ? 'var(--text-5)' : color} />
      <span style={{ color: off ? 'var(--text-4)' : 'var(--text-2)', flex: 1 }}>{name}</span>
      {!bool && <span style={{ color: 'var(--text-1)', fontWeight: 700 }}>{value}</span>}
    </div>
  )
}

function PlanBadge({ text, color }) {
  return (
    <span style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', fontSize: 9, fontWeight: 900, letterSpacing: 0.8, textTransform: 'uppercase', color: '#05070b', background: color, borderRadius: 999, padding: '3px 11px', whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

export default function PlansPage({ accent, ent, onDismiss }) {
  const tier = ent.tier || 'free'
  const tiers = ent.tiers && Object.keys(ent.tiers).length ? ent.tiers : null
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') { e.preventDefault(); onDismiss() } }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onDismiss])

  const redeem = async () => {
    const c = code.trim()
    if (!c || busy) return
    setBusy(true); setMsg(null)
    const r = await ent.redeem(c)
    setBusy(false)
    if (r?.ok) { setMsg({ ok: true, text: `Unlocked ${TIER_META[r.tier]?.label || r.tier}. Enjoy.` }); setCode('') }
    else setMsg({ ok: false, text: r?.error || 'Could not redeem that code.' })
  }
  const revert = async () => { await ent.clear(); setMsg({ ok: true, text: 'Reverted to Free.' }); setCode('') }

  return (
    <div className="sush-page-in sush-scroll" style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'var(--surface-0)', overflowY: 'auto' }}>
      {/* Header */}
      <div className="flex items-center" style={{ gap: 12, padding: '16px 26px', position: 'sticky', top: 0, zIndex: 2, background: 'rgba(8,9,10,0.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--border-1)' }}>
        <span className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 10, background: rgba(accent, 0.12), border: `1px solid ${rgba(accent, 0.35)}`, color: accent }}>
          <Icon name="star" size={16} strokeWidth={2} />
        </span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>Plans</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Offline unlocks — no account, no payment rails, no tracking</div>
        </div>
        <button
          onClick={onDismiss}
          className="flex items-center"
          style={{ marginLeft: 'auto', gap: 7, fontSize: 12, fontWeight: 800, color: 'var(--text-2)', background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 999, padding: '7px 15px', cursor: 'pointer' }}
        >
          <Icon name="x" size={13} strokeWidth={2.2} /> Close
        </button>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '38px 26px 60px' }}>
        {/* Lede */}
        <h1 style={{ fontSize: 30, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em', lineHeight: 1.15, textWrap: 'balance', margin: 0 }}>
          One terminal. Your whole crew.
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.65, maxWidth: '58ch', margin: '10px 0 30px' }}>
          Every plan runs the same Sush — offline, private, yours. Bigger plans carry more
          agent accounts, more grid, more dictation minutes, and the quota tools that keep
          long-running swarms alive.
        </p>

        {/* Core ladder */}
        {tiers && (
          <div className="sush-plan-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {CORE.map(t => {
              const m = TIER_META[t]
              const f = tiers[t]
              if (!f) return null
              const current = t === tier
              return (
                <div
                  key={t}
                  className="sush-plan-card"
                  style={{
                    position: 'relative', display: 'flex', flexDirection: 'column',
                    borderRadius: 16, padding: '20px 17px 17px',
                    border: `1px solid ${current ? rgba(m.color, 0.55) : 'var(--border-2)'}`,
                    background: current ? rgba(m.color, 0.07) : 'var(--surface-1)',
                    boxShadow: current ? `0 12px 32px ${rgba(m.color, 0.14)}` : 'none'
                  }}
                >
                  {current ? <PlanBadge text="Your plan" color={m.color} />
                    : m.popular ? <PlanBadge text="Popular" color={m.color} /> : null}
                  <div style={{ fontSize: 13, fontWeight: 900, color: m.color }}>{m.label}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 7 }}>
                    <span style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1, letterSpacing: '-0.02em' }}>{m.price}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>{m.unit}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-2)', margin: '8px 0 0', lineHeight: 1.5, minHeight: 34 }}>{m.blurb}</div>
                  <div style={{ height: 1, background: 'var(--border-1)', margin: '13px 0' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    {FEATURES.map(([name, fn]) => (
                      <FeatureLine key={name} name={name} value={fn(f, t)} color={m.color} />
                    ))}
                  </div>
                  {current && t !== 'free' && (
                    <button onClick={revert} style={{ marginTop: 14, width: '100%', fontSize: 11, fontWeight: 800, color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 999, padding: '8px 0', cursor: 'pointer' }}>
                      Revert to Free
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Performance band — a different shape on purpose: these are not more
            cards in the wall, they're the ceiling for people running swarms
            all day. */}
        {tiers && (
          <div style={{ marginTop: 26 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-2)', marginBottom: 10 }}>
              For standing swarms
              <span style={{ color: 'var(--text-3)', fontWeight: 600 }}> — agents running all day, every day</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {PERFORMANCE.map(t => {
                const m = TIER_META[t]
                const f = tiers[t]
                if (!f) return null
                const current = t === tier
                return (
                  <div
                    key={t}
                    className="flex items-center sush-plan-card"
                    style={{
                      gap: 18, flexWrap: 'wrap', padding: '16px 18px', borderRadius: 14,
                      border: `1px solid ${current ? rgba(m.color, 0.55) : 'var(--border-2)'}`,
                      background: current ? rgba(m.color, 0.07) : 'var(--surface-1)'
                    }}
                  >
                    <div style={{ minWidth: 120 }}>
                      <div className="flex items-center" style={{ gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 900, color: m.color }}>{m.label}</span>
                        {current && <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.8, textTransform: 'uppercase', color: '#05070b', background: m.color, borderRadius: 999, padding: '2px 8px' }}>Your plan</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 3 }}>
                        <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1 }}>{m.price}</span>
                        <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700 }}>{m.unit}</span>
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 220, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>
                      <strong style={{ color: 'var(--text-1)' }}>{f.slots} accounts</strong> per CLI · <strong style={{ color: 'var(--text-1)' }}>{f.gridCap}</strong>-tile grid · <strong style={{ color: 'var(--text-1)' }}>{CREDIT_MINUTES[t]}m</strong> dictation
                      <span style={{ color: 'var(--text-3)' }}> — plus Usage Guard with hands-free auto-handoff.</span>
                    </div>
                    {current && (
                      <button onClick={revert} style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 999, padding: '7px 14px', cursor: 'pointer' }}>
                        Revert to Free
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Redeem */}
        <div style={{ marginTop: 34, borderTop: '1px solid var(--border-1)', paddingTop: 22 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-2)', marginBottom: 9 }}>Have an unlock code?</div>
          <div style={{ display: 'flex', gap: 8, maxWidth: 520 }}>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') redeem() }}
              placeholder="SUSH-PLUS-XXXXXXXX-XXXXXXXXXX"
              spellCheck={false}
              className="sush-mono"
              style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, outline: 'none', letterSpacing: 0.5 }}
            />
            <button
              onClick={redeem}
              disabled={!code.trim() || busy}
              style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color: code.trim() && !busy ? '#0a0a0a' : 'var(--text-4)', background: code.trim() && !busy ? accent : 'var(--surface-2)', border: `1px solid ${rgba(accent, 0.4)}`, borderRadius: 999, padding: '0 20px', cursor: code.trim() && !busy ? 'pointer' : 'default' }}
            >
              {busy ? '…' : 'Redeem'}
            </button>
          </div>
          {msg && <div style={{ marginTop: 9, fontSize: 11.5, fontWeight: 700, color: msg.ok ? '#7fd6a0' : '#ff8aa0' }}>{msg.text}</div>}
          {ent.expiry && (
            <div style={{ marginTop: 9, fontSize: 11.5, fontWeight: 700, color: TIER_META[tier]?.color }}>
              Your {TIER_META[tier]?.label} code is a trial — it reverts to Free when it expires.
            </div>
          )}
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 12, lineHeight: 1.6, maxWidth: '58ch' }}>
            A code flips the tier locally and works forever offline. Don't have one? Ask the dev.
          </p>
        </div>
      </div>
    </div>
  )
}
