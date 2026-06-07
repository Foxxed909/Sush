import React, { useRef, useState, useCallback, useEffect } from 'react'
import Icon from './Icons'
import { rgba, accentVars } from '../lib/ui'

function shortPath(path) {
  if (!path) return ''
  const parts = String(path).split(/[\\/]/).filter(Boolean)
  if (parts.length <= 2) return path
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
}

function RailButton({ icon, label, active, accent, onClick }) {
  return (
    <button
      title={label}
      onClick={onClick}
      className="sush-icon-btn flex items-center justify-center"
      style={{
        width: 36,
        height: 36,
        borderRadius: 'var(--r-md)',
        border: `1px solid ${active ? accent : rgba(accent, 0.3)}`,
        background: active ? rgba(accent, 0.16) : '#12161a',
        color: active ? accent : '#c2cad1',
        cursor: 'pointer'
      }}
    >
      <Icon name={icon} size={17} strokeWidth={2.1} />
    </button>
  )
}

function buildBlocks(tabs) {
  const blocks = []
  const index = new Map()
  tabs.forEach(tab => {
    if (tab.groupId) {
      if (index.has(tab.groupId)) {
        blocks[index.get(tab.groupId)].tabs.push(tab)
      } else {
        index.set(tab.groupId, blocks.length)
        blocks.push({ type: 'group', id: tab.groupId, label: tab.groupLabel || 'Workspace', tabs: [tab] })
      }
    } else {
      blocks.push({ type: 'solo', tab })
    }
  })
  return blocks
}

// Per-session in-place rename: double-click the label to edit, or trigger via the
// context menu / F2 (editRequested), which the parent drives through renamingId.
function SessionLabel({ tab, onRename, editRequested, onEditDone }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(tab.label)
  const inputRef = useRef(null)

  useEffect(() => { setVal(tab.label) }, [tab.label])
  useEffect(() => { if (editing) { inputRef.current?.select(); inputRef.current?.focus() } }, [editing])
  useEffect(() => { if (editRequested) setEditing(true) }, [editRequested])

  const commit = () => {
    setEditing(false)
    onEditDone?.()
    const trimmed = val.trim()
    if (trimmed && trimmed !== tab.label) onRename(tab.id, trimmed)
    else setVal(tab.label)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setVal(tab.label); onEditDone?.() } }}
        onClick={e => e.stopPropagation()}
        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: '#f1f4f6', outline: 'none', fontSize: 12.5, fontWeight: 800, fontFamily: 'inherit' }}
      />
    )
  }

  return (
    <span
      style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 800 }}
      onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}
      title="Double-click to rename"
    >
      {tab.label}
    </span>
  )
}

