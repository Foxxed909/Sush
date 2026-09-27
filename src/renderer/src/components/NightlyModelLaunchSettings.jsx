import React from 'react'
import { modelSpecFor } from '../lib/nightlyModels'
import { rgba } from '../lib/ui'

export default function NightlyModelLaunchSettings({ agents = [], counts = {}, models = {}, efforts = {}, onChange, onEffortChange, accent }) {
  const selected = agents.filter(agent => (counts[agent.id] || 0) > 0 && modelSpecFor(agent.id))
  if (!selected.length) return null

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 9 }}>
        <span style={{ fontSize: 9.5, fontWeight: 850, letterSpacing: 1, color: 'var(--text-4)', textTransform: 'uppercase' }}>Models</span>
        <span style={{ fontSize: 9.5, color: 'var(--text-5)' }}>Leave blank to use the CLI default</span>
      </div>
      <div style={{ display: 'grid', gap: 7 }}>
        {selected.map(agent => {
          const spec = modelSpecFor(agent.id)
          const listId = `nightly-models-${agent.id}`
          return (
            <label key={agent.id} style={{
              minHeight: 40,
              display: 'grid',
              gridTemplateColumns: 'minmax(120px, 180px) minmax(180px, 1fr)',
              alignItems: 'center',
              gap: 10,
              padding: '7px 9px',
              borderRadius: 9,
              background: 'rgba(255,255,255,.018)',
              border: '1px solid var(--border-1)'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                <span style={{
                  width: 23, height: 23, borderRadius: 6, display: 'grid', placeItems: 'center',
                  color: agent.color, background: rgba(agent.color, .1), border: `1px solid ${rgba(agent.color, .2)}`,
                  fontSize: 9.5, fontWeight: 900, flexShrink: 0
                }}>{agent.mono}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)', fontSize: 11, fontWeight: 750 }}>{agent.label}</span>
              </span>
              <span style={{ display: 'grid', gridTemplateColumns: spec.effort ? 'minmax(0, 1fr) 112px' : '1fr', gap: 7 }}>
                <span>
                  <input
                    list={listId}
                    value={models[agent.id] || ''}
                    onChange={e => onChange?.(agent.id, e.target.value)}
                    placeholder={spec.placeholder}
                    spellCheck={false}
                    style={{
                      width: '100%', height: 28, borderRadius: 7,
                      border: `1px solid ${models[agent.id] ? rgba(accent, .3) : 'var(--border-2)'}`,
                      background: 'var(--surface-2)', color: 'var(--text-1)', outline: 'none',
                      padding: '0 8px', fontSize: 10.5, fontFamily: 'var(--font-mono)'
                    }}
                  />
                  <datalist id={listId}>
                    {spec.options.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </datalist>
                </span>
                {spec.effort && (
                  <select
                    value={efforts[agent.id] || ''}
                    onChange={e => onEffortChange?.(agent.id, e.target.value)}
                    title={spec.effort.label}
                    style={{
                      width: '100%', height: 28, borderRadius: 7, outline: 'none',
                      border: `1px solid ${efforts[agent.id] ? rgba(accent, .3) : 'var(--border-2)'}`,
                      background: 'var(--surface-2)', color: efforts[agent.id] ? 'var(--text-2)' : 'var(--text-4)',
                      padding: '0 6px', fontSize: 9.75, fontFamily: 'var(--font-ui)'
                    }}
                  >
                    {spec.effort.options.map(v => <option key={v || 'default'} value={v}>{v ? v : spec.effort.label}</option>)}
                  </select>
                )}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
