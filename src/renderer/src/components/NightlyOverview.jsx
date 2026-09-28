import React, { useMemo } from 'react'
import Icon from './Icons'
import { STATES } from '../lib/agentActivity'
import { agentById } from '../lib/agents'
import { rgba } from '../lib/ui'

function workspaceKey(tab) {
  return String(tab.workspaceCwd || tab.cwd || tab.groupId || 'unassigned').replace(/[\\/]+$/, '').toLowerCase()
}

function workspaceLabel(tab) {
  const root = tab.workspaceCwd || tab.cwd
  if (!root) return tab.groupLabel || 'Unassigned'
  const parts = String(root).replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || root
}

function memLabel(mb) {
  const n = Number(mb) || 0
  return n >= 1024 ? `${(n / 1024).toFixed(1)} GB` : `${Math.round(n)} MB`
}

export default function NightlyOverview({
  tabs = [],
  states = {},
  limits = {},
  metrics = {},
  summary = {},
  accent,
  onFocus,
  onHandoff,
  onNewSession
}) {
  const workspaces = useMemo(() => {
    const map = new Map()
    for (const tab of tabs) {
      const key = workspaceKey(tab)
      if (!map.has(key)) map.set(key, { key, label: workspaceLabel(tab), cwd: tab.workspaceCwd || tab.cwd || '', tabs: [] })
      map.get(key).tabs.push(tab)
    }
    return [...map.values()]
  }, [tabs])

  const chips = [
    ['waiting', summary.waiting || 0],
    ['working', summary.working || 0],
    ['error', summary.error || 0],
    ['idle', (summary.idle || 0) + (summary.booting || 0)],
    ['done', summary.done || 0]
  ].filter(([, n]) => n > 0)

  return (
    <div className="nightly-overview sush-scroll">
      <div className="nightly-overview-inner">
        <div className="nightly-overview-header">
          <div>
            <div className="nightly-overview-kicker">Quiet Nights</div>
            <h1>Overview</h1>
            <p>{tabs.length} session{tabs.length === 1 ? '' : 's'} across {workspaces.length} project{workspaces.length === 1 ? '' : 's'}</p>
          </div>
          <div className="nightly-overview-actions">
            {chips.map(([id, n]) => {
              const s = STATES[id] || STATES.idle
              return (
                <span key={id} className="nightly-overview-state">
                  <span style={{ background: s.dot }} /> {n} {s.label}
                </span>
              )
            })}
            <button className="nightly-action-btn" onClick={onNewSession}><Icon name="plus" size={13} /> New session</button>
          </div>
        </div>

        <div className="nightly-overview-grid">
          {workspaces.map(workspace => (
            <section key={workspace.key} className="nightly-overview-card">
              <header>
                <span className="nightly-project-glyph"><Icon name="folder" size={13} /></span>
                <span className="nightly-overview-project">
                  <strong>{workspace.label}</strong>
                  <small title={workspace.cwd}>{workspace.cwd || 'No project directory'}</small>
                </span>
                <span className="nightly-workspace-count">{workspace.tabs.length}</span>
              </header>

              <div className="nightly-overview-sessions">
                {workspace.tabs.map(tab => {
                  const stateId = tab.status === 'exited' ? 'error' : (states[tab.id] || 'idle')
                  const state = STATES[stateId] || STATES.idle
                  const agent = agentById(tab.agentId) || agentById('shell')
                  const metric = metrics[tab.id]
                  const limited = !!limits[tab.id]
                  return (
                    <div key={tab.id} className="nightly-overview-row">
                      <span className="nightly-overview-agent" style={{ color: agent?.color || accent, borderColor: rgba(agent?.color || accent, .2), background: rgba(agent?.color || accent, .08) }}>
                        {agent?.mono || '>_'}
                      </span>
                      <span className="nightly-overview-copy">
                        <span>{tab.label}</span>
                        <small>{tab.model
                          ? `${agent?.label || tab.agentId} · ${tab.model}${tab.effort ? ` · ${tab.effort}` : ''}`
                          : `${agent?.label || 'Terminal'}${tab.effort ? ` · ${tab.effort}` : ''}`}</small>
                      </span>
                      <span className={`nightly-overview-status${limited ? ' is-limited' : ''}`}>
                        <span style={{ background: limited ? '#ff9f43' : state.dot }} />
                        {limited ? 'Limit' : state.label}
                      </span>
                      {metric && (
                        <span className="nightly-overview-resource" title="Session resource use">
                          {Math.max(0, Math.round(metric.cpu || 0))}% · {memLabel(metric.memRss)}
                        </span>
                      )}
                      {limited && onHandoff && (
                        <button className="nightly-overview-mini" onClick={() => onHandoff(tab.id)}>Hand off</button>
                      )}
                      <button className="nightly-icon-btn" onClick={() => onFocus?.(tab.id)} title="Focus session"><Icon name="arrowRight" size={13} /></button>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        {!tabs.length && (
          <div className="nightly-overview-empty">
            <Icon name="layers" size={24} />
            <strong>No live workspaces yet</strong>
            <span>Open a project and launch an agent crew.</span>
            <button className="nightly-action-btn" onClick={onNewSession}><Icon name="plus" size={13} /> New session</button>
          </div>
        )}
      </div>
    </div>
  )
}
