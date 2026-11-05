import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import NightlyProfileMenu from '../NightlyProfileMenu'
import NightlyContextMenu from '../NightlyContextMenu'
import NightlyStatusStrip from '../NightlyStatusStrip'
import TrafficLights from './TrafficLights'
import StageBackdrop from './StageBackdrop'
import ProviderLogo from '../ProviderLogo'
import { usePolling } from '../../hooks/usePolling'
import { agentById } from '../../lib/agents'
import { lineageTag } from '../../lib/lineage'
import { workspaceKey, workspaceLabel } from '../../lib/workspaces'
import { compactTimeLabel, rowStatus, sidebarTree, threadKey } from '../../lib/shellSidebar'

// Nightly thread sidebar, after T3 Code's Sidebar (MIT, (c) 2026 T3 Tools
// Inc.): search + new thread, pinned threads, a Directory → sessions tree
// (each project folds open/closed, peeks open on hover), a collapsible
// Settled shelf, and an icon footer. Same actions as the Stable rail.

const PINNED_KEY = 'sush-shell-pinned-threads'
const SETTLED_KEY = 'sush-shell-settled-threads'
const SHELF_KEY = 'sush-shell-settled-open'
const COLLAPSED_KEY = 'sush-shell-collapsed-projects'

function loadSet(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return new Set(Array.isArray(value) ? value.filter(Boolean) : [])
  } catch {
    return new Set()
  }
}
function saveSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set])) } catch {}
}

// One git probe per project root, focus-gated, shared by every card in it.
function useProjectBranches(tabs) {
  const roots = useMemo(() => {
    const map = new Map()
    for (const tab of tabs) {
      const root = tab.sessionRootCwd || tab.workspaceCwd || tab.cwd
      if (root) map.set(workspaceKey(tab), root)
    }
    return map
  }, [tabs])
  const [branches, setBranches] = useState({})
  const read = useCallback(async () => {
    const next = {}
    await Promise.all([...roots].map(async ([key, cwd]) => {
      try {
        const g = await window.sush?.gitStatus?.({ cwd })
        if (g?.repo) next[key] = { name: g.branch, dirty: (g.files?.length || 0) > 0 }
      } catch {}
    }))
    setBranches(next)
  }, [roots])
  usePolling(read, 15000, roots.size > 0)
  return branches
}

function RenameInput({ initial, onCommit, onCancel }) {
  const [value, setValue] = useState(initial)
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  return (
    <input
      ref={ref}
      className="ts-rename"
      value={value}
      maxLength={60}
      aria-label="Thread name"
      onChange={e => setValue(e.target.value)}
      onBlur={() => onCommit(value.trim())}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); onCommit(value.trim()) }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        e.stopPropagation()
      }}
    />
  )
}

function SessionRow({ tab, tabs, active, stateId, limited, pinned, settled, editing, now, showProject, onSelect, onMenu, onRename, onStopEditing, onUnpin }) {
  const agent = agentById(tab.agentId) || agentById('shell')
  const status = rowStatus(stateId, { limited })
  const lineage = lineageTag(tab, tabs, id => id)
  const time = compactTimeLabel(tab.lastActiveAt, now)
  const sub = showProject ? workspaceLabel(tab) : (lineage ? `${lineage.arrow} ${lineage.text}` : tab.model || '')
  return (
    <li
      className={`ts-row${active ? ' is-active' : ''}${settled ? ' is-settled' : ''}${status && !active ? ` has-${status.tone}` : ''}`}
      data-thread-id={tab.id}
    >
      <div
        role="button"
        tabIndex={0}
        className="ts-row-surface"
        aria-current={active ? 'page' : undefined}
        title={[tab.label, tab.model, tab.cwd || tab.workspaceCwd].filter(Boolean).join(' · ')}
        onClick={() => onSelect(tab.id)}
        onKeyDown={e => { if (e.key === 'Enter') onSelect(tab.id) }}
        onDoubleClick={() => onRename(tab.id)}
        onContextMenu={e => onMenu(e, tab)}
      >
        <span className="ts-row-lead">
          <ProviderLogo provider={tab.agentId} size={13} title={agent?.label} className="ts-provider ts-row-logo" />
          {status && <span className={`ts-row-badge is-${status.tone}${status.id === 'working' ? ' is-spinning' : ''}`} aria-hidden />}
        </span>
        <span className="ts-row-text">
          {editing ? (
            <RenameInput
              initial={tab.label}
              onCommit={label => { onStopEditing(); if (label && label !== tab.label) onRename(tab.id, label) }}
              onCancel={onStopEditing}
            />
          ) : (
            <span className="ts-row-title">{tab.label}</span>
          )}
          {!settled && sub && <span className="ts-row-sub">{sub}</span>}
        </span>
        {pinned && (
          <button type="button" className="ts-pin" aria-label="Unpin thread" title="Unpin thread" onClick={e => { e.stopPropagation(); onUnpin(tab) }}>
            <Icon name="star" size={11} />
          </button>
        )}
        {status ? (
          <span className={`ts-status is-${status.tone}`} role="status">{status.label}</span>
        ) : (
          <span className="ts-time">{time}</span>
        )}
      </div>
    </li>
  )
}

