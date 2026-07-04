import React, { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import Seducia from './Seducia'
import Browser from './Browser'
import GitHubTab from './GitHubTab'
import ClaudePanel from './ClaudePanel'
import { rgba, accentVars } from '../lib/ui'
import { renderMarkdown } from '../lib/markdown'
import { cliComplete } from '../lib/ai'
import { usePolling } from '../hooks/usePolling'

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

// Best-effort clipboard helper — uses Sush IPC, falls back to the web API.
function copyToClipboard(text) {
  const str = String(text ?? '')
  try {
    if (window.sush?.copyText) { window.sush.copyText(str); return }
  } catch {}
  try { navigator.clipboard?.writeText(str) } catch {}
}

function joinPath(parent, name) {
  const sep = parent.includes('\\') ? '\\' : '/'
  return `${parent.replace(/[\\/]+$/, '')}${sep}${name}`
}

function fileName(path) {
  return String(path || '').split(/[\\/]/).filter(Boolean).pop() || path
}

// ---- Git status code → colour + label ----
const STATUS_META = {
  M: { c: '#ffcb6b', t: 'M' },
  A: { c: '#c3e88d', t: 'A' },
  D: { c: '#ff5370', t: 'D' },
  R: { c: '#82aaff', t: 'R' },
  C: { c: '#82aaff', t: 'C' },
  U: { c: '#ff9aaa', t: 'U' },
  '??': { c: '#89ddff', t: 'U' }
}
function statusMeta(code) {
  return STATUS_META[code] || STATUS_META[code?.[0]] || { c: 'var(--text-3)', t: code || '?' }
}

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

function PanelEmpty({ icon, accent, children, hint }) {
  return (
    <div className="flex flex-col items-center justify-center" style={{ height: '100%', gap: 10, padding: 24, textAlign: 'center' }}>
      <span className="flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 12, background: rgba(accent, 0.1), border: `1px solid ${rgba(accent, 0.25)}`, color: accent }}>
        <Icon name={icon} size={20} />
      </span>
      <div style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 700 }}>{children}</div>
      {hint && <div style={{ color: 'var(--text-3)', fontSize: 11.5, maxWidth: 240 }}>{hint}</div>}
    </div>
  )
}

function TabHeader({ accent, icon, title, sub, onRefresh, right }) {
  return (
    <div className="flex items-center" style={{ gap: 9, padding: '10px 12px', borderBottom: '1px solid var(--surface-2)' }}>
      <Icon name={icon} size={14} color={accent} strokeWidth={2} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {sub && <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
      </span>
      {right}
      {onRefresh && (
        <button onClick={onRefresh} title="Refresh" className="sush-icon-btn flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border-2)', background: 'var(--surface-1)', color: 'var(--text-3)', cursor: 'pointer' }}>
          <Icon name="refresh" size={13} />
        </button>
      )}
    </div>
  )
}

// ---------- Changes + Git Commit Helper ----------
// One-shot via the logged-in CLI (no API key) — first line only, since the
// CLI may add a sign-off.
async function aiSuggestCommit(files, cwd) {
  const summary = files.slice(0, 20).map(f => `${f.status} ${f.path}`).join('\n')
  const prompt = `Write a concise git commit message (under 72 chars, imperative mood) for these changes:\n${summary}\nRespond with ONLY the commit message, no quotes or explanation.`
  const text = await cliComplete(prompt, { cwd })
  return text ? text.split('\n')[0].trim() : null
}

function ChangesTab({ accent, cwd, onOpenFile, settings = {} }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [staged, setStaged] = useState(new Set())
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [commitResult, setCommitResult] = useState(null)
  const [suggesting, setSuggesting] = useState(false)
  const [diff, setDiff] = useState(null)
  const [diffLoading, setDiffLoading] = useState(false)

  const toggleDiff = async () => {
    if (diff !== null) { setDiff(null); return }
    setDiffLoading(true)
    try {
      const res = await window.sush?.gitDiffStaged?.({ cwd })
      setDiff(res?.diff || (res?.ok ? '(nothing staged)' : res?.error || 'Could not read diff'))
    } catch (e) {
      setDiff(e.message)
    } finally {
      setDiffLoading(false)
    }
  }

  const load = () => {
    if (!cwd) { setData({ repo: false, files: [] }); setLoading(false); return }
    setLoading(true)
    window.sush?.gitStatus?.({ cwd })
      .then(res => { setData(res); setLoading(false) })
      .catch(() => { setData({ repo: false, files: [] }); setLoading(false) })
  }
  useEffect(() => { load(); setStaged(new Set()); setCommitMsg(''); setCommitResult(null) }, [cwd]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleStage = async (f) => {
    const key = f.path
    const isStaged = staged.has(key)
    if (isStaged) {
      await window.sush?.gitUnstage?.({ cwd, file: f.path })
      setStaged(prev => { const n = new Set(prev); n.delete(key); return n })
    } else {
      await window.sush?.gitStage?.({ cwd, file: f.path })
      setStaged(prev => new Set([...prev, key]))
    }
    load()
  }

  const stageAll = async () => {
    await window.sush?.gitStage?.({ cwd, file: '.' })
    setStaged(new Set((data?.files || []).map(f => f.path)))
    load()
  }

  const commit = async () => {
    if (!commitMsg.trim()) return
    setCommitting(true)
    setCommitResult(null)
    try {
      const res = await window.sush?.gitCommit?.({ cwd, message: commitMsg.trim() })
      setCommitResult(res)
      if (res?.ok) { setCommitMsg(''); setStaged(new Set()); load() }
    } catch (e) {
      setCommitResult({ ok: false, error: e.message })
    } finally {
      setCommitting(false)
    }
  }

  const suggestMessage = async () => {
    setSuggesting(true)
    try {
      const files = data?.files || []
      const text = await aiSuggestCommit(files, cwd)
      setCommitMsg(text || 'Could not suggest (is the Claude/Codex CLI installed and signed in?)')
    } catch {}
    finally { setSuggesting(false) }
  }

  if (loading) return <PanelEmpty icon="gitBranch" accent={accent}>Reading changes...</PanelEmpty>
  if (!data?.repo) return <PanelEmpty icon="gitBranch" accent={accent} hint="Open a session inside a git repository to see its working-tree changes here.">Not a git repository</PanelEmpty>

  const stagedFiles = (data.files || []).filter(f => {
    const rs = f.rawStatus || '  '
    return rs[0] !== ' ' && rs[0] !== '?'
  })
  const unstagedFiles = (data.files || []).filter(f => {
    const rs = f.rawStatus || '  '
    return rs === '??' || rs[1] !== ' '
  })

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="gitBranch"
        title={data.branch || 'changes'}
        sub={`${data.files.length} change${data.files.length === 1 ? '' : 's'}`}
        onRefresh={load}
        right={
          <button
            onClick={toggleDiff}
            title="Staged diff summary"
            className="sush-icon-btn flex items-center justify-center"
            style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${diff !== null ? rgba(accent, 0.4) : 'var(--border-2)'}`, background: diff !== null ? rgba(accent, 0.1) : 'var(--surface-1)', color: diff !== null ? accent : 'var(--text-3)', cursor: 'pointer' }}
          >
            <Icon name="fileText" size={13} />
          </button>
        }
      />
      {(diff !== null || diffLoading) && (
        <div style={{ borderBottom: '1px solid var(--border-1)', background: 'var(--surface-0)', maxHeight: 150, overflowY: 'auto' }} className="sush-scroll">
          <pre style={{ margin: 0, padding: '8px 10px', fontSize: 10.5, lineHeight: 1.6, color: 'var(--text-3)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {diffLoading ? 'Loading staged diff...' : diff}
          </pre>
        </div>
      )}
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 8, paddingBottom: 0 }}>
        {stagedFiles.length > 0 && (
          <>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: '#c3e88d', textTransform: 'uppercase', letterSpacing: 0.7, padding: '4px 6px 2px' }}>Staged ({stagedFiles.length})</div>
            {stagedFiles.map(f => {
              const meta = statusMeta(f.status)
              return (
                <div key={`s-${f.path}`} className="flex items-center" style={{ gap: 6, borderRadius: 8, background: 'rgba(195,232,141,0.06)', padding: '4px 6px', marginBottom: 2 }}>
                  <span style={{ width: 16, textAlign: 'center', fontSize: 10.5, fontWeight: 900, color: meta.c, flexShrink: 0 }}>{meta.t}</span>
                  <button onClick={() => onOpenFile(joinPath(data.dir || cwd, f.path))} title={f.path} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 0, fontWeight: 700 }}>{f.path}</button>
                  <button onClick={() => toggleStage(f)} title="Unstage" style={{ fontSize: 10, color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>−</button>
                </div>
              )
            })}
          </>
        )}
        {unstagedFiles.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 6px 2px' }}>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: '#ffcb6b', textTransform: 'uppercase', letterSpacing: 0.7, flex: 1 }}>Unstaged ({unstagedFiles.length})</span>
              <button onClick={stageAll} style={{ fontSize: 9.5, color: accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800 }}>Stage all</button>
            </div>
            {unstagedFiles.map(f => {
              const meta = statusMeta(f.status)
              return (
                <div key={`u-${f.path}`} className="flex items-center" style={{ gap: 6, padding: '4px 6px', marginBottom: 2 }}>
                  <span style={{ width: 16, textAlign: 'center', fontSize: 10.5, fontWeight: 900, color: meta.c, flexShrink: 0 }}>{meta.t}</span>
                  <button onClick={() => onOpenFile(joinPath(data.dir || cwd, f.path))} title={f.path} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 0 }}>{f.path}</button>
                  <button onClick={() => toggleStage(f)} title="Stage" style={{ fontSize: 10, color: accent, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0, fontWeight: 800 }}>+</button>
                </div>
              )
            })}
          </>
        )}
        {!data.files.length && <PanelEmpty icon="check" accent={accent}>Working tree clean</PanelEmpty>}
      </div>

      {/* Commit panel */}
      {data.repo && (
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-1)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {commitResult && (
            <div style={{ fontSize: 10.5, padding: '4px 8px', borderRadius: 6, background: commitResult.ok ? 'rgba(195,232,141,0.1)' : 'rgba(255,83,112,0.1)', color: commitResult.ok ? '#c3e88d' : '#ff5370', border: `1px solid ${commitResult.ok ? 'rgba(195,232,141,0.25)' : 'rgba(255,83,112,0.25)'}` }}>
              {commitResult.ok ? (commitResult.output || 'Committed!') : commitResult.error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 5 }}>
            <input
              value={commitMsg}
              onChange={e => setCommitMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && commit()}
              placeholder="Commit message..."
              spellCheck={false}
              style={{ flex: 1, padding: '5px 8px', background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 7, color: 'var(--text-1)', fontSize: 11.5, outline: 'none' }}
            />
            <button
              onClick={suggestMessage}
              disabled={suggesting}
              title="AI suggest"
              style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${rgba(accent, 0.3)}`, background: rgba(accent, 0.08), color: suggesting ? 'var(--text-5)' : accent, cursor: suggesting ? 'default' : 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
            >
              {suggesting ? '...' : '✦'}
            </button>
          </div>
          <button
            onClick={commit}
            disabled={!commitMsg.trim() || committing}
            style={{ padding: '6px 0', borderRadius: 7, border: 'none', background: (commitMsg.trim() && !committing) ? accent : 'var(--border-1)', color: (commitMsg.trim() && !committing) ? '#0a0a0a' : 'var(--text-5)', fontSize: 12, fontWeight: 800, cursor: (commitMsg.trim() && !committing) ? 'pointer' : 'default' }}
          >
            {committing ? 'Committing...' : 'Commit'}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- Files ----------
function FilesTab({ accent, cwd, onOpenFile }) {
  const [filter, setFilter] = useState('')
  if (!cwd) return <PanelEmpty icon="file" accent={accent}>No directory</PanelEmpty>
  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader accent={accent} icon="folder" title={fileName(cwd)} sub={cwd} />
      <div style={{ padding: '8px 10px 0' }}>
        <div className="sush-omni flex items-center" style={{ height: 30, gap: 7 }}>
          <Icon name="search" size={12} color="var(--text-4)" />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter files..."
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-1)', outline: 'none', fontSize: 11.5 }}
          />
          {filter && (
            <button onClick={() => setFilter('')} title="Clear" style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 8 }}>
        <TreeLevel path={cwd} depth={0} accent={accent} onOpenFile={onOpenFile} filter={filter} />
      </div>
    </div>
  )
}

function TreeLevel({ path, depth, accent, onOpenFile, filter }) {
  const [entries, setEntries] = useState(null)
  useEffect(() => {
    let alive = true
    window.sush?.listDir?.({ path }).then(res => { if (alive) setEntries(res.entries || []) }).catch(() => { if (alive) setEntries([]) })
    return () => { alive = false }
  }, [path])

  if (entries === null) return <div style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 10 + depth * 14, color: 'var(--text-3)', fontSize: 11.5 }}>...</div>
  // The filter only narrows the top level so you can still drill into subfolders.
  const shown = (depth === 0 && filter)
    ? entries.filter(e => e.name.toLowerCase().includes(filter.toLowerCase()))
    : entries
  if (!shown.length) return <div style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 10 + depth * 14, color: 'var(--text-3)', fontSize: 11.5 }}>{(depth === 0 && filter) ? 'no matches' : 'empty'}</div>
  return shown.map(entry => (
    <TreeNode key={entry.name} parent={path} entry={entry} depth={depth} accent={accent} onOpenFile={onOpenFile} />
  ))
}

