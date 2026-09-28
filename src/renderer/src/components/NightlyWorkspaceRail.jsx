import React, { useMemo, useState } from 'react'
import Icon from './Icons'
import { STATES } from '../lib/agentActivity'
import { rgba } from '../lib/ui'
import NightlyProfileMenu from './NightlyProfileMenu'

function workspaceKey(tab) {
  // Nightly's unit of work is the project folder. Legacy group ids are only
  // a fallback for sessions that do not have a cwd yet.
  return String(tab.workspaceCwd || tab.cwd || tab.groupId || 'unassigned').replace(/[\\/]+$/, '').toLowerCase()
}

const WORKSPACE_STATE_ORDER = ['error', 'waiting', 'working', 'booting', 'idle', 'done']

function tabStateId(tab, activity) {
  return tab.status === 'exited' ? 'error' : (activity[tab.id] || 'idle')
}

function workspaceState(workspace, activity) {
  const ids = new Set(workspace.tabs.map(tab => tabStateId(tab, activity)))
  const id = WORKSPACE_STATE_ORDER.find(candidate => ids.has(candidate)) || 'idle'
  return { id, state: STATES[id] || STATES.idle }
}

function loadCollapsedProjects() {
  try {
    const saved = JSON.parse(localStorage.getItem('sush-nightly-collapsed-projects') || '[]')
    return new Set(Array.isArray(saved) ? saved.filter(Boolean) : [])
  } catch {
    return new Set()
  }
}

function workspaceLabel(tab) {
  const root = tab.workspaceCwd || tab.cwd
  if (root) {
    const bits = String(root).replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean)
    return bits[bits.length - 1] || root
  }
  return tab.groupLabel || 'Unassigned'
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
  onSettings,
  user,
  onLock,
  onSignOut,
  onManageUsers,
  onViewProfile
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

  const activeTab = tabs.find(t => t.id === activeId)
  const activeWorkspaceKey = activeTab ? workspaceKey(activeTab) : null

  const [collapsedProjects, setCollapsedProjects] = useState(loadCollapsedProjects)
  const toggleWorkspace = (key) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try { localStorage.setItem('sush-nightly-collapsed-projects', JSON.stringify([...next])) } catch {}
      return next
    })
  }

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
          const collapsed = collapsedProjects.has(workspace.key)
          const aggregate = workspaceState(workspace, activity)
          return (
            <div key={workspace.key} className={`nightly-workspace${selected ? ' is-active' : ''}${collapsed ? ' is-collapsed' : ''}`}>
              <button
                type="button"
                className="nightly-workspace-head"
                onClick={() => toggleWorkspace(workspace.key)}
                aria-expanded={!collapsed}
                title={workspace.cwd || workspace.label}
              >
                <span className="nightly-project-glyph"><Icon name="folder" size={13} /></span>
                <span className="nightly-workspace-name">{workspace.label}</span>
                <span
                  className={aggregate.id === 'working' || aggregate.id === 'waiting' ? 'nightly-project-state sush-pulse-dot' : 'nightly-project-state'}
                  title={aggregate.state.label}
                  style={{ background: aggregate.state.dot, '--pulse': rgba(aggregate.state.color, 0.5) }}
                />
                <span className="nightly-workspace-count">{workspace.tabs.length}</span>
                <span className="nightly-workspace-chevron" aria-hidden>
                  <Icon name="chevronDown" size={10} />
                </span>
              </button>
              {!collapsed && (
                <div className="nightly-thread-list">
                  {workspace.tabs.map(tab => {
                    const stateId = tabStateId(tab, activity)
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
              )}
            </div>
          )
        })}
      </div>

      <div className="nightly-rail-footer">
        <button onClick={onSettings}><Icon name="settings" size={13} /> Settings</button>
        <NightlyProfileMenu
          user={user}
          accent={accent}
          onLock={onLock}
          onSignOut={onSignOut}
          onManageUsers={onManageUsers}
          onViewProfile={onViewProfile}
        />
      </div>
    </aside>
  )
}