// One directory in the tree. Click the header to open/close it (remembered);
// resting the pointer on a closed one for a beat peeks it open until the
// pointer leaves the group, so you can glance at its sessions without
// committing. The body animates with the 0fr→1fr grid-rows trick, so height
// is never measured in JS and nothing reflows outside the group.
function ProjectGroup({ group, open, onToggle, branch, active, children, onNewSession, onMenu }) {
  const [peek, setPeek] = useState(false)
  const timer = useRef(null)
  const shown = open || peek
  const clear = () => { clearTimeout(timer.current); timer.current = null }
  useEffect(() => clear, [])
  const status = group.attention === 'error'
    ? { tone: 'destructive', label: 'Failed' }
    : group.attention === 'waiting'
      ? { tone: 'warning', label: 'Needs input' }
      : group.working ? { tone: 'info', label: `${group.working} working` } : null
  return (
    <li
      className={`ts-project-group${shown ? ' is-open' : ''}${peek && !open ? ' is-peek' : ''}${active ? ' has-active' : ''}`}
      onMouseLeave={() => { clear(); setPeek(false) }}
    >
      <div
        className="ts-project-head"
        role="button"
        tabIndex={0}
        aria-expanded={shown}
        title={group.cwd}
        onClick={() => { clear(); setPeek(false); onToggle(group.key) }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(group.key) }
          if (e.key === 'ArrowRight' && !open) onToggle(group.key)
          if (e.key === 'ArrowLeft' && open) onToggle(group.key)
        }}
        onMouseEnter={() => { if (!open) { clear(); timer.current = setTimeout(() => setPeek(true), 420) } }}
        onContextMenu={e => onMenu(e, group)}
      >
        <span className="ts-chevron" aria-hidden><Icon name="chevronRight" size={12} /></span>
        <span className="ts-folder" aria-hidden><Icon name={shown ? 'folderOpen' : 'folder'} size={14} /></span>
        <span className="ts-project-name">{group.label}</span>
        {branch && (
          <span className={`ts-project-branch${branch.dirty ? ' is-dirty' : ''}`} title={`Branch ${branch.name}${branch.dirty ? ' · uncommitted changes' : ''}`}>
            <Icon name="gitBranch" size={10} />{branch.name}
          </span>
        )}
        <span className="ts-flex" />
        {status && !shown && <span className={`ts-head-dot is-${status.tone}`} title={status.label} />}
        <span className="ts-count">{group.tabs.length}</span>
        <button
          type="button"
          className="ts-head-action"
          title={`New session in ${group.label}`}
          aria-label={`New session in ${group.label}`}
          onClick={e => { e.stopPropagation(); onNewSession(group.cwd) }}
        >
          <Icon name="plus" size={13} />
        </button>
      </div>
      <div className="ts-project-body" aria-hidden={!shown}>
        <ul className="ts-project-list" inert={shown ? undefined : ''}>{children}</ul>
      </div>
    </li>
  )
}