function TreeNode({ parent, entry, depth, accent, onOpenFile }) {
  const [open, setOpen] = useState(false)
  const full = joinPath(parent, entry.name)
  return (
    <>
      <button
        onClick={() => (entry.dir ? setOpen(o => !o) : onOpenFile(full))}
        title={entry.name}
        className="flex items-center sush-tree-row"
        style={{ gap: 6, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', color: entry.dir ? 'var(--text-2)' : 'var(--text-3)', padding: '4px 6px', paddingLeft: 8 + depth * 14, borderRadius: 6, cursor: 'pointer' }}
      >
        {entry.dir
          ? <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} color="var(--text-3)" strokeWidth={2.4} />
          : <span style={{ width: 12, flexShrink: 0 }} />}
        <Icon name={entry.dir ? 'folder' : 'file'} size={13} color={entry.dir ? accent : 'var(--text-3)'} strokeWidth={2} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{entry.name}</span>
      </button>
      {entry.dir && open && <TreeLevel path={full} depth={depth + 1} accent={accent} onOpenFile={onOpenFile} />}
    </>
  )
}

// ---------- Tasks (.sush project ledger) ----------
const TASK_ROLES = ['Scout', 'Builder', 'Reviewer', 'Tester', 'Docs', 'Security']
const TASK_STATUSES = ['todo', 'doing', 'review', 'blocked', 'done']
const TASK_STATUS_META = {
  todo: { label: 'Todo', color: '#8b9bb0' },
  doing: { label: 'Doing', color: '#89ddff' },
  review: { label: 'Review', color: '#ffcb6b' },
  blocked: { label: 'Blocked', color: '#ff5370' },
  done: { label: 'Done', color: '#c3e88d' }
}

function nextTaskStatus(status) {
  const i = TASK_STATUSES.indexOf(status)
  return TASK_STATUSES[(i + 1) % TASK_STATUSES.length] || 'todo'
}

function parseTaskList(value) {
  return String(value || '')
    .split(/[\n,]+/)
    .map(v => v.trim())
    .filter(Boolean)
}

function TaskPill({ children, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 20, padding: '2px 7px', borderRadius: 999, border: `1px solid ${rgba(color, 0.35)}`, background: rgba(color, 0.08), color, fontSize: 10, fontWeight: 800 }}>
      {children}
    </span>
  )
}

