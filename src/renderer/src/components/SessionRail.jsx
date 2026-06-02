import React, { useRef, useState } from 'react'
import Icon from './Icons'
import { rgba, accentVars } from '../lib/ui'

function shortPath(path) {
  if (!path) return ''
  const parts = String(path).split(/[\\/]/).filter(Boolean)
  if (parts.length <= 2) return path
  return `${parts[parts.length - 2]}\\${parts[parts.length - 1]}`
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
        borderRadius: 10,
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

// Group consecutive-by-id tabs into ordered blocks (groups keep their first-seen slot).
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

function SessionItem({ tab, active, over, accent, indented, dragHandlers, onSelect, onClose }) {
  const exited = tab.status === 'exited'
  const dotColor = exited ? '#ff5370' : '#42d392'
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      {...dragHandlers}
      onClick={() => onSelect(tab.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(tab.id)
        }
      }}
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
        borderRadius: 11,
        border: `1px solid ${active ? rgba(accent, 0.55) : over ? rgba(accent, 0.4) : '#1c232a'}`,
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
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, boxShadow: exited ? 'none' : `0 0 7px ${rgba(dotColor, 0.8)}`, flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 800 }}>
          {tab.label}
        </span>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, color: '#69737d', marginTop: 3 }}>
          {exited ? 'exited' : shortPath(tab.cwd) || tab.shellLabel || tab.shell}
        </span>
      </span>
      <button
        type="button"
        title="Close session"
        onClick={(event) => { event.stopPropagation(); onClose(tab.id) }}
        className="sush-session-close flex items-center justify-center"
        style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: '#69737d', cursor: 'pointer' }}
      >
        <Icon name="x" size={13} strokeWidth={2.2} />
      </button>
    </div>
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
  onProfiles
}) {
  const dragId = useRef(null)
  const [dragOver, setDragOver] = useState(null)
  const [collapsed, setCollapsed] = useState(() => new Set())

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

  const blocks = buildBlocks(tabs)

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
          style={{ gap: 8, color: '#6b747d', fontSize: 10.5, margin: '0 0 12px 2px', fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}
        >
          Sessions
          <span style={{ color: '#4b545d' }}>{tabs.length}</span>
          <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${rgba(accent, 0.18)}, transparent)` }} />
        </div>

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
                />
              )
            }

            const isCollapsed = collapsed.has(block.id)
            const hasActive = view === 'terminal' && block.tabs.some(t => t.id === activeId)
            const running = block.tabs.filter(t => t.status !== 'exited').length
            return (
              <div
                key={block.id}
                style={{
                  border: `1px solid ${hasActive ? rgba(accent, 0.4) : '#171d23'}`,
                  borderRadius: 13,
                  background: hasActive ? rgba(accent, 0.05) : '#0b0e11',
                  padding: 7
                }}
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
