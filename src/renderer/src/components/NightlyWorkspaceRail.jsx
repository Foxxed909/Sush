import React, { useMemo } from 'react'
import Icon from './Icons'
import { STATES } from '../lib/agentActivity'
import { rgba } from '../lib/ui'

function workspaceKey(tab) {
  return String(tab.cwd || tab.groupId || 'unassigned').replace(/[\\/]+$/, '').toLowerCase()
}

function workspaceLabel(tab) {
  if (tab.groupLabel) return tab.groupLabel
  if (tab.cwd) {
    const bits = String(tab.cwd).replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean)
    return bits[bits.length - 1] || tab.cwd
  }
  return 'Unassigned'
}

export default function NightlyWorkspaceRail({
  tabs = [],
  activeId,
  accent,
  activity = {},
  onSelect,
  onHome,
  onOverview,
  onNewSession,
  onHunt,
  onSettings
}) {
  const workspaces = useMemo(() => {
    const map = new Map()
    for (const tab of tabs) {
      const key = workspaceKey(tab)
      if (!map.has(key)) map.set(key, { key, label: workspaceLabel(tab), cwd: tab.cwd || '', tabs: [] })
      map.get(key).tabs.push(tab)
    }
    return [...map.values()]
  }, [tabs])

  const activeTab = tabs.find(t => t.id === activeId)
  const activeWorkspaceKey = activeTab ? workspaceKey(activeTab) : null

  return (
    <aside className="nightly-rail">
      <div className="nightly-rail-brand">
        <button className="nightly-brand-mark" onClick={onHome} title="Home">
          <span style={{ background: accent }} />
        </button>
        <div>
          <div className="nightly-brand-title">SUSH</div>
          <div className="nightly-brand-subtitle">NIGHTLY</div>
        </div>
        <button className="nightly-icon-btn" onClick={onNewSession} title="New session">
          <Icon name="plus" size={14} />
        </button>
      </div>

      <div className="nightly-rail-actions">
        <button onClick={onHunt}><Icon name="search" size={13} /> Search</button>
        <button onClick={onOverview || onHome}><Icon name="activity" size={13} /> Overview</button>
      </div>

      <div className="nightly-section-label">Projects</div>
      <div className="nightly-workspaces sush-scroll">
        {workspaces.length === 0 && (
          <button className="nightly-empty-project" onClick={onNewSession}>
            <Icon name="folder" size={14} />
            <span>Open a project</span>
          </button>
        )}
        {workspaces.map(workspace => {
          const selected = workspace.key === activeWorkspaceKey
          return (
            <div key={workspace.key} className={`nightly-workspace${selected ? ' is-active' : ''}`}>
              <div className="nightly-workspace-head">
                <span className="nightly-project-glyph"><Icon name="folder" size={13} /></span>
                <span className="nightly-workspace-name" title={workspace.cwd}>{workspace.label}</span>
                <span className="nightly-workspace-count">{workspace.tabs.length}</span>
              </div>
              <div className="nightly-thread-list">
                {workspace.tabs.map(tab => {
                  const stateId = tab.status === 'exited' ? 'error' : (activity[tab.id] || 'idle')
                  const state = STATES[stateId] || STATES.idle
                  return (
                    <button
                      key={tab.id}
                      className={`nightly-thread-row${tab.id === activeId ? ' is-active' : ''}`}
                      onClick={() => onSelect?.(tab.id)}
                      title={tab.cwd || tab.profileLabel || tab.shell}
                    >
                      <span
                        className={stateId === 'working' || stateId === 'waiting' ? 'sush-pulse-dot' : undefined}
                        style={{ width: 6, height: 6, borderRadius: '50%', background: state.dot, '--pulse': rgba(state.color, 0.55) }}
                      />
                      <span className="nightly-thread-copy">
                        <span>{tab.label}</span>
                        <small>{tab.agentId && tab.agentId !== 'shell' ? tab.agentId : 'terminal'}</small>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="nightly-rail-footer">
        <button onClick={onSettings}><Icon name="settings" size={13} /> Settings</button>
      </div>
    </aside>
  )
}
