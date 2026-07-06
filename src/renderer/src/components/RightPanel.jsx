import React, { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import Seducia from './Seducia'
import Browser from './Browser'
import GitHubTab from './GitHubTab'
import ClaudePanel from './ClaudePanel'
import { rgba, accentVars } from '../lib/ui'
import ChangesTab from './panel/ChangesTab'
import FilesTab from './panel/FilesTab'
import TasksTab from './panel/TasksTab'
import MemoryTab from './panel/MemoryTab'
import ScriptsTab from './panel/ScriptsTab'
import HistoryTab from './panel/HistoryTab'
import SnippetsTab from './panel/SnippetsTab'
import PortsTab from './panel/PortsTab'
import DockerTab from './panel/DockerTab'
import EnvManagerTab from './panel/EnvTab'
import SshTab from './panel/SshTab'
import MarkdownTab from './panel/MarkdownTab'

// The right panel SHELL: tab strip + routing only. Every tab body lives in
// ./panel/<Tab>.jsx (shared bits in ./panel/shared.jsx) — this file was a
// 1,878-line pile of thirteen unrelated tools before the split.

const TABS = [
  { id: 'agent', label: 'Agent', icon: 'sparkles' },
  { id: 'claude', label: 'Claude', icon: 'sparkles' },
  { id: 'browser', label: 'Browser', icon: 'globe' },
  { id: 'changes', label: 'Changes', icon: 'gitBranch' },
  { id: 'github', label: 'GitHub', icon: 'github' },
  { id: 'files', label: 'Files', icon: 'file' },
  { id: 'tasks', label: 'Tasks', icon: 'check' },
  { id: 'memory', label: 'Memory', icon: 'book' },
  { id: 'scripts', label: 'Scripts', icon: 'rocket' },
  { id: 'history', label: 'History', icon: 'clock' },
  { id: 'snippets', label: 'Snippets', icon: 'command' },
  { id: 'ports', label: 'Ports', icon: 'ports' },
  { id: 'docker', label: 'Docker', icon: 'layers' },
  { id: 'env', label: 'Env', icon: 'key' },
  { id: 'ssh', label: 'SSH', icon: 'lock' },
  { id: 'markdown', label: 'Preview', icon: 'fileText' },
]

export default function RightPanel({
  accent,
  tab,
  onTab,
  activeCwd,
  tabs,
  recentSessions,
  seduciaScope,
  seduciaControls,
  onLaunch,
  onRun,
  onPrompt,
  onFocus,
  onOpenLauncher,
  onClose,
  onNewTab,
  settings = {},
  commandHistory = [],
  ghNotifCount = 0,
  onManageUsers,
  style = {}
}) {
  const [mdPath, setMdPath] = useState(null)

  const handleOpenFile = useCallback((p) => {
    if (p.toLowerCase().endsWith('.md')) {
      setMdPath(p)
      onTab('markdown')
    } else {
      onRun(`edit "${p}"`)
    }
  }, [onRun, onTab])

  const safeTab = TABS.some(t => t.id === tab) ? tab : 'agent'
  useEffect(() => {
    if (safeTab !== tab) onTab(safeTab)
  }, [safeTab, tab, onTab])

  return (
    <aside
      className="shrink-0 flex flex-col"
      style={{
        ...accentVars(accent),
        width: style.width ?? 360,
        minWidth: 280,
        maxWidth: '55vw',
        background: 'transparent',
        borderLeft: `1px solid ${rgba(accent, 0.1)}`
      }}
    >
      {/* Tab header — single horizontal scrolling strip with a custom scroll indicator */}
      <TabStrip accent={accent} tab={safeTab} onTab={onTab} onClose={onClose} ghNotifCount={ghNotifCount} />

      {/* Tab body */}
      <div className="flex-1 min-h-0" style={{ position: 'relative' }}>
        {safeTab === 'agent' && (
          <Seducia
            docked
            accent={accent}
            tabs={tabs}
            recentSessions={recentSessions}
            activeCwd={activeCwd}
            scope={seduciaScope}
            controls={seduciaControls}
            onLaunch={onLaunch}
            onRun={onRun}
            onPrompt={onPrompt}
            onFocus={onFocus}
            onOpenLauncher={onOpenLauncher}
            onClose={onClose}
            settings={settings}
          />
        )}
        {/* Kept mounted so a running Claude turn isn't killed by a tab switch. */}
        <div style={{ position: 'absolute', inset: 0, display: safeTab === 'claude' ? 'block' : 'none' }}>
          <ClaudePanel accent={accent} activeCwd={activeCwd} visible={safeTab === 'claude'} />
        </div>
        {/* Kept mounted so the page (and your scroll/login state) survives tab switches. */}
        <div style={{ position: 'absolute', inset: 0, display: safeTab === 'browser' ? 'block' : 'none' }}>
          <Browser accent={accent} />
        </div>
        {safeTab === 'changes' && <ChangesTab accent={accent} cwd={activeCwd} onOpenFile={handleOpenFile} settings={settings} />}
        {safeTab === 'github' && <GitHubTab accent={accent} onRun={onRun} onConnect={onManageUsers} />}
        {safeTab === 'files' && <FilesTab accent={accent} cwd={activeCwd} onOpenFile={handleOpenFile} />}
        {safeTab === 'tasks' && <TasksTab accent={accent} cwd={activeCwd} onRun={onRun} />}
        {safeTab === 'memory' && <MemoryTab accent={accent} cwd={activeCwd} />}
        {safeTab === 'scripts' && <ScriptsTab accent={accent} cwd={activeCwd} onRun={onRun} />}
        {safeTab === 'history' && <HistoryTab accent={accent} history={commandHistory} onRun={onRun} settings={settings} />}
        {safeTab === 'snippets' && <SnippetsTab accent={accent} onRun={onRun} />}
        {safeTab === 'ports' && <PortsTab accent={accent} onRun={onRun} />}
        {safeTab === 'docker' && <DockerTab accent={accent} onRun={onRun} />}
        {safeTab === 'env' && <EnvManagerTab accent={accent} cwd={activeCwd} />}
        {safeTab === 'ssh' && <SshTab accent={accent} onNewTab={onNewTab} onRun={onRun} />}
        {safeTab === 'markdown' && <MarkdownTab accent={accent} cwd={activeCwd} initialPath={mdPath} />}
      </div>
    </aside>
  )
}

// Horizontal, single-row tab strip. Tabs scroll sideways with a slim accent
// scrollbar; gradient edges hint that there's more, and the active tab is
// always scrolled into view. The collapse button is pinned outside the scroller.
function TabStrip({ accent, tab, onTab, onClose, ghNotifCount = 0 }) {
  const scrollerRef = useRef(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  // Compact mode: icon-only tabs for a dense workspace panel.
  const [compact, setCompact] = useState(() => localStorage.getItem('sush-tabs-compact') === '1')
  const toggleCompact = () => setCompact(c => { const n = !c; localStorage.setItem('sush-tabs-compact', n ? '1' : '0'); return n })

  const updateEdges = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 })
  }, [])

  // Recompute fade edges on mount, resize and content changes.
  useEffect(() => {
    updateEdges()
    const el = scrollerRef.current
    if (!el) return
    const ro = new ResizeObserver(updateEdges)
    ro.observe(el)
    return () => ro.disconnect()
  }, [updateEdges])

  // Keep the active tab visible when it changes from elsewhere (shortcuts, etc.)
  useEffect(() => {
    const el = scrollerRef.current
    const node = el?.querySelector(`[data-tab="${tab}"]`)
    if (node?.scrollIntoView) node.scrollIntoView({ inline: 'nearest', block: 'nearest' })
    updateEdges()
  }, [tab, updateEdges])

  // Let a vertical mouse wheel scroll the strip horizontally.
  const onWheel = useCallback((e) => {
    const el = scrollerRef.current
    if (!el || el.scrollWidth <= el.clientWidth) return
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY
      updateEdges()
    }
  }, [updateEdges])

  const fade = (side) => ({
    position: 'absolute', top: 0, bottom: 0, [side]: 0, width: 26, pointerEvents: 'none',
    background: `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, rgba(6,8,11,0.85), rgba(6,8,11,0))`,
    opacity: edges[side] ? 1 : 0, transition: 'opacity .15s ease', zIndex: 2
  })

  return (
    <div className="flex items-center" style={{ padding: '8px 8px', gap: 6, borderBottom: '1px solid var(--border-1)' }}>
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <div ref={scrollerRef} className="sush-htabs" onScroll={updateEdges} onWheel={onWheel} style={{ gap: 4, paddingBottom: 4 }}>
          {TABS.map(t => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                data-tab={t.id}
                onClick={() => onTab(t.id)}
                title={compact ? t.label : undefined}
                className="flex items-center justify-center sush-icon-btn"
                style={{
                  gap: 6,
                  height: 30,
                  width: compact ? 32 : undefined,
                  padding: compact ? 0 : '0 9px',
                  borderRadius: 8,
                  border: `1px solid ${active ? rgba(accent, 0.45) : 'transparent'}`,
                  background: active ? rgba(accent, 0.12) : 'transparent',
                  color: active ? accent : 'var(--text-3)',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                <Icon name={t.icon} size={13} strokeWidth={2} />
                {!compact && t.label}
                {t.id === 'github' && ghNotifCount > 0 && (
                  <span style={{ minWidth: 14, height: 14, padding: '0 4px', borderRadius: 999, background: accent, color: 'var(--surface-0)', fontSize: 9, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                    {ghNotifCount > 99 ? '99+' : ghNotifCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div style={fade('left')} />
        <div style={fade('right')} />
      </div>
      <button
        onClick={toggleCompact}
        title={compact ? 'Show tab labels' : 'Compact (icons only)'}
        className="sush-icon-btn flex items-center justify-center"
        style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: `1px solid ${compact ? rgba(accent, 0.4) : 'var(--border-2)'}`, background: compact ? rgba(accent, 0.1) : 'var(--surface-2)', color: compact ? accent : 'var(--text-3)', cursor: 'pointer' }}
      >
        <Icon name="layout" size={15} />
      </button>
      <button
        onClick={onClose}
        title="Collapse panel"
        className="sush-icon-btn flex items-center justify-center"
        style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text-3)', cursor: 'pointer' }}
      >
        <Icon name="panel" size={15} />
      </button>
    </div>
  )
}
