import React, { useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'
import { PLANS, PLAN_ORDER, FEATURE_ROWS, getPlan, savePlan } from '../lib/plan'

function Check({ yes, val, fmt }) {
  if (fmt) return <span style={{ fontSize: 11.5, fontWeight: 700, color: '#cdd5dc' }}>{fmt(val)}</span>
  return yes
    ? <Icon name="check" size={14} color="#7ee787" strokeWidth={2.8} />
    : <span style={{ color: '#3f4852', fontSize: 16, lineHeight: 1 }}>—</span>
}

export default function PlansModal({ accent, currentPlan, onSelect, onClose }) {
  const [hovered, setHovered] = useState(null)
  const plans = PLAN_ORDER.map(id => PLANS[id])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', overflowY: 'auto', padding: '32px 16px 64px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: '100%', maxWidth: 1020 }} className="sush-fade-up">
        {/* Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#f3f6f8', letterSpacing: -0.5 }}>
              Choose your <span style={{ color: accent }}>plan</span>
            </div>
            <div style={{ fontSize: 13, color: '#76808a', marginTop: 6 }}>
              Current plan: <span style={{ color: '#cdd5dc', fontWeight: 700 }}>{getPlan(currentPlan).name}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #20272e', background: '#11151a', color: '#8a939c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 28 }}>
          {plans.map(plan => {
            const active = currentPlan === plan.id
            const hover = hovered === plan.id
            return (
              <button
                key={plan.id}
                onClick={() => { savePlan(plan.id); onSelect(plan.id) }}
                onMouseEnter={() => setHovered(plan.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 6,
                  padding: '14px 14px',
                  borderRadius: 14,
                  border: `1.5px solid ${active ? plan.color : hover ? rgba(plan.color, 0.4) : '#1d242b'}`,
                  background: active ? rgba(plan.color, 0.1) : hover ? rgba(plan.color, 0.05) : '#0f1318',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color 0.15s, background 0.15s'
                }}
              >
                {active && (
                  <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 9, fontWeight: 900, color: plan.color, background: rgba(plan.color, 0.15), border: `1px solid ${rgba(plan.color, 0.3)}`, borderRadius: 99, padding: '2px 7px', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                    Active
                  </span>
                )}
                <span style={{ width: 28, height: 28, borderRadius: 8, background: rgba(plan.color, 0.18), border: `1px solid ${rgba(plan.color, 0.35)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: plan.color }} />
                </span>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#f1f4f6' }}>{plan.name}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: plan.color, lineHeight: 1 }}>
                  {plan.price === 0 ? 'Free' : `$${plan.price}`}
                  {plan.price > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: '#76808a' }}>/mo</span>}
                </div>
                <div style={{ fontSize: 10.5, color: '#76808a' }}>{plan.desc}</div>
              </button>
            )
          })}
        </div>

        {/* Feature comparison table */}
        <div style={{ background: '#090b0e', border: '1px solid #1b2127', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `200px repeat(${plans.length}, 1fr)`, borderBottom: '1px solid #1b2127' }}>
            <div style={{ padding: '10px 14px', fontSize: 11, fontWeight: 800, color: '#5a646d', textTransform: 'uppercase', letterSpacing: 1 }}>Feature</div>
            {plans.map(plan => (
              <div key={plan.id} style={{ padding: '10px 10px', fontSize: 12, fontWeight: 900, color: currentPlan === plan.id ? plan.color : '#8a939c', textAlign: 'center', borderLeft: '1px solid #1b2127' }}>
                {plan.name}
              </div>
            ))}
          </div>
          {FEATURE_ROWS.map((row, idx) => (
            <div
              key={row.key}
              style={{ display: 'grid', gridTemplateColumns: `200px repeat(${plans.length}, 1fr)`, borderBottom: idx < FEATURE_ROWS.length - 1 ? '1px solid #141a1f' : 'none', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
            >
              <div style={{ padding: '10px 14px', fontSize: 12, color: '#aab3bb', fontWeight: 600 }}>{row.label}</div>
              {plans.map(plan => {
                const val = plan.features[row.key]
                return (
                  <div key={plan.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid #141a1f' }}>
                    <Check yes={!!val} val={val} fmt={row.fmt} />
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 11.5, color: '#4a5560' }}>
          Billing and payments coming soon. Plans are currently in preview — select one to unlock features.
        </div>
      </div>
    </div>
  )
}