export default function ShellSidebar({
  tabs = [],
  activeId,
  accent,
  activity = {},
  limits = {},
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
  onOpenPane,
  onChannel,
  status = {}
}) {
  const [pinned, setPinned] = useState(() => loadSet(PINNED_KEY))
  const [settled, setSettled] = useState(() => loadSet(SETTLED_KEY))
  const [shelfOpen, setShelfOpen] = useState(() => localStorage.getItem(SHELF_KEY) === '1')
  const [collapsed, setCollapsed] = useState(() => loadSet(COLLAPSED_KEY))
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [menu, setMenu] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  usePolling(useCallback(() => setNow(Date.now()), []), 30000, true)

  const tree = useMemo(
    () => sidebarTree(tabs, { activity, pinned, settled, query }),
    [tabs, activity, pinned, settled, query]
  )
  const branches = useProjectBranches(tabs)

  const toggleIn = (setter, key, storageKey) => setter(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    saveSet(storageKey, next)
    return next
  })
  const togglePin = tab => toggleIn(setPinned, threadKey(tab), PINNED_KEY)
  const toggleSettled = tab => toggleIn(setSettled, threadKey(tab), SETTLED_KEY)
  const toggleProject = key => toggleIn(setCollapsed, key, COLLAPSED_KEY)
  const activeTab = tabs.find(t => t.id === activeId)
  const activeProject = activeTab ? workspaceKey(activeTab) : null
  const toggleShelf = () => setShelfOpen(prev => {
    try { localStorage.setItem(SHELF_KEY, prev ? '0' : '1') } catch {}
    return !prev
  })

  const copyText = text => { if (text) window.sush?.copyText?.(text) }
  const threadMenu = tab => [
    { label: 'Rename', icon: 'edit', hint: 'Dbl-click', onSelect: () => setEditingId(tab.id) },
    { label: pinned.has(threadKey(tab)) ? 'Unpin' : 'Pin to top', icon: 'star', onSelect: () => togglePin(tab) },
    { label: settled.has(threadKey(tab)) ? 'Un-settle' : 'Settle', icon: 'check', onSelect: () => toggleSettled(tab) },
    { separator: true },
    { label: 'New thread in project', icon: 'plus', onSelect: () => onNewInProject?.(tab.workspaceCwd || tab.cwd) },
    { label: 'Duplicate', icon: 'copy', onSelect: () => onDuplicateSession?.(tab.id) },
    { label: 'Hand off…', icon: 'send', disabled: !tab.agentId || tab.agentId === 'shell', onSelect: () => onHandoffSession?.(tab.id) },
    { label: 'Open diff', icon: 'code', onSelect: () => { onSelect?.(tab.id); onOpenPane?.('changes', tab.id) } },
    { separator: true },
    { label: 'Copy path', icon: 'file', onSelect: () => copyText(tab.cwd || tab.workspaceCwd) },
    { label: 'Copy thread ID', icon: 'hash', onSelect: () => copyText(tab.id) },
    { separator: true },
    { label: 'Close thread', icon: 'x', danger: true, hint: 'Ctrl+W', onSelect: () => onCloseSession?.(tab.id) }
  ]
  const openMenu = (event, tab) => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY, items: threadMenu(tab) })
  }
  const projectMenu = group => [
    { label: 'New session here', icon: 'plus', onSelect: () => onNewInProject?.(group.cwd) },
    { label: collapsed.has(group.key) ? 'Expand' : 'Collapse', icon: collapsed.has(group.key) ? 'chevronDown' : 'chevronRight', onSelect: () => toggleProject(group.key) },
    { label: 'Collapse others', icon: 'layers', onSelect: () => {
      const next = new Set(tree.projects.map(p => p.key).filter(k => k !== group.key))
      saveSet(COLLAPSED_KEY, next); setCollapsed(next)
    } },
    { separator: true },
    { label: 'Copy path', icon: 'file', onSelect: () => copyText(group.cwd) }
  ]
  const openProjectMenu = (event, group) => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY, items: projectMenu(group) })
  }

  const renderRow = (tab, { isSettled = false, showProject = false } = {}) => (
    <SessionRow
      key={tab.id}
      tab={tab}
      tabs={tabs}
      now={now}
      active={tab.id === activeId}
      stateId={tab.status === 'exited' ? 'error' : (activity[tab.id] || 'idle')}
      limited={!!limits[tab.id]}
      showProject={showProject}
      pinned={pinned.has(threadKey(tab))}
      settled={isSettled}
      editing={editingId === tab.id}
      onSelect={id => onSelect?.(id)}
      onMenu={openMenu}
      onRename={(id, label) => (label ? onRenameSession?.(id, label) : setEditingId(id))}
      onStopEditing={() => setEditingId(null)}
      onUnpin={togglePin}
    />
  )

  const empty = !tree.pinned.length && !tree.projects.length && !tree.settled.length

  return (
    <aside className="ts-sidebar">
      <StageBackdrop />
      <div className="ts-stage">
        <TrafficLights />
        <span className="ts-flex" />
        <button className="ts-icon" onClick={onNewSession} title="New thread (Ctrl+Shift+N)" aria-label="New thread">
          <Icon name="edit" size={15} />
        </button>
      </div>

      <div className="ts-controls">
        {searching ? (
          <label className="ts-search is-open">
            <Icon name="search" size={13} />
            <input
              autoFocus
              value={query}
              placeholder="Search"
              onChange={e => setQuery(e.target.value)}
              onBlur={() => { if (!query) setSearching(false) }}
              onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); setSearching(false) } }}
            />
          </label>
        ) : (
          <button className="ts-search" onClick={() => setSearching(true)} onDoubleClick={onHunt} title="Search threads (double-click: search all output)">
            <Icon name="search" size={13} />
            <span>Search</span>
          </button>
        )}
        <nav className="ts-nav" aria-label="Places">
          <button className="ts-nav-row" onClick={onHome}><Icon name="home" size={15} /><span>Home</span></button>
          <button className="ts-nav-row" onClick={onOverview}><Icon name="activity" size={15} /><span>Agents</span></button>
        </nav>
      </div>

      <div className="ts-list sush-scroll">
        {empty && (
          <button className="ts-empty" onClick={onNewSession}>
            <Icon name="folder" size={16} />
            <strong>{query ? 'No matching threads' : 'No threads yet'}</strong>
            <span>{query ? 'Try another word, or double-click Search to hunt through output.' : 'Open a folder and launch an agent.'}</span>
          </button>
        )}
        {tree.pinned.length > 0 && (
          <section className="ts-section">
            <div className="ts-section-head"><span>Pinned</span></div>
            <ul className="ts-group">{tree.pinned.map(tab => renderRow(tab, { showProject: true }))}</ul>
          </section>
        )}
        {tree.projects.length > 0 && (
          <section className="ts-section">
            <div className="ts-section-head">
              <span>Projects</span>
              <button type="button" className="ts-section-action" onClick={() => onNewInProject?.(null)} title="Open a folder" aria-label="Open a folder">
                <Icon name="plus" size={13} />
              </button>
            </div>
            <ul className="ts-tree">
              {tree.projects.map(group => (
                <ProjectGroup
                  key={group.key}
                  group={group}
                  open={!!query || !collapsed.has(group.key)}
                  onToggle={toggleProject}
                  branch={branches[group.key]}
                  active={group.key === activeProject}
                  onNewSession={cwd => onNewInProject?.(cwd)}
                  onMenu={openProjectMenu}
                >
                  {group.tabs.map(tab => renderRow(tab))}
                </ProjectGroup>
              ))}
            </ul>
          </section>
        )}
        {tree.settled.length > 0 && (
          <div className="ts-shelf">
            <button className="ts-shelf-head" onClick={toggleShelf} aria-expanded={shelfOpen}>
              <span className="ts-chevron" aria-hidden><Icon name="chevronRight" size={12} /></span>
              <span>Settled</span>
              <span className="ts-flex" />
              <span className="ts-count">{tree.settled.length}</span>
            </button>
            <div className={`ts-project-body${shelfOpen ? ' is-open' : ''}`}>
              <ul className="ts-project-list" inert={shelfOpen ? undefined : ''}>{tree.settled.map(tab => renderRow(tab, { isSettled: true, showProject: true }))}</ul>
            </div>
          </div>
        )}
      </div>

      <NightlyStatusStrip {...status} />

      <div className="ts-footer">
        <button className="ts-icon" onClick={onSettings} title="Settings (Ctrl+,)" aria-label="Settings"><Icon name="settings" size={15} /></button>
        <button className="ts-icon" onClick={() => onOpenPane?.('changes')} title="Source control" aria-label="Source control"><Icon name="gitBranch" size={15} /></button>
        <button className="ts-icon" onClick={onOverview} title="Agents (Alt+4)" aria-label="Agents"><Icon name="activity" size={15} /></button>
        <span className="ts-flex" />
        <NightlyProfileMenu
          user={user}
          accent={accent}
          onLock={onLock}
          onSignOut={onSignOut}
          onManageUsers={onManageUsers}
          onViewProfile={onViewProfile}
          onChannel={onChannel}
        />
      </div>
      {menu && <NightlyContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </aside>
  )
}
