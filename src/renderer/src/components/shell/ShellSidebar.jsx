import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import NightlyProfileMenu from '../NightlyProfileMenu'
import NightlyContextMenu from '../NightlyContextMenu'
import NightlyStatusStrip from '../NightlyStatusStrip'
import StageBackdrop from './StageBackdrop'
import ProviderLogo from '../ProviderLogo'
import { usePolling } from '../../hooks/usePolling'
import { agentById } from '../../lib/agents'
import { lineageTag } from '../../lib/lineage'
import { workspaceKey, workspaceLabel } from '../../lib/workspaces'
import { compactTimeLabel, projectOptions, rowStatus, sidebarSections, threadKey } from '../../lib/shellSidebar'

// Nightly thread sidebar, ported from T3 Code's Sidebar (MIT, (c) 2026 T3
// Tools Inc.): search + new thread, a project filter, one flat list of thread
// cards across projects, a collapsible Settled shelf, and an icon footer.
// Same actions as the Stable rail — only the arrangement differs.

const PINNED_KEY = 'sush-shell-pinned-threads'
const SETTLED_KEY = 'sush-shell-settled-threads'
const SHELF_KEY = 'sush-shell-settled-open'
const FILTER_KEY = 'sush-shell-project-filter'

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

function ThreadCard({ tab, tabs, active, stateId, limited, branch, pinned, settled, editing, now, onSelect, onMenu, onRename, onStopEditing, onUnpin }) {
  const agent = agentById(tab.agentId) || agentById('shell')
  const status = rowStatus(stateId, { limited })
  const lineage = lineageTag(tab, tabs, id => id)
  const time = compactTimeLabel(tab.lastActiveAt, now)
  return (
    <li
      className={`ts-card${active ? ' is-active' : ''}${settled ? ' is-settled' : ''}${status && !active ? ` has-${status.tone}` : ''}`}
      data-thread-id={tab.id}
    >
      <div
        role="button"
        tabIndex={0}
        className="ts-card-surface"
        aria-current={active ? 'page' : undefined}
        title={tab.cwd || tab.workspaceCwd || tab.label}
        onClick={() => onSelect(tab.id)}
        onKeyDown={e => { if (e.key === 'Enter') onSelect(tab.id) }}
        onDoubleClick={() => onRename(tab.id)}
        onContextMenu={e => onMenu(e, tab)}
      >
        <div className="ts-card-top">
          <span className="ts-project-mark"><Icon name="folder" size={12} /></span>
          <span className="ts-project">{workspaceLabel(tab)}</span>
          <span className="ts-flex" />
          {pinned && (
            <button type="button" className="ts-pin" aria-label="Unpin thread" title="Unpin thread" onClick={e => { e.stopPropagation(); onUnpin(tab) }}>
              <Icon name="star" size={11} />
            </button>
          )}
          {status ? (
            <span className={`ts-status is-${status.tone}`} role="status">
              <span className={`ts-status-dot${status.id === 'working' ? ' is-spinning' : ''}`} aria-hidden />
              {status.label}
            </span>
          ) : (
            <span className="ts-time">{time}</span>
          )}
        </div>
        <div className="ts-title">
          {editing ? (
            <RenameInput
              initial={tab.label}
              onCommit={label => { onStopEditing(); if (label && label !== tab.label) onRename(tab.id, label) }}
              onCancel={onStopEditing}
            />
          ) : (
            <span>{tab.label}</span>
          )}
        </div>
        <div className="ts-meta">
          {branch ? (
            <span className="ts-branch" title={`Branch ${branch.name}`}>
              <Icon name="gitBranch" size={11} />
              <span>{branch.name}</span>
            </span>
          ) : (
            <span className="ts-branch is-muted">{lineage ? `${lineage.arrow} ${lineage.text}` : (tab.model || 'no repo')}</span>
          )}
          <span className="ts-flex" />
          {tab.model && branch && <span className="ts-model">{tab.model}</span>}
          <ProviderLogo provider={tab.agentId} size={14} title={agent?.label} className="ts-provider" />
        </div>
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
  const [project, setProject] = useState(() => localStorage.getItem(FILTER_KEY) || 'all')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [menu, setMenu] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  usePolling(useCallback(() => setNow(Date.now()), []), 30000, true)

  const filterRef = useRef(null)
  useEffect(() => {
    if (!filterOpen) return undefined
    const close = e => { if (!filterRef.current?.contains(e.target)) setFilterOpen(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [filterOpen])
  const projects = useMemo(() => projectOptions(tabs), [tabs])
  const projectFilter = projects.some(p => p.key === project) ? project : 'all'
  const sections = useMemo(
    () => sidebarSections(tabs, { activity, pinned, settled, project: projectFilter, query }),
    [tabs, activity, pinned, settled, projectFilter, query]
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
  const chooseProject = key => {
    setProject(key)
    setFilterOpen(false)
    try { localStorage.setItem(FILTER_KEY, key) } catch {}
  }
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

  const renderCard = (tab, { isSettled = false } = {}) => (
    <ThreadCard
      key={tab.id}
      tab={tab}
      tabs={tabs}
      now={now}
      active={tab.id === activeId}
      stateId={tab.status === 'exited' ? 'error' : (activity[tab.id] || 'idle')}
      limited={!!limits[tab.id]}
      branch={branches[workspaceKey(tab)]}
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

  const currentProject = projects.find(p => p.key === projectFilter) || projects[0]
  const empty = !sections.pinned.length && !sections.active.length && !sections.settled.length

  return (
    <aside className="ts-sidebar">
      <StageBackdrop />
      <div className="ts-stage">
        <button className="ts-brand" onClick={onHome} title="Home">
          <span className="ts-brand-mark" style={{ background: accent }} />
          <span className="ts-brand-word">Sush</span>
        </button>
        <button className="ts-brand-channel" onClick={() => onChannel?.('stable')} title="You're on Sush Nightly — click to switch to Stable (Quiet Nights). Nothing restarts.">
          Nightly
        </button>
      </div>

      <div className="ts-controls">
        <div className="ts-search-row">
          {searching ? (
            <label className="ts-search is-open">
              <Icon name="search" size={14} />
              <input
                autoFocus
                value={query}
                placeholder="Search threads"
                onChange={e => setQuery(e.target.value)}
                onBlur={() => { if (!query) setSearching(false) }}
                onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); setSearching(false) } }}
              />
            </label>
          ) : (
            <button className="ts-search" onClick={() => setSearching(true)} onDoubleClick={onHunt} title="Search threads (double-click: search all output)">
              <Icon name="search" size={14} />
              <span>Search</span>
            </button>
          )}
          <button className="ts-icon" onClick={onNewSession} title="New thread (Ctrl+Shift+N)" aria-label="New thread">
            <Icon name="edit" size={14} />
          </button>
        </div>
        <div className="ts-filter-row">
          <div className="ts-filter" ref={filterRef}>
            <button className="ts-filter-btn" onClick={() => setFilterOpen(v => !v)} aria-haspopup="listbox" aria-expanded={filterOpen}>
              <Icon name="folder" size={14} />
              <span>{currentProject?.label || 'All projects'}</span>
              <Icon name="chevronDown" size={12} />
            </button>
            {filterOpen && (
              <ul className="ts-filter-menu" role="listbox">
                {projects.map(p => (
                  <li key={p.key}>
                    <button role="option" aria-selected={p.key === projectFilter} onClick={() => chooseProject(p.key)}>
                      <span>{p.label}</span>
                      {p.key === projectFilter && <Icon name="check" size={12} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            className="ts-icon"
            onClick={() => onNewInProject?.(currentProject?.cwd || null)}
            title={projectFilter === 'all' ? 'Open a project' : `New thread in ${currentProject.label}`}
            aria-label="Add project"
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
      </div>

      <div className="ts-list sush-scroll">
        {empty && (
          <button className="ts-empty" onClick={onNewSession}>
            <Icon name="folder" size={16} />
            <strong>{query ? 'No matching threads' : 'No threads yet'}</strong>
            <span>{query ? 'Try another word, or double-click Search to hunt through output.' : 'Open a folder and launch an agent.'}</span>
          </button>
        )}
        {sections.pinned.length > 0 && <ul className="ts-group">{sections.pinned.map(tab => renderCard(tab))}</ul>}
        {sections.active.length > 0 && <ul className="ts-group">{sections.active.map(tab => renderCard(tab))}</ul>}
        {sections.settled.length > 0 && (
          <div className="ts-shelf">
            <button className="ts-shelf-head" onClick={toggleShelf} aria-expanded={shelfOpen}>
              <span>Settled ({sections.settled.length})</span>
              <Icon name={shelfOpen ? 'chevronDown' : 'chevronRight'} size={12} />
            </button>
            {shelfOpen && <ul className="ts-group">{sections.settled.map(tab => renderCard(tab, { isSettled: true }))}</ul>}
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
        />
      </div>
      {menu && <NightlyContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </aside>
  )
}
