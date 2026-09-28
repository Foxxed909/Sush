import React, { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icons'
import { STATES } from '../lib/agentActivity'
import { rgba } from '../lib/ui'
import NightlyProfileMenu from './NightlyProfileMenu'
import NightlyContextMenu from './NightlyContextMenu'
import NightlyStatusStrip from './NightlyStatusStrip'
import { groupByWorkspace, workspaceKey } from '../lib/workspaces'

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

function RenameField({ initial, state, pulse, onCommit, onCancel }) {
  const [value, setValue] = useState(initial)
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  return (
    <span className="nightly-thread-main is-editing">
      <span className={pulse ? 'sush-pulse-dot' : undefined} style={{ width: 6, height: 6, borderRadius: '50%', background: state.dot, flexShrink: 0 }} />
      <input
        ref={ref}
        className="nightly-thread-rename"
        value={value}
        maxLength={40}
        aria-label="Session name"
        onChange={e => setValue(e.target.value)}
        onBlur={() => onCommit(value.trim())}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onCommit(value.trim()) }
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          e.stopPropagation()
        }}
      />
    </span>
  )
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
  onViewProfile,
  onCloseSession,
  onRenameSession,
  onDuplicateSession,
  onHandoffSession,
  onNewInProject,
  onCloseProject,
  onOpenPane,
  status = {}
}) {
  const workspaces = useMemo(() => groupByWorkspace(tabs), [tabs])

  const activeTab = tabs.find(t => t.id === activeId)
  const activeWorkspaceKey = activeTab ? workspaceKey(activeTab) : null

  const [menu, setMenu] = useState(null)        // { x, y, items }
  const [editingId, setEditingId] = useState(null)
  const copyText = (text) => { if (text) window.sush?.copyText?.(text) }
  const reveal = (path) => { if (path) window.sush?.openPath?.({ path }) }

  const sessionMenu = (tab) => [
    { label: 'Rename', icon: 'edit', hint: 'Dbl-click', onSelect: () => setEditingId(tab.id) },
    { label: 'Duplicate', icon: 'copy', onSelect: () => onDuplicateSession?.(tab.id) },
    { label: 'Hand off…', icon: 'send', hint: tab.agentId && tab.agentId !== 'shell' ? undefined : 'agents only', disabled: !tab.agentId || tab.agentId === 'shell', onSelect: () => onHandoffSession?.(tab.id) },
    { separator: true },
    { label: 'Copy path', icon: 'file', onSelect: () => copyText(tab.cwd || tab.workspaceCwd) },
    { label: 'Reveal folder', icon: 'folder', onSelect: () => reveal(tab.cwd || tab.workspaceCwd) },
    { separator: true },
    { label: 'Close session', icon: 'x', danger: true, hint: 'Ctrl+W', onSelect: () => onCloseSession?.(tab.id) }
  ]
  const projectMenu = (workspace) => [
    { label: 'New session here…', icon: 'plus', onSelect: () => onNewInProject?.(workspace.cwd) },
    { label: 'Open Files', icon: 'folder', onSelect: () => onOpenPane?.('files', workspace.tabs[0]?.id) },
    { separator: true },
    { label: 'Copy path', icon: 'file', disabled: !workspace.cwd, onSelect: () => copyText(workspace.cwd) },
    { label: 'Reveal folder', icon: 'folder', disabled: !workspace.cwd, onSelect: () => reveal(workspace.cwd) },
    { separator: true },
    {
      label: `Close ${workspace.tabs.length} session${workspace.tabs.length === 1 ? '' : 's'}…`, icon: 'trash', danger: true,
      confirm: `Close ${workspace.tabs.length === 1 ? 'the session' : `all ${workspace.tabs.length} sessions`} in ${workspace.label}? Running agents will be stopped.`,
      onSelect: () => onCloseProject?.(workspace.key)
    }
  ]
  const openMenu = (event, items) => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY, items })
  }

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
              <div className="nightly-workspace-row">
              <button
                type="button"
                className="nightly-workspace-head"
                onClick={() => toggleWorkspace(workspace.key)}
                aria-expanded={!collapsed}
                aria-haspopup="menu"
                title={workspace.cwd || workspace.label}
                onContextMenu={(e) => openMenu(e, projectMenu(workspace))}
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
              {workspace.cwd && (
                <button type="button" className="nightly-workspace-add" aria-label={`New session in ${workspace.label}`} title={`New session in ${workspace.label}`} onClick={() => onNewInProject?.(workspace.cwd)}>
                  <Icon name="plus" size={12} />
                </button>
              )}
              </div>
              {!collapsed && (
                <div className="nightly-thread-list">
                  {workspace.tabs.map(tab => {
                    const stateId = tabStateId(tab, activity)
                    const state = STATES[stateId] || STATES.idle
                    const editing = editingId === tab.id
                    return (
                      <div
                        key={tab.id}
                        className={`nightly-thread-row${tab.id === activeId ? ' is-active' : ''}`}
                        onContextMenu={(e) => openMenu(e, sessionMenu(tab))}
                        onDoubleClick={() => setEditingId(tab.id)}
                      >
                        {editing ? (
                          <RenameField
                            initial={tab.label}
                            state={state}
                            pulse={stateId === 'working' || stateId === 'waiting'}
                            onCommit={(label) => { setEditingId(null); if (label && label !== tab.label) onRenameSession?.(tab.id, label) }}
                            onCancel={() => setEditingId(null)}
                          />
                        ) : (
                          <button
                            type="button"
                            className="nightly-thread-main"
                            onClick={() => onSelect?.(tab.id)}
                            title={tab.cwd || tab.profileLabel || tab.shell}
                          >
                            <span
                              className={stateId === 'working' || stateId === 'waiting' ? 'sush-pulse-dot' : undefined}
                              style={{ width: 6, height: 6, borderRadius: '50%', background: state.dot, '--pulse': rgba(state.color, 0.55), flexShrink: 0 }}
                            />
                            <span className="nightly-thread-copy">
                              <span>{tab.label}</span>
                              <small>{tab.agentId && tab.agentId !== 'shell' ? tab.agentId : 'terminal'}</small>
                            </span>
                          </button>
                        )}
                        {!editing && (
                          <button type="button" className="nightly-thread-close" aria-label={`Close ${tab.label}`} title="Close session (Ctrl+W)" onClick={() => onCloseSession?.(tab.id)}>
                            <Icon name="x" size={12} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <NightlyStatusStrip {...status} />

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
    {menu && <NightlyContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </aside>
  )
}