function TasksTab({ accent, cwd, onRun }) {
  const [ledger, setLedger] = useState(null)
  const [form, setForm] = useState({ title: '', role: 'Builder', files: '', gate: '' })
  const [evidenceDrafts, setEvidenceDrafts] = useState({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    if (!cwd) { setLedger({ ok: true, tasks: [] }); return }
    window.sush?.tasksRead?.({ cwd })
      .then(res => setLedger(res || { ok: false, tasks: [], error: 'Task ledger unavailable' }))
      .catch(e => setLedger({ ok: false, tasks: [], error: e.message }))
  }, [cwd])

  useEffect(() => { load(); setEvidenceDrafts({}) }, [load])

  const tasks = ledger?.tasks || []
  const counts = TASK_STATUSES.reduce((acc, status) => ({ ...acc, [status]: tasks.filter(t => t.status === status).length }), {})

  const saveNew = async () => {
    const title = form.title.trim()
    if (!title || busy) return
    setBusy(true)
    try {
      const res = await window.sush?.tasksAdd?.({
        cwd,
        task: {
          title,
          role: form.role,
          files: parseTaskList(form.files),
          gate: form.gate.trim()
        }
      })
      if (res?.ok) {
        setForm({ title: '', role: form.role, files: '', gate: '' })
        setLedger(res)
      } else {
        setLedger(res || { ok: false, tasks, error: 'Could not save task' })
      }
    } finally {
      setBusy(false)
    }
  }

  const patchTask = async (task, patch) => {
    const res = await window.sush?.tasksUpdate?.({ cwd, id: task.id, patch })
    if (res?.ok) setLedger(res)
  }

  const deleteTask = async (task) => {
    const res = await window.sush?.tasksDelete?.({ cwd, id: task.id })
    if (res?.ok) setLedger(res)
  }

  const addEvidence = async (task) => {
    const line = String(evidenceDrafts[task.id] || '').trim()
    if (!line) return
    await patchTask(task, { evidence: [...(task.evidence || []), line] })
    setEvidenceDrafts(d => ({ ...d, [task.id]: '' }))
  }

  const runGate = async (task) => {
    const cmd = String(task.gate || '').trim()
    if (!cmd) return
    onRun?.(cmd)
    await patchTask(task, { evidence: [...(task.evidence || []), `Queued gate: ${cmd}`] })
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="check"
        title="Tasks"
        sub={ledger?.file ? `${tasks.length} task${tasks.length === 1 ? '' : 's'} - .sush/tasks.json` : 'Project ledger'}
        onRefresh={load}
      />

      <div style={{ padding: 10, borderBottom: '1px solid var(--border-1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') saveNew() }}
          placeholder="New task..."
          spellCheck={false}
          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-1)', background: 'var(--surface-0)', color: 'var(--text-1)', outline: 'none', fontSize: 12.5 }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8 }}>
          <select
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            style={{ minWidth: 0, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border-1)', background: 'var(--surface-0)', color: 'var(--text-2)', fontSize: 11.5, outline: 'none' }}
          >
            {TASK_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
          </select>
          <input
            value={form.files}
            onChange={e => setForm(f => ({ ...f, files: e.target.value }))}
            placeholder="file claims, globs"
            spellCheck={false}
            style={{ minWidth: 0, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border-1)', background: 'var(--surface-0)', color: 'var(--text-2)', fontSize: 11.5, outline: 'none' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 74px', gap: 8 }}>
          <input
            value={form.gate}
            onChange={e => setForm(f => ({ ...f, gate: e.target.value }))}
            placeholder="gate command, e.g. npm run build"
            spellCheck={false}
            style={{ minWidth: 0, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border-1)', background: 'var(--surface-0)', color: 'var(--text-2)', fontSize: 11.5, outline: 'none', fontFamily: 'monospace' }}
          />
          <button
            onClick={saveNew}
            disabled={!form.title.trim() || busy}
            style={{ borderRadius: 8, border: 'none', background: form.title.trim() && !busy ? accent : 'var(--border-1)', color: form.title.trim() && !busy ? '#090b0f' : 'var(--text-5)', fontSize: 11.5, fontWeight: 900, cursor: form.title.trim() && !busy ? 'pointer' : 'default' }}
          >
            Add
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        {!ledger ? (
          <PanelEmpty icon="check" accent={accent}>Loading...</PanelEmpty>
        ) : !ledger.ok ? (
          <PanelEmpty icon="check" accent={accent} hint={ledger.error}>Task ledger error</PanelEmpty>
        ) : !tasks.length ? (
          <PanelEmpty icon="check" accent={accent} hint="Tasks live in .sush/tasks.json for this workspace. Add one with a role, file claim, and optional gate command.">No project tasks</PanelEmpty>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {TASK_STATUSES.map(status => (
                <TaskPill key={status} color={TASK_STATUS_META[status].color}>{TASK_STATUS_META[status].label}: {counts[status] || 0}</TaskPill>
              ))}
            </div>
            {tasks.map(task => {
              const meta = TASK_STATUS_META[task.status] || TASK_STATUS_META.todo
              const evidenceDraft = evidenceDrafts[task.id] || ''
              return (
                <div key={task.id} style={{ border: '1px solid var(--border-1)', background: 'var(--surface-2)', borderRadius: 10, padding: 10, marginBottom: 9 }}>
                  <div className="flex items-start" style={{ gap: 9 }}>
                    <button
                      onClick={() => patchTask(task, { status: nextTaskStatus(task.status) })}
                      title="Cycle status"
                      style={{ flexShrink: 0, marginTop: 1, width: 26, height: 26, borderRadius: 8, border: `1px solid ${rgba(meta.color, 0.4)}`, background: rgba(meta.color, 0.09), color: meta.color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Icon name={task.status === 'done' ? 'check' : 'arrowRight'} size={12} />
                    </button>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, lineHeight: 1.35, fontWeight: 850, color: 'var(--text-1)', wordBreak: 'break-word' }}>{task.title}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                        <TaskPill color={meta.color}>{meta.label}</TaskPill>
                        <TaskPill color={accent}>{task.role || 'Builder'}</TaskPill>
                        {task.files?.length ? <TaskPill color="#82aaff">{task.files.length} file claim{task.files.length === 1 ? '' : 's'}</TaskPill> : null}
                        {task.gate ? <TaskPill color="#c3e88d">gate</TaskPill> : null}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteTask(task)}
                      title="Delete task"
                      style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>

                  {task.files?.length ? (
                    <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'monospace', lineHeight: 1.5, wordBreak: 'break-word' }}>
                      {task.files.join(', ')}
                    </div>
                  ) : null}

                  {task.gate ? (
                    <button
                      onClick={() => runGate(task)}
                      style={{ marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', borderRadius: 8, border: `1px solid ${rgba(accent, 0.28)}`, background: rgba(accent, 0.07), color: accent, cursor: 'pointer', fontSize: 11, fontWeight: 800, textAlign: 'left' }}
                    >
                      <Icon name="rocket" size={12} />
                      <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{task.gate}</span>
                    </button>
                  ) : null}

                  {task.evidence?.length ? (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {task.evidence.slice(-3).map((line, i) => (
                        <div key={`${task.id}-e-${i}`} style={{ fontSize: 10.5, color: 'var(--text-3)', lineHeight: 1.45, padding: '4px 6px', borderRadius: 6, background: 'var(--surface-0)', border: '1px solid var(--border-1)' }}>{line}</div>
                      ))}
                    </div>
                  ) : null}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 58px', gap: 6, marginTop: 8 }}>
                    <input
                      value={evidenceDraft}
                      onChange={e => setEvidenceDrafts(d => ({ ...d, [task.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addEvidence(task) }}
                      placeholder="Add evidence..."
                      spellCheck={false}
                      style={{ minWidth: 0, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border-1)', background: 'var(--surface-0)', color: 'var(--text-2)', fontSize: 11, outline: 'none' }}
                    />
                    <button
                      onClick={() => addEvidence(task)}
                      disabled={!evidenceDraft.trim()}
                      style={{ borderRadius: 7, border: '1px solid var(--border-1)', background: evidenceDraft.trim() ? rgba(accent, 0.1) : 'var(--surface-1)', color: evidenceDraft.trim() ? accent : 'var(--text-5)', fontSize: 10.5, fontWeight: 850, cursor: evidenceDraft.trim() ? 'pointer' : 'default' }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

// ---------- Memory (BridgeMemory-style) ----------
function renderWithLinks(content, accent, onLink) {
  const parts = String(content || '').split(/(\[\[[^\]]+\]\])/g)
  return parts.map((part, i) => {
    const m = part.match(/^\[\[([^\]]+)\]\]$/)
    if (!m) return <span key={i}>{part}</span>
    const name = m[1].trim()
    return (
      <button
        key={i}
        onClick={() => onLink(name)}
        style={{ color: accent, background: rgba(accent, 0.12), border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 6, padding: '0 5px', margin: '0 1px', cursor: 'pointer', fontWeight: 700, fontSize: 'inherit', fontFamily: 'inherit' }}
      >
        {name}
      </button>
    )
  })
}

function MemoryTab({ accent, cwd }) {
  const [notes, setNotes] = useState(null)
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const createRef = useRef(null)

  const refresh = () => {
    if (!cwd) { setNotes([]); return }
    window.sush?.memoryList?.({ cwd }).then(res => setNotes(res.notes || [])).catch(() => setNotes([]))
  }
  useEffect(() => { refresh(); setSelected(null) }, [cwd]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (creating) createRef.current?.focus() }, [creating])

  const openNote = (name) => {
    window.sush?.memoryRead?.({ cwd, name }).then(res => setSelected(res)).catch(() => {})
  }
  const createNote = (name) => {
    const safe = String(name || '').trim()
    if (!safe) return
    const content = `# ${safe}\n\nLink notes with [[wikilinks]].\n`
    window.sush?.memoryWrite?.({ cwd, name: safe, content }).then(() => {
      setCreating(false); setNewName(''); refresh(); openNote(safe)
    })
  }

  if (selected) {
    return (
      <div className="flex flex-col" style={{ height: '100%' }}>
        <TabHeader
          accent={accent}
          icon="book"
          title={selected.name}
          sub=".sushmemory"
          right={
            <button onClick={() => setSelected(null)} title="Back" className="sush-icon-btn flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border-2)', background: 'var(--surface-1)', color: 'var(--text-3)', cursor: 'pointer' }}>
              <Icon name="chevronRight" size={13} style={{ transform: 'rotate(180deg)' }} />
            </button>
          }
        />
        <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 14 }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12.5, lineHeight: 1.65, color: 'var(--text-2)', fontFamily: 'inherit' }}>
            {renderWithLinks(selected.content, accent, (name) => {
              const exists = (notes || []).some(n => n.name.toLowerCase() === name.toLowerCase())
              exists ? openNote(name) : createNote(name)
            })}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="book"
        title="Memory"
        sub={notes ? `${notes.length} note${notes.length === 1 ? '' : 's'} · .sushmemory` : 'BridgeMemory'}
        right={
          <button onClick={() => setCreating(true)} title="New note" className="sush-icon-btn flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${rgba(accent, 0.35)}`, background: rgba(accent, 0.1), color: accent, cursor: 'pointer' }}>
            <Icon name="plus" size={14} strokeWidth={2.4} />
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        {creating && (
          <div className="sush-omni flex items-center" style={{ height: 38, gap: 8, marginBottom: 10 }}>
            <Icon name="book" size={14} color={accent} />
            <input
              ref={createRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createNote(newName); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
              placeholder="note name..."
              spellCheck={false}
              style={{ flex: 1, minWidth: 0, height: '100%', background: 'transparent', border: 'none', color: 'var(--text-1)', outline: 'none', fontSize: 12.5 }}
            />
          </div>
        )}
        {notes === null ? (
          <PanelEmpty icon="book" accent={accent}>Loading...</PanelEmpty>
        ) : notes.length ? notes.map(note => (
          <button
            key={note.name}
            onClick={() => openNote(note.name)}
            className="sush-row flex items-center"
            style={{ gap: 10, width: '100%', textAlign: 'left', border: '1px solid var(--border-1)', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--text-2)', padding: '9px 11px', marginBottom: 8, cursor: 'pointer' }}
          >
            <Icon name="book" size={15} color={accent} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</span>
              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                {note.links?.length ? `${note.links.length} link${note.links.length === 1 ? '' : 's'} → ${note.links.slice(0, 3).join(', ')}` : (note.excerpt || 'empty note')}
              </span>
            </span>
            <Icon name="network" size={13} color={note.links?.length ? accent : 'var(--text-5)'} />
          </button>
        )) : (
          <PanelEmpty icon="book" accent={accent} hint="A local-first knowledge graph for this directory. Notes are markdown in .sushmemory, linked with [[wikilinks]].">No notes yet</PanelEmpty>
        )}
      </div>
    </div>
  )
}

// ---------- Scripts (npm/package.json) ----------
function ScriptsTab({ accent, cwd, onRun }) {
  const [data, setData] = useState(null)

  const load = () => {
    if (!cwd) { setData({ scripts: {} }); return }
    window.sush?.getNpmScripts?.({ cwd })
      .then(res => setData(res))
      .catch(() => setData({ scripts: {} }))
  }

  useEffect(() => { load() }, [cwd]) // eslint-disable-line react-hooks/exhaustive-deps

  const scripts = data?.scripts ?? {}
  const keys = Object.keys(scripts)

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader accent={accent} icon="rocket" title="npm Scripts" sub={data?.name || 'package.json'} onRefresh={load} />
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        {!data ? (
          <PanelEmpty icon="rocket" accent={accent}>Loading...</PanelEmpty>
        ) : !keys.length ? (
          <PanelEmpty icon="rocket" accent={accent} hint="No scripts found in package.json. Navigate to a project directory first.">No scripts</PanelEmpty>
        ) : keys.map(name => (
          <button
            key={name}
            onClick={() => onRun(`npm run ${name}`)}
            className="sush-row flex items-center"
            style={{ gap: 10, width: '100%', textAlign: 'left', border: '1px solid var(--border-1)', borderRadius: 9, background: 'var(--surface-2)', color: 'var(--text-2)', padding: '8px 11px', marginBottom: 7, cursor: 'pointer' }}
          >
            <Icon name="arrowRight" size={13} color={accent} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: accent }}>{name}</span>
              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', marginTop: 2 }}>{scripts[name]}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- Command History + Explainer ----------
// One-shot via the logged-in CLI (no API key).
async function explainCommand(cmd) {
  const prompt = `Explain this shell command in 1-2 concise sentences for a developer. Be direct.\n\nCommand: ${cmd}`
  return cliComplete(prompt)
}

function HistoryTab({ accent, history, onRun, settings = {} }) {
  const [search, setSearch] = useState('')
  const [explanations, setExplanations] = useState({})
  const [explaining, setExplaining] = useState(new Set())
  const displayed = history.filter(cmd => !search || cmd.toLowerCase().includes(search.toLowerCase())).slice().reverse()

  const explain = async (cmd) => {
    if (explanations[cmd]) { setExplanations(p => { const n = { ...p }; delete n[cmd]; return n }); return }
    setExplaining(p => new Set([...p, cmd]))
    try {
      const text = await explainCommand(cmd)
      setExplanations(p => ({ ...p, [cmd]: text || 'Could not explain (is the Claude/Codex CLI installed and signed in?)' }))
    } catch (e) {
      setExplanations(p => ({ ...p, [cmd]: `Error: ${e.message}` }))
    } finally {
      setExplaining(p => { const n = new Set(p); n.delete(cmd); return n })
    }
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader accent={accent} icon="clock" title="History" sub={`${history.length} commands`} />
      <div style={{ padding: '8px 10px 0' }}>
        <div className="sush-omni flex items-center" style={{ height: 34, gap: 8 }}>
          <Icon name="search" size={13} color="var(--text-4)" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter history..."
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-1)', outline: 'none', fontSize: 12 }}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        {!displayed.length ? (
          <PanelEmpty icon="clock" accent={accent} hint="Commands you run in the active session will appear here.">No history yet</PanelEmpty>
        ) : displayed.map((cmd, i) => (
          <div key={i} style={{ marginBottom: 5 }}>
            <div className="flex items-center" style={{ gap: 6, border: '1px solid var(--border-1)', borderRadius: 8, background: 'var(--surface-2)', padding: '5px 6px 5px 10px' }}>
              <Icon name="chevronRight" size={11} color="var(--text-5)" />
              <button
                onClick={() => onRun(cmd)}
                title={`Run: ${cmd}`}
                style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 0 }}
              >
                {cmd}
              </button>
              <button
                onClick={() => copyToClipboard(cmd)}
                title="Copy command"
                style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 6, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="copy" size={11} />
              </button>
              <button
                onClick={() => explain(cmd)}
                title="Explain this command"
                style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 6, border: `1px solid ${explanations[cmd] ? rgba(accent, 0.4) : 'var(--border-2)'}`, background: explanations[cmd] ? rgba(accent, 0.1) : 'transparent', color: explanations[cmd] ? accent : 'var(--text-5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}
              >
                {explaining.has(cmd) ? '...' : '?'}
              </button>
            </div>
            {explanations[cmd] && (
              <div style={{ padding: '6px 10px 6px 12px', fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.55, borderLeft: `2px solid ${rgba(accent, 0.35)}`, marginLeft: 4, marginTop: 3 }}>
                {explanations[cmd]}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Port Manager ----------
// Individual well-known dev ports plus inclusive ranges. Ranges catch the many
// fallback ports a dev server picks when its default is busy (e.g. Vite walking
// 5173 → 5180+, Next/CRA 3000 → 3005+), which a fixed list always misses.
const DEV_PORTS = new Set([4200, 4321, 6006, 7070, 8888, 9229, 24678])
const DEV_RANGES = [
  [3000, 3010], [4000, 4010], [5000, 5010], [5170, 5199],
  [7000, 7010], [8000, 8010], [8080, 8090], [9000, 9010]
]
function isDevPort(p) {
  if (DEV_PORTS.has(p)) return true
  return DEV_RANGES.some(([lo, hi]) => p >= lo && p <= hi)
}

// Ports that actually speak HTTP in a browser. Used to decide whether to show
// the "open in browser" shortcut — most listeners (SSH, databases, etc.) don't.
const WEB_PORTS = new Set([80, 443, 8080, 8443, 3000, 5000, 8000])
function isWebPort(port, processName) {
  const p = Number(port)
  if (WEB_PORTS.has(p)) return true
  if (isDevPort(p)) return true
  const name = (processName || '').toLowerCase()
  return ['nginx', 'apache', 'httpd', 'caddy', 'node', 'vite', 'next', 'nuxt'].some(k => name.includes(k))
}

const APP_KEYWORDS = ['node', 'bun', 'deno', 'python', 'python3', 'ruby', 'go', 'java', 'php', 'dotnet', 'vite', 'next', 'nuxt', 'cargo', 'uvicorn', 'gunicorn', 'puma', 'rails', 'flask', 'django', 'fastapi', 'express', 'esbuild']
const SVC_KEYWORDS = ['nginx', 'apache', 'httpd', 'postgres', 'mysqld', 'redis', 'mongod', 'rabbitmq', 'elastic', 'kafka', 'zookeeper', 'memcached', 'grafana', 'prometheus', 'caddy']

function categorizePort(port, processName) {
  const p = Number(port)
  const name = (processName || '').toLowerCase()
  if (p < 1024) return 'system'
  if (SVC_KEYWORDS.some(k => name.includes(k))) return 'service'
  if (APP_KEYWORDS.some(k => name.includes(k))) return 'app'
  if (isDevPort(p)) return 'app'
  return 'system'
}

const CAT = {
  app:     { label: 'App',     color: '#c3e88d', bg: 'rgba(195,232,141,0.1)', border: 'rgba(195,232,141,0.22)' },
  service: { label: 'Service', color: '#82aaff', bg: 'rgba(130,170,255,0.1)', border: 'rgba(130,170,255,0.22)' },
  system:  { label: 'System',  color: 'var(--text-3)', bg: 'rgba(105,115,125,0.1)', border: 'rgba(105,115,125,0.22)' }
}

const FILTER_OPTS = ['all', 'app', 'service', 'system']

function PortsTab({ accent, onRun }) {
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [killing, setKilling] = useState(new Set())

  const load = useCallback(() => {
    window.sush?.getPorts?.()
      .then(res => setData(res))
      .catch(() => setData({ ok: false, ports: [] }))
  }, [])

  usePolling(load, 4000)

  const killPort = useCallback(async (pid, port) => {
    setKilling(prev => new Set([...prev, port]))
    try {
      if (pid) {
        await window.sush?.killPid?.({ pid })
      } else {
        onRun?.(`kill ${port}`)
      }
      setTimeout(load, 600)
    } finally {
      setKilling(prev => { const n = new Set(prev); n.delete(port); return n })
    }
  }, [load, onRun])

  const openInBrowser = useCallback((port) => {
    window.sush?.openExternal?.({ url: `http://localhost:${port}` })
  }, [])

  if (!data) return <PanelEmpty icon="ports" accent={accent}>Scanning ports...</PanelEmpty>

  const ports = data.ports ?? []
  const counts = { all: ports.length }
  for (const f of ['app', 'service', 'system']) {
    counts[f] = ports.filter(p => categorizePort(p.port, p.process) === f).length
  }
  const q = search.trim().toLowerCase()
  const filtered = ports.filter(p => {
    if (filter !== 'all' && categorizePort(p.port, p.process) !== filter) return false
    if (q && !String(p.port).includes(q) && !(p.process || '').toLowerCase().includes(q)) return false
    return true
  })

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="ports"
        title="Port Manager"
        sub={`${ports.length} listening · auto-refreshes`}
        onRefresh={load}
      />

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 5, padding: '8px 10px 4px', borderBottom: '1px solid var(--surface-2)' }}>
        {FILTER_OPTS.map(f => {
          const active = filter === f
          const catInfo = f !== 'all' ? CAT[f] : null
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '3px 9px',
                borderRadius: 7,
                border: `1px solid ${active ? (catInfo?.border ?? rgba(accent, 0.45)) : 'var(--border-2)'}`,
                background: active ? (catInfo?.bg ?? rgba(accent, 0.12)) : 'transparent',
                color: active ? (catInfo?.color ?? accent) : 'var(--text-4)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {f === 'all' ? `All (${counts.all})` : `${CAT[f].label} (${counts[f]})`}
            </button>
          )
        })}
      </div>

      {/* Search filter */}
      <div style={{ padding: '6px 10px 2px' }}>
        <div className="sush-omni flex items-center" style={{ height: 30, gap: 7 }}>
          <Icon name="search" size={12} color="var(--text-4)" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by port or process..."
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-1)', outline: 'none', fontSize: 11.5 }}
          />
          {search && (
            <button onClick={() => setSearch('')} title="Clear" style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 8 }}>
        {!filtered.length ? (
          <PanelEmpty
            icon="ports"
            accent={accent}
            hint={q ? `No ports match "${search}".` : filter !== 'all' ? `No ${filter} ports are currently listening.` : 'No listening ports found.'}
          >
            No {filter === 'all' ? '' : CAT[filter]?.label + ' '}ports
          </PanelEmpty>
        ) : filtered.map(p => {
          const cat = categorizePort(p.port, p.process)
          const c = CAT[cat]
          const isKilling = killing.has(p.port)
          const isHttp = isWebPort(p.port, p.process)

          return (
            <div
              key={`${p.port}-${p.pid ?? 'x'}`}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', marginBottom: 5, border: '1px solid var(--border-1)', borderRadius: 9, background: 'var(--surface-2)' }}
            >
              {/* Port */}
              <span style={{ fontSize: 13.5, fontWeight: 800, color: accent, minWidth: 44, flexShrink: 0, fontFamily: 'monospace' }}>
                {p.port}
              </span>

              {/* Process info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: p.process ? 'var(--text-2)' : 'var(--text-5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.process || 'unknown'}
                </div>
                {p.pid && (
                  <div style={{ fontSize: 9.5, color: 'var(--text-5)', marginTop: 1 }}>PID {p.pid} · {p.protocol}</div>
                )}
              </div>

              {/* Category badge */}
              <span style={{ fontSize: 9.5, fontWeight: 800, color: c.color, background: c.bg, border: `1px solid ${c.border}`, padding: '2px 6px', borderRadius: 5, flexShrink: 0, letterSpacing: 0.3 }}>
                {c.label}
              </span>

              {/* Open in browser */}
              {isHttp && (
                <button
                  onClick={() => openInBrowser(p.port)}
                  title={`Open localhost:${p.port} in browser`}
                  style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, border: `1px solid ${rgba(accent, 0.25)}`, background: rgba(accent, 0.07), color: accent, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="globe" size={12} />
                </button>
              )}

              {/* Kill */}
              <button
                onClick={() => killPort(p.pid, p.port)}
                disabled={isKilling}
                title={`Kill port ${p.port}`}
                style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, border: '1px solid rgba(255,83,112,0.2)', background: isKilling ? 'transparent' : 'rgba(255,83,112,0.07)', color: isKilling ? '#3f2020' : '#ff5370', cursor: isKilling ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="stop" size={11} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Command Snippets ----------
const SNIPPETS_KEY = 'sush-snippets'

function loadSnippets() {
  try { return JSON.parse(localStorage.getItem(SNIPPETS_KEY) ?? '[]') } catch { return [] }
}

function SnippetsTab({ accent, onRun }) {
  const [snippets, setSnippets] = useState(loadSnippets)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCmd, setNewCmd] = useState('')
  const nameRef = useRef(null)
  const cmdRef = useRef(null)

  useEffect(() => { if (creating) nameRef.current?.focus() }, [creating])

  const persist = (next) => {
    setSnippets(next)
    localStorage.setItem(SNIPPETS_KEY, JSON.stringify(next))
  }

  const addSnippet = () => {
    const name = newName.trim()
    const command = newCmd.trim()
    if (!name || !command) return
    persist([...snippets, { id: `snip-${Date.now()}`, name, command }])
    setCreating(false)
    setNewName('')
    setNewCmd('')
  }

  const deleteSnippet = (id) => persist(snippets.filter(s => s.id !== id))

  const cancel = () => { setCreating(false); setNewName(''); setNewCmd('') }

  const displayed = snippets.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.command.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="layers"
        title="Snippets"
        sub={`${snippets.length} saved command${snippets.length !== 1 ? 's' : ''}`}
        right={
          <button
            onClick={() => setCreating(true)}
            title="New snippet"
            className="sush-icon-btn flex items-center justify-center"
            style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${rgba(accent, 0.35)}`, background: rgba(accent, 0.1), color: accent, cursor: 'pointer' }}
          >
            <Icon name="plus" size={14} strokeWidth={2.4} />
          </button>
        }
      />

      {creating && (
        <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--border-1)', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <input
            ref={nameRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); cmdRef.current?.focus() } if (e.key === 'Escape') cancel() }}
            placeholder="Name (e.g. Start dev server)..."
            spellCheck={false}
            style={{ padding: '6px 9px', background: 'var(--surface-2)', border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 7, color: 'var(--text-1)', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' }}
          />
          <input
            ref={cmdRef}
            value={newCmd}
            onChange={e => setNewCmd(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addSnippet(); if (e.key === 'Escape') cancel() }}
            placeholder="Command (e.g. npm run dev)..."
            spellCheck={false}
            style={{ padding: '6px 9px', background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 7, color: 'var(--text-2)', fontSize: 11.5, fontFamily: 'monospace', outline: 'none', width: '100%', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={cancel} style={{ padding: '4px 11px', borderRadius: 6, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
            <button onClick={addSnippet} disabled={!newName.trim() || !newCmd.trim()} style={{ padding: '4px 11px', borderRadius: 6, border: `1px solid ${rgba(accent, 0.4)}`, background: rgba(accent, 0.12), color: accent, fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: (!newName.trim() || !newCmd.trim()) ? 0.5 : 1 }}>Save</button>
          </div>
        </div>
      )}

      <div style={{ padding: '8px 10px 0' }}>
        <div className="sush-omni flex items-center" style={{ height: 34, gap: 8 }}>
          <Icon name="search" size={13} color="var(--text-4)" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search snippets..."
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-1)', outline: 'none', fontSize: 12 }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        {!displayed.length ? (
          <PanelEmpty
            icon="layers"
            accent={accent}
            hint={snippets.length ? 'No snippets match your search.' : 'Save frequently-used commands for quick access. Press + to create one.'}
          >
            {snippets.length ? 'No matches' : 'No snippets yet'}
          </PanelEmpty>
        ) : displayed.map(s => (
          <div
            key={s.id}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 6, border: '1px solid var(--border-1)', borderRadius: 9, background: 'var(--surface-2)' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'monospace', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.command}</div>
            </div>
            <button
              onClick={() => copyToClipboard(s.command)}
              title="Copy command"
              style={{ width: 27, height: 27, flexShrink: 0, borderRadius: 7, border: '1px solid var(--border-1)', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="copy" size={12} />
            </button>
            <button
              onClick={() => onRun?.(s.command)}
              title="Run"
              style={{ width: 27, height: 27, flexShrink: 0, borderRadius: 7, border: `1px solid ${rgba(accent, 0.3)}`, background: rgba(accent, 0.08), color: accent, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="arrowRight" size={13} />
            </button>
            <button
              onClick={() => deleteSnippet(s.id)}
              title="Delete"
              style={{ width: 27, height: 27, flexShrink: 0, borderRadius: 7, border: '1px solid var(--border-1)', background: 'transparent', color: 'var(--text-5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="trash" size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function DockerTab({ accent, onRun }) {
  const [data, setData] = useState(null)
  const [logs, setLogs] = useState({})
  const [loadingLogs, setLoadingLogs] = useState(new Set())
  const [stopping, setStopping] = useState(new Set())

  const load = useCallback(() => {
    window.sush?.dockerPs?.()
      .then(res => setData(res))
      .catch(() => setData({ ok: false, containers: [], error: 'Docker not available' }))
  }, [])

  usePolling(load, 5000)

  const fetchLogs = async (id) => {
    if (loadingLogs.has(id)) return
    if (logs[id]) { setLogs(p => { const n = { ...p }; delete n[id]; return n }); return }
    setLoadingLogs(prev => new Set([...prev, id]))
    try {
      const res = await window.sush?.dockerLogs?.({ id, tail: 80 })
      setLogs(p => ({ ...p, [id]: res?.logs || '(no logs)' }))
    } catch {}
    finally { setLoadingLogs(prev => { const n = new Set(prev); n.delete(id); return n }) }
  }

  const stop = async (id) => {
    setStopping(prev => new Set([...prev, id]))
    try {
      await window.sush?.dockerStop?.({ id })
      setTimeout(load, 800)
    } catch {}
    finally { setStopping(prev => { const n = new Set(prev); n.delete(id); return n }) }
  }

  const shell = (id) => onRun?.(`docker exec -it ${id} /bin/sh`)

  if (!data) return <PanelEmpty icon="layers" accent={accent}>Connecting to Docker...</PanelEmpty>
  if (!data.ok && data.error) return <PanelEmpty icon="layers" accent={accent} hint={data.error}>Docker unavailable</PanelEmpty>

  const containers = data.containers ?? []

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader accent={accent} icon="layers" title="Docker" sub={`${containers.length} running container${containers.length !== 1 ? 's' : ''}`} onRefresh={load} />
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 8 }}>
        {!containers.length ? (
          <PanelEmpty icon="layers" accent={accent} hint="No containers are currently running.">No containers</PanelEmpty>
        ) : containers.map(c => {
          const id = c.ID || c.Names || 'unknown'
          const name = c.Names || c.Name || id
          const image = c.Image || ''
          const status = c.Status || c.State || ''
          const ports = c.Ports || ''
          const hostPort = (ports.match(/:(\d+)->/) || [])[1]
          const isStopping = stopping.has(id)
          const hasLogs = !!logs[id]
          const isLoadingLogs = loadingLogs.has(id)

          return (
            <div key={id} style={{ marginBottom: 8, border: '1px solid var(--border-1)', borderRadius: 9, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#c3e88d', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{image}</div>
                </div>
                {hostPort && (
                  <button onClick={() => window.sush?.openExternal?.({ url: `http://localhost:${hostPort}` })} title={`Open localhost:${hostPort}`} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${rgba(accent, 0.25)}`, background: rgba(accent, 0.07), color: accent, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="globe" size={12} />
                  </button>
                )}
                <button onClick={() => copyToClipboard(id)} title="Copy container ID" style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="copy" size={11} />
                </button>
                <button onClick={() => fetchLogs(id)} title={hasLogs ? 'Hide logs' : 'View logs'} disabled={isLoadingLogs} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${hasLogs ? rgba(accent, 0.4) : 'var(--border-2)'}`, background: hasLogs ? rgba(accent, 0.1) : 'transparent', color: hasLogs ? accent : 'var(--text-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>
                  {isLoadingLogs ? '...' : '≡'}
                </button>
                <button onClick={() => shell(id)} title="Open shell" style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="terminal" size={12} />
                </button>
                <button onClick={() => stop(id)} disabled={isStopping} title="Stop container" style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(255,83,112,0.2)', background: 'rgba(255,83,112,0.06)', color: isStopping ? '#3f2020' : '#ff5370', cursor: isStopping ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="stop" size={11} />
                </button>
              </div>
              {ports && <div style={{ padding: '0 9px 5px', fontSize: 9.5, color: 'var(--text-4)', fontFamily: 'monospace' }}>{ports}</div>}
              {status && <div style={{ padding: '0 9px 5px', fontSize: 9, color: 'var(--text-5)' }}>{status}</div>}
              {hasLogs && (
                <pre style={{ margin: 0, padding: '8px 10px', background: 'var(--surface-0)', borderTop: '1px solid var(--surface-2)', fontSize: 10, lineHeight: 1.65, color: 'var(--text-3)', maxHeight: 160, overflowY: 'auto', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {logs[id]}
                </pre>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EnvManagerTab({ accent, cwd }) {
  const [pairs, setPairs] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState(null)
  const [visible, setVisible] = useState(new Set())
  const [envPath, setEnvPath] = useState(null)
  // The original file lines, kept so comments and ordering survive a round-trip.
  const rawLinesRef = useRef([])

  const load = useCallback(async () => {
    if (!cwd) return
    const p = cwd.includes('\\') ? `${cwd}\\.env` : `${cwd}/.env`
    setEnvPath(p)
    setLoading(true)
    try {
      const res = await window.sush?.readFile?.({ path: p })
      if (res?.ok) {
        rawLinesRef.current = res.content.split('\n')
        const parsed = res.content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#')).map((line, i) => {
          const eq = line.indexOf('=')
          if (eq < 0) return { id: i, key: line.trim(), value: '' }
          return { id: i, key: line.slice(0, eq).trim(), value: unquoteEnv(line.slice(eq + 1)) }
        })
        setPairs(parsed)
      } else {
        rawLinesRef.current = []
        setPairs([])
      }
    } catch {}
    finally { setLoading(false) }
  }, [cwd])

  useEffect(() => { load() }, [load])

  // Serialize while preserving comments/blank lines and original ordering.
  const serialize = () => {
    const live = pairs.filter(p => p.key.trim())
    const byKey = new Map(live.map(p => [p.key.trim(), p]))
    const used = new Set()
    const out = []
    for (const line of rawLinesRef.current) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) { out.push(line); continue }
      const eq = line.indexOf('=')
      const key = (eq < 0 ? trimmed : line.slice(0, eq).trim())
      if (byKey.has(key)) { out.push(`${key}=${byKey.get(key).value}`); used.add(key) }
      // keys removed in the editor are dropped
    }
    for (const p of live) {
      if (!used.has(p.key.trim())) out.push(`${p.key.trim()}=${p.value}`)
    }
    return out.join('\n').replace(/\n*$/, '') + '\n'
  }

  const save = async () => {
    if (!envPath) return
    setSaving(true); setSaveResult(null)
    const content = serialize()
    try {
      const res = await window.sush?.writeFile?.({ path: envPath, content })
      setSaveResult(res?.ok ? 'Saved!' : (res?.error || 'Save failed'))
      if (res?.ok) rawLinesRef.current = content.split('\n')
    } catch (e) {
      setSaveResult(e.message)
    } finally {
      setSaving(false)
      setTimeout(() => setSaveResult(null), 2000)
    }
  }

  const copyEnv = () => copyToClipboard(serialize())

  const addPair = () => setPairs(p => [...p, { id: Date.now(), key: '', value: '' }])
  const delPair = (id) => setPairs(p => p.filter(x => x.id !== id))
  const setPairKey = (id, key) => setPairs(p => p.map(x => x.id === id ? { ...x, key } : x))
  const setPairValue = (id, val) => setPairs(p => p.map(x => x.id === id ? { ...x, value: val } : x))
  const toggleVisible = (id) => setVisible(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  if (!cwd) return <PanelEmpty icon="key" accent={accent}>No active directory</PanelEmpty>

  const isSecret = (key) => /key|secret|token|password|pass|pwd|auth|api_key/i.test(key)

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="key"
        title=".env Manager"
        sub={envPath ? envPath.split(/[\\/]/).slice(-2).join('/') : '.env'}
        onRefresh={load}
        right={
          <button onClick={addPair} title="Add variable" className="sush-icon-btn flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${rgba(accent, 0.35)}`, background: rgba(accent, 0.1), color: accent, cursor: 'pointer' }}>
            <Icon name="plus" size={14} strokeWidth={2.4} />
          </button>
        }
      />

      {loading && <PanelEmpty icon="key" accent={accent}>Loading .env...</PanelEmpty>}

      {!loading && (
        <>
          <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 8 }}>
            {!pairs.length ? (
              <PanelEmpty icon="key" accent={accent} hint="No .env found. Press + to create variables.">No variables</PanelEmpty>
            ) : pairs.map(p => {
              const secret = isSecret(p.key)
              const shown = visible.has(p.id)
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                  <input
                    value={p.key}
                    onChange={e => setPairKey(p.id, e.target.value)}
                    placeholder="KEY"
                    spellCheck={false}
                    style={{ width: 110, padding: '4px 7px', background: 'var(--surface-2)', border: `1px solid ${rgba(accent, 0.2)}`, borderRadius: 6, color: accent, fontSize: 11, fontFamily: 'monospace', outline: 'none', fontWeight: 700 }}
                  />
                  <span style={{ color: 'var(--text-5)', flexShrink: 0 }}>=</span>
                  <input
                    value={p.value}
                    onChange={e => setPairValue(p.id, e.target.value)}
                    type={secret && !shown ? 'password' : 'text'}
                    placeholder="value"
                    spellCheck={false}
                    style={{ flex: 1, minWidth: 0, padding: '4px 7px', background: 'var(--surface-0)', border: '1px solid var(--border-1)', borderRadius: 6, color: 'var(--text-2)', fontSize: 11, fontFamily: 'monospace', outline: 'none' }}
                  />
                  {secret && (
                    <button onClick={() => toggleVisible(p.id)} title={shown ? 'Hide' : 'Show'} style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={shown ? 'eyeOff' : 'eye'} size={11} />
                    </button>
                  )}
                  <button onClick={() => delPair(p.id)} style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border-1)', background: 'transparent', color: 'var(--text-5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="trash" size={10} />
                  </button>
                </div>
              )
            })}
          </div>

          <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-1)' }}>
            {saveResult && (
              <div style={{ fontSize: 10.5, color: saveResult === 'Saved!' ? '#c3e88d' : '#ff5370', marginBottom: 5 }}>{saveResult}</div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={save}
                disabled={saving}
                style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', background: saving ? 'var(--border-1)' : accent, color: saving ? 'var(--text-5)' : '#0a0a0a', fontSize: 12, fontWeight: 800, cursor: saving ? 'default' : 'pointer' }}
              >
                {saving ? 'Saving...' : 'Save .env'}
              </button>
              <button
                onClick={copyEnv}
                disabled={!pairs.length}
                title="Copy .env to clipboard"
                className="flex items-center justify-center"
                style={{ width: 36, flexShrink: 0, borderRadius: 7, border: '1px solid var(--border-2)', background: 'var(--surface-1)', color: pairs.length ? 'var(--text-3)' : 'var(--border-2)', cursor: pairs.length ? 'pointer' : 'default' }}
              >
                <Icon name="copy" size={13} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ---------- SSH Quick-Connect ----------
const SSH_PROFILES_KEY = 'sush-ssh-profiles'
function loadSshProfiles() {
  try { return JSON.parse(localStorage.getItem(SSH_PROFILES_KEY) ?? '[]') } catch { return [] }
}

function SshTab({ accent, onNewTab, onRun }) {
  const [profiles, setProfiles] = useState(loadSshProfiles)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ label: '', user: '', host: '', port: '22', keyPath: '' })
  const labelRef = useRef(null)

  useEffect(() => { if (creating) labelRef.current?.focus() }, [creating])

  const persist = (next) => {
    setProfiles(next)
    localStorage.setItem(SSH_PROFILES_KEY, JSON.stringify(next))
  }

  const save = () => {
    const { label, user, host } = form
    if (!host.trim()) return
    const entry = {
      id: `ssh-${Date.now()}`,
      label: label.trim() || `${user ? user + '@' : ''}${host}`,
      user: user.trim(),
      host: host.trim(),
      port: form.port.trim() || '22',
      keyPath: form.keyPath.trim()
    }
    persist([...profiles, entry])
    setCreating(false)
    setForm({ label: '', user: '', host: '', port: '22', keyPath: '' })
  }

  const del = (id) => persist(profiles.filter(p => p.id !== id))

  const connect = (p) => {
    const parts = ['ssh']
    if (p.user) parts.push(`${p.user}@${p.host}`)
    else parts.push(p.host)
    if (p.port && p.port !== '22') parts.push('-p', p.port)
    if (p.keyPath) parts.push('-i', p.keyPath)
    const cmd = parts.join(' ')
    if (onNewTab) onNewTab({ command: cmd })
    else onRun?.(cmd)
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="lock"
        title="SSH Profiles"
        sub={`${profiles.length} saved`}
        right={
          <button onClick={() => setCreating(true)} title="Add profile" className="sush-icon-btn flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${rgba(accent, 0.35)}`, background: rgba(accent, 0.1), color: accent, cursor: 'pointer' }}>
            <Icon name="plus" size={14} strokeWidth={2.4} />
          </button>
        }
      />

      {creating && (
        <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--border-1)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { key: 'label', ph: 'Label (optional)...' },
            { key: 'host', ph: 'Host / IP *' },
            { key: 'user', ph: 'Username (optional)' },
            { key: 'port', ph: 'Port (default 22)' },
            { key: 'keyPath', ph: 'Key path (~/.ssh/id_rsa)' }
          ].map(({ key, ph }, i) => (
            <input
              key={key}
              ref={i === 0 ? labelRef : undefined}
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setCreating(false) }}
              placeholder={ph}
              spellCheck={false}
              style={{ padding: '5px 8px', background: 'var(--surface-2)', border: `1px solid ${key === 'host' ? rgba(accent, 0.3) : 'var(--border-2)'}`, borderRadius: 7, color: 'var(--text-1)', fontSize: 11, outline: 'none', fontFamily: key === 'keyPath' || key === 'host' ? 'monospace' : 'inherit' }}
            />
          ))}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setCreating(false)} style={{ padding: '4px 11px', borderRadius: 6, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
            <button onClick={save} disabled={!form.host.trim()} style={{ padding: '4px 11px', borderRadius: 6, border: `1px solid ${rgba(accent, 0.4)}`, background: rgba(accent, 0.12), color: accent, fontSize: 11, fontWeight: 700, cursor: form.host.trim() ? 'pointer' : 'default', opacity: form.host.trim() ? 1 : 0.5 }}>Save</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        {!profiles.length ? (
          <PanelEmpty icon="lock" accent={accent} hint="Save SSH connection details for one-click access. Press + to add.">No SSH profiles</PanelEmpty>
        ) : profiles.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 6, border: '1px solid var(--border-1)', borderRadius: 9, background: 'var(--surface-2)' }}>
            <Icon name="lock" size={14} color={accent} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'monospace', marginTop: 1 }}>
                {p.user ? `${p.user}@` : ''}{p.host}{p.port !== '22' ? `:${p.port}` : ''}
              </div>
            </div>
            <button
              onClick={() => connect(p)}
              title="Connect"
              style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${rgba(accent, 0.35)}`, background: rgba(accent, 0.1), color: accent, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="enter" size={13} />
            </button>
            <button onClick={() => del(p.id)} title="Delete" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border-1)', background: 'transparent', color: 'var(--text-5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="trash" size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Markdown Preview (renderer extracted to lib/markdown.jsx) ----------

function MarkdownTab({ accent, cwd, initialPath }) {
  const [path, setPath] = useState(initialPath ?? '')
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(false)
  const [mdError, setMdError] = useState(null)

  const load = useCallback(async (p) => {
    const target = (p ?? path).trim()
    if (!target) return
    setLoading(true); setMdError(null)
    try {
      const res = await window.sush?.readFile?.({ path: target })
      if (res?.ok) { setContent(res.content); setPath(target) }
      else setMdError(res?.error || 'Could not read file')
    } catch (e) { setMdError(e.message) }
    finally { setLoading(false) }
  }, [path])

  // Auto-load when initialPath changes (e.g. clicking a .md file in Files tab)
  useEffect(() => {
    if (initialPath) { setPath(initialPath); load(initialPath) }
  }, [initialPath]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader accent={accent} icon="fileText" title="Preview" sub={content ? fileName(path) : 'Markdown'} />

      <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--border-1)' }}>
        <input
          value={path}
          onChange={e => setPath(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(path)}
          placeholder={cwd ? `${cwd}/README.md` : 'Path to .md file...'}
          spellCheck={false}
          style={{ flex: 1, padding: '5px 8px', background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 7, color: 'var(--text-1)', fontSize: 11, outline: 'none', fontFamily: 'monospace' }}
        />
        <button
          onClick={() => load(path)}
          disabled={loading}
          style={{ padding: '5px 11px', borderRadius: 7, border: `1px solid ${rgba(accent, 0.35)}`, background: rgba(accent, 0.1), color: accent, fontSize: 11, fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? '...' : 'Load'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: '10px 14px' }}>
        {mdError && <div style={{ color: '#ff5370', fontSize: 12, padding: '6px 0' }}>{mdError}</div>}
        {content !== null && !mdError
          ? renderMarkdown(content, accent)
          : !mdError && <PanelEmpty icon="fileText" accent={accent} hint="Type a path above and press Enter, or click a .md file in the Files tab.">No file loaded</PanelEmpty>
        }
      </div>
    </div>
  )
}
