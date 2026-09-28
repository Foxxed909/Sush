import React from 'react'
import { effortLabelFor, effortOptionsFor, modelSpecFor } from '../lib/nightlyModels'
import { rgba } from '../lib/ui'

export default function NightlyModelLaunchSettings({ agents = [], counts = {}, models = {}, efforts = {}, onChange, onEffortChange, accent }) {
  const selected = agents.filter(agent => (counts[agent.id] || 0) > 0 && modelSpecFor(agent.id))
  if (!selected.length) return null

  return (
    <div className="nightly-launch-models">
      <div className="nightly-launch-models-head">
        <span>Models</span>
        <small>Leave blank to use each CLI's default</small>
      </div>
      <div className="nightly-launch-models-list">
        {selected.map(agent => {
          const spec = modelSpecFor(agent.id)
          const effortOptions = effortOptionsFor(agent.id, models[agent.id])
          const listId = `nightly-models-${agent.id}`
          return (
            <div key={agent.id} className="nightly-launch-model">
              <div className="nightly-launch-model-who">
                <span style={{ color: agent.color, background: rgba(agent.color, .1), borderColor: rgba(agent.color, .22) }}>{agent.mono}</span>
                <strong>{agent.label}</strong>
              </div>
              <div className={`nightly-launch-model-fields${spec.effort ? ' has-effort' : ''}`}>
                <label className="nightly-field">
                  <span>Model</span>
                  <input
                    className={`nightly-field-input${models[agent.id] ? ' is-set' : ''}`}
                    list={listId}
                    value={models[agent.id] || ''}
                    onChange={e => {
                      const nextModel = e.target.value
                      onChange?.(agent.id, nextModel)
                      const selectedEffort = efforts[agent.id] || ''
                      if (selectedEffort && !effortOptionsFor(agent.id, nextModel).includes(selectedEffort)) {
                        onEffortChange?.(agent.id, '')
                      }
                    }}
                    placeholder={spec.placeholder}
                    spellCheck={false}
                  />
                  <datalist id={listId}>
                    {spec.options.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </datalist>
                </label>
                {spec.effort && (
                  <label className="nightly-field">
                    <span>{spec.effort.label}</span>
                    <select
                      className={`nightly-field-select${efforts[agent.id] ? ' is-set' : ''}`}
                      value={efforts[agent.id] || ''}
                      onChange={e => onEffortChange?.(agent.id, e.target.value)}
                    >
                      {effortOptions.map(v => <option key={v || 'default'} value={v}>{effortLabelFor(agent.id, v, 'Default')}</option>)}
                    </select>
                  </label>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