function SessionItem({ tab, active, over, accent, indented, dragHandlers, onSelect, onClose, onRename, onDuplicate, onPin, pinned, editRequested, onEditDone, onRenameStart, onHandoff }) {
  const [ctxMenu, setCtxMenu] = useState(null)
  const exited = tab.status === 'exited'
  const dotColor = exited ? '#ff5370' : '#42d392'

  const handleContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [ctxMenu])

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        draggable
        {...dragHandlers}
        onClick={() => onSelect(tab.id)}
        onContextMenu={handleContextMenu}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(tab.id) } }}
        title={tab.cwd || tab.profileLabel}
        className="sush-session group"
        style={{
          position: 'relative',
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          gap: 10,
          alignItems: 'center',
          textAlign: 'left',
          borderRadius: 'var(--r-lg)',
          border: `1px solid ${active ? rgba(accent, 0.55) : over ? rgba(accent, 0.4) : pinned ? rgba(accent, 0.22) : '#1c232a'}`,
          background: active ? rgba(accent, 0.1) : over ? '#11171c' : '#0e1216',
          color: active ? '#f4f6f8' : '#aab2ba',
          padding: '10px 11px',
          marginLeft: indented ? 12 : 0,
          cursor: 'pointer',
          outline: over ? `1px dashed ${rgba(accent, 0.4)}` : 'none'
        }}
      >
        {active && (
          <span style={{ position: 'absolute', left: 0, top: 9, bottom: 9, width: 3, borderRadius: 3, background: accent, boxShadow: `0 0 10px ${accent}` }} />
        )}
        {pinned && !active && (
          <span style={{ position: 'absolute', left: 0, top: 9, bottom: 9, width: 3, borderRadius: 3, background: rgba(accent, 0.4) }} />
        )}
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, boxShadow: exited ? 'none' : `0 0 7px ${rgba(dotColor, 0.8)}`, flexShrink: 0 }} />
        <span style={{ minWidth: 0 }}>
          <SessionLabel tab={tab} onRename={onRename} editRequested={editRequested} onEditDone={onEditDone} />
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, color: '#69737d', marginTop: 3 }}>
            {exited ? 'exited' : shortPath(tab.cwd) || tab.shellLabel || tab.shell}
          </span>
        </span>
        <button
          type="button"
          title={pinned ? 'Pinned — right-click to unpin or close' : 'Close session'}
          onClick={(event) => {
            event.stopPropagation()
            if (pinned) { handleContextMenu(event); return }
            onClose(tab.id)
          }}
          className="sush-session-close flex items-center justify-center"
          style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: pinned ? '#5a646d' : '#69737d', cursor: 'pointer' }}
        >
          <Icon name={pinned ? 'lock' : 'x'} size={13} strokeWidth={2.2} />
        </button>
      </div>

      {ctxMenu && (
        <div
          style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 600, background: '#0f1318', border: '1px solid #20272e', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', minWidth: 160, padding: 4 }}
          onClick={e => e.stopPropagation()}
        >
          {[
            { icon: 'edit', label: 'Rename', action: () => onRenameStart?.(tab.id) },
            { icon: 'send', label: 'Hand off…', action: () => onHandoff?.(tab.id) },
            { icon: 'refresh', label: 'Duplicate', action: () => onDuplicate?.(tab.id) },
            { icon: 'copy', label: 'Copy path', action: () => { if (tab.cwd) window.sush?.copyText?.(tab.cwd) } },
            { icon: pinned ? 'minus' : 'lock', label: pinned ? 'Unpin' : 'Pin', action: () => onPin?.(tab.id) },
            { icon: 'trash', label: 'Close', action: () => { setCtxMenu(null); onClose(tab.id) }, danger: true },
          ].map(item => (
            <button
              key={item.label}
              onClick={() => { setCtxMenu(null); item.action() }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', border: 'none', background: 'transparent', color: item.danger ? '#ff5370' : '#d4dbe1', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, borderRadius: 7 }}
            >
              <Icon name={item.icon} size={13} color={item.danger ? '#ff5370' : '#8a939c'} strokeWidth={2} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export default function SessionRail({
  tabs,
  activeId,
  view,
  accent,
  profiles,
  onHome,
  onSelect,
  onNew,
  onNewSession,
  onClose,
  onCloseGroup,
  onReorder,
  onProfiles,
  onRename,
  onDuplicate,
  renamingId,
  onRenameStart,
  onRenameEnd,
  onHandoff
}) {
  const dragId = useRef(null)
  const [dragOver, setDragOver] = useState(null)
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [pinned, setPinned] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('sush-pinned-tabs') ?? '[]')) } catch { return new Set() }
  })

  const togglePin = useCallback((id) => {
    setPinned(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      localStorage.setItem('sush-pinned-tabs', JSON.stringify([...next]))
      return next
    })
  }, [])

  const dragHandlersFor = (tabId) => ({
    onDragStart: () => { dragId.current = tabId },
    onDragOver: (event) => { event.preventDefault(); setDragOver(tabId) },
    onDrop: (event) => {
      event.preventDefault()
      setDragOver(null)
      if (!dragId.current || dragId.current === tabId) return
      onReorder(dragId.current, tabId)
      dragId.current = null
    },
    onDragEnd: () => { dragId.current = null; setDragOver(null) }
  })

  const toggleGroup = (id) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Filter by label or path, then sort pinned first.
  const q = filter.trim().toLowerCase()
  const filteredTabs = q
    ? tabs.filter(t => (t.label || '').toLowerCase().includes(q) || (t.cwd || '').toLowerCase().includes(q) || (t.groupLabel || '').toLowerCase().includes(q))
    : tabs
  const sortedTabs = [...filteredTabs].sort((a, b) => {
    const ap = pinned.has(a.id) ? 0 : 1
    const bp = pinned.has(b.id) ? 0 : 1
    return ap - bp
  })

  const blocks = buildBlocks(sortedTabs)

  return (
    <aside
      className="shrink-0 flex flex-col"
      style={{
        ...accentVars(accent),
        width: 236,
        minWidth: 196,
        maxWidth: '38vw',
        background: '#090b0d',
        borderRight: `1px solid ${rgba(accent, 0.16)}`
      }}
    >
      <div className="flex items-center" style={{ gap: 8, padding: 12, borderBottom: `1px solid ${rgba(accent, 0.1)}` }}>
        <RailButton icon="home" label="Home" active={view === 'home'} accent={accent} onClick={onHome} />
        <RailButton
          icon="plus"
          label="New session"
          accent={accent}
          onClick={() => (onNewSession ? onNewSession() : onNew({ profile: profiles?.[0] }))}
        />
        <RailButton icon="layers" label="Profiles" accent={accent} onClick={onProfiles} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto sush-scroll" style={{ padding: 12 }}>
        <div
          className="flex items-center"
          style={{ gap: 8, color: '#6b747d', fontSize: 10.5, margin: '0 0 10px 2px', fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}
        >
          Sessions
          <span style={{ color: '#4b545d' }}>{q ? `${sortedTabs.length}/${tabs.length}` : tabs.length}</span>
          <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${rgba(accent, 0.18)}, transparent)` }} />
        </div>

        {tabs.length > 3 && (
          <div
            className="flex items-center"
            style={{ gap: 7, marginBottom: 10, background: '#07090b', border: '1px solid #1c232a', borderRadius: 'var(--r-sm)', padding: '0 9px', height: 30 }}
          >
            <Icon name="search" size={12} color="#5a646d" strokeWidth={2} />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter sessions…"
              spellCheck={false}
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#d4dbe1', fontSize: 11.5, fontFamily: 'inherit' }}
            />
            {filter && (
              <button onClick={() => setFilter('')} title="Clear" style={{ background: 'none', border: 'none', color: '#69737d', cursor: 'pointer', display: 'flex', padding: 0 }}>
                <Icon name="x" size={12} strokeWidth={2.2} />
              </button>
            )}
          </div>
        )}

        {q && sortedTabs.length === 0 && (
          <div style={{ fontSize: 11.5, color: '#5a646d', padding: '8px 2px' }}>No sessions match “{filter}”.</div>
        )}

        <div className="flex flex-col" style={{ gap: 8 }}>
          {blocks.map(block => {
            if (block.type === 'solo') {
              const tab = block.tab
              return (
                <SessionItem
                  key={tab.id}
                  tab={tab}
                  active={view === 'terminal' && tab.id === activeId}
                  over={dragOver === tab.id}
                  accent={accent}
                  dragHandlers={dragHandlersFor(tab.id)}
                  onSelect={onSelect}
                  onClose={onClose}
                  onRename={onRename}
                  onDuplicate={onDuplicate}
                  onPin={togglePin}
                  pinned={pinned.has(tab.id)}
                  editRequested={renamingId === tab.id}
                  onEditDone={onRenameEnd}
                  onRenameStart={onRenameStart}
                  onHandoff={onHandoff}
                />
              )
            }

            const isCollapsed = collapsed.has(block.id)
            const hasActive = view === 'terminal' && block.tabs.some(t => t.id === activeId)
            const running = block.tabs.filter(t => t.status !== 'exited').length
            return (
              <div
                key={block.id}
                style={{ border: `1px solid ${hasActive ? rgba(accent, 0.4) : '#171d23'}`, borderRadius: 'var(--r-lg)', background: hasActive ? rgba(accent, 0.05) : '#0b0e11', padding: 7 }}
              >
                <div
                  className="flex items-center"
                  style={{ gap: 7, padding: '3px 4px 6px', cursor: 'pointer' }}
                  onClick={() => toggleGroup(block.id)}
                  title={block.label}
                >
                  <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={13} color="#7b858d" strokeWidth={2.4} />
                  <Icon name="users" size={13} color={accent} strokeWidth={2} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 800, color: '#d6dde2' }}>
                    {block.label}
                  </span>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: accent, background: rgba(accent, 0.14), borderRadius: 999, padding: '1px 7px' }}>
                    {running}/{block.tabs.length}
                  </span>
                  <button
                    type="button"
                    title="Close workspace"
                    onClick={(e) => { e.stopPropagation(); onCloseGroup?.(block.id) }}
                    className="flex items-center justify-center"
                    style={{ width: 20, height: 20, borderRadius: 6, border: 'none', background: 'transparent', color: '#69737d', cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#ff5370' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#69737d' }}
                  >
                    <Icon name="trash" size={13} strokeWidth={2} />
                  </button>
                </div>
                {!isCollapsed && (
                  <div className="flex flex-col" style={{ gap: 7 }}>
                    {block.tabs.map(tab => (
                      <SessionItem
                        key={tab.id}
                        tab={tab}
                        active={view === 'terminal' && tab.id === activeId}
                        over={dragOver === tab.id}
                        accent={accent}
                        dragHandlers={dragHandlersFor(tab.id)}
                        onSelect={onSelect}
                        onClose={onClose}
                        onRename={onRename}
                        onDuplicate={onDuplicate}
                        onPin={togglePin}
                        pinned={pinned.has(tab.id)}
                        editRequested={renamingId === tab.id}
                        onEditDone={onRenameEnd}
                        onRenameStart={onRenameStart}
                        onHandoff={onHandoff}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
