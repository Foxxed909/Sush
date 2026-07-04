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

const ORDER = ['free', 'plus', 'pro', 'ultra', 'max']

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
  // Which card is dealt to the front of the fan — defaults to your tier.
  const [active, setActive] = useState(ORDER.includes(tier) ? tier : 'plus')
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

        {/* The deck — all five plans fanned like a hand of cards. The front
            card is fully dealt (complete feature list); the rest peek out
            behind it, each showing its name + price on the exposed corner.
            Click a card to bring it forward. */}
        {tiers && (
          <div className="sush-fan" style={{ position: 'relative', height: 470, marginTop: 6 }}>
            {(() => {
              // Front card at the left, the rest fanned to the right in tier
              // order, rotated around a shared bottom-left pivot.
              const rest = ORDER.filter(t => t !== active)
              const deck = [active, ...rest]
              return deck.map((t, i) => {
                const m = TIER_META[t]
                const f = tiers[t]
                if (!f) return null
                const front = i === 0
                const current = t === tier
                return (
                  <div
                    key={t}
                    className="sush-fan-card"
                    onClick={() => setActive(t)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(t) } }}
                    aria-pressed={front}
                    style={{
                      position: 'absolute', top: 0, left: 0,
                      width: 300, height: 430,
                      transformOrigin: '20% 130%',
                      '--fan-pose': front ? 'rotate(0deg)' : `translateX(${72 + i * 96}px) rotate(${i * 5.5}deg)`,
                      '--tier-glow': rgba(m.color, 0.28),
                      zIndex: 10 - i,
                      cursor: front ? 'default' : 'pointer',
                      display: 'flex', flexDirection: 'column',
                      borderRadius: 18, padding: '18px 17px 16px',
                      border: `1px solid ${front ? rgba(m.color, 0.65) : rgba(m.color, 0.42)}`,
                      background: `radial-gradient(130% 55% at 50% 0%, ${rgba(m.color, front ? 0.20 : 0.13)}, transparent 62%), ${front ? '#101114' : 'var(--surface-1)'}`,
                      boxShadow: front ? `0 18px 44px rgba(0,0,0,0.5), 0 0 26px ${rgba(m.color, 0.14)}, 0 0 0 1px ${rgba(m.color, 0.14)}` : '0 10px 26px rgba(0,0,0,0.42)'
                    }}
                  >
                    {/* Exposed corner: name + price sit on whichever corner the
                        fan actually reveals — left on the dealt card, right on
                        the peeking ones. */}
                    <div className="flex items-center" style={{ gap: 8, justifyContent: front ? 'flex-start' : 'flex-end' }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: m.color }}>{m.label}</span>
                      {current && <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.7, textTransform: 'uppercase', color: '#05070b', background: m.color, borderRadius: 999, padding: '2px 8px' }}>Your plan</span>}
                      {!current && m.popular && front && <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.7, textTransform: 'uppercase', color: '#05070b', background: m.color, borderRadius: 999, padding: '2px 8px' }}>Popular</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 6, justifyContent: front ? 'flex-start' : 'flex-end' }}>
                      <span style={{ fontSize: 27, fontWeight: 900, color: m.color, lineHeight: 1, letterSpacing: '-0.02em' }}>{m.price}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>{m.unit}</span>
                    </div>
                    {/* Full details only on the dealt card — the fan stays calm. */}
                    {front ? (
                      <>
                        <div style={{ fontSize: 11.5, color: 'var(--text-2)', margin: '9px 0 0', lineHeight: 1.5 }}>{m.blurb}</div>
                        <div style={{ height: 1, background: 'var(--border-1)', margin: '13px 0' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8.5, flex: 1 }}>
                          {FEATURES.map(([name, fn]) => (
                            <FeatureLine key={name} name={name} value={fn(f, t)} color={m.color} />
                          ))}
                        </div>
                        {current && t !== 'free' ? (
                          <button onClick={e => { e.stopPropagation(); revert() }} style={{ marginTop: 12, width: '100%', fontSize: 11, fontWeight: 800, color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 999, padding: '8px 0', cursor: 'pointer' }}>
                            Revert to Free
                          </button>
                        ) : current ? (
                          <div style={{ marginTop: 12, textAlign: 'center', fontSize: 10.5, fontWeight: 800, color: 'var(--text-4)', padding: '8px 0' }}>You're here</div>
                        ) : (
                          <div style={{ marginTop: 12, textAlign: 'center', fontSize: 10, fontWeight: 800, color: m.color, letterSpacing: 0.4, textTransform: 'uppercase', padding: '8px 0', borderRadius: 999, background: rgba(m.color, 0.09), border: `1px solid ${rgba(m.color, 0.28)}` }}>
                            Unlocks with a code
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-end' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--text-2)', lineHeight: 1.45, textAlign: 'right', maxWidth: 190 }}>{m.blurb}</div>
                        <div style={{ height: 1, width: 120, background: rgba(m.color, 0.3), margin: '3px 0' }} />
                        {[
                          [String(f.slots), f.slots === 1 ? 'account per CLI' : 'accounts per CLI'],
                          [String(f.gridCap), 'grid sessions'],
                          [`${CREDIT_MINUTES[t]}m`, 'dictation / mo'],
                          ...(f.usageGuard ? [[f.autoHandoff ? 'Guard+' : 'Guard', f.autoHandoff ? 'auto-handoff' : 'usage guard']] : [])
                        ].map(([v, l]) => (
                          <div key={l} style={{ fontSize: 11, textAlign: 'right' }}>
                            <span style={{ color: m.color, fontWeight: 900 }}>{v}</span>
                            <span style={{ color: 'var(--text-3)', fontWeight: 600 }}> {l}</span>
                          </div>
                        ))}
                        <div style={{ fontSize: 9.5, color: 'var(--text-4)', fontWeight: 700, marginTop: 4, letterSpacing: 0.4, textTransform: 'uppercase' }}>Click to compare</div>
                      </div>
                    )}
                  </div>
                )
              })
            })()}
          </div>
        )}

        {/* Redeem */}
        <div style={{ marginTop: 34, borderTop: '1px solid var(--border-1)', paddingTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div className="flex items-center" style={{ gap: 10, marginBottom: 12, justifyContent: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: 'var(--text-3)' }}>OR</span>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-2)' }}>Enter a Sush code</span>
          </div>
          <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 520 }}>
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
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 12, lineHeight: 1.6, maxWidth: '58ch', textAlign: 'center' }}>
            A code flips the tier locally and works forever offline. Don't have one? Ask the dev.
          </p>
        </div>
      </div>
    </div>
  )
}
