import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icons'
import Seducia from './Seducia'
import Browser from './Browser'
import { rgba, accentVars } from '../lib/ui'

const TABS = [
  { id: 'agent', label: 'Agent', icon: 'sparkles' },
  { id: 'browser', label: 'Browser', icon: 'globe' },
  { id: 'changes', label: 'Changes', icon: 'gitBranch' },
  { id: 'files', label: 'Files', icon: 'file' },
  { id: 'memory', label: 'Memory', icon: 'book' },
  { id: 'scripts', label: 'Scripts', icon: 'rocket' },
  { id: 'history', label: 'History', icon: 'clock' },
  { id: 'snippets', label: 'Snippets', icon: 'command' },
  { id: 'ports', label: 'Ports', icon: 'ports' },
  { id: 'docker', label: 'Docker', icon: 'layers' },
  { id: 'api', label: 'API', icon: 'globe' },
  { id: 'env', label: 'Env', icon: 'key' },
  { id: 'ssh', label: 'SSH', icon: 'lock' },
  { id: 'regex', label: 'Regex', icon: 'spark' },
  { id: 'convert', label: 'Convert', icon: 'code' },
  { id: 'color', label: 'Color', icon: 'palette' },
  { id: 'hash', label: 'Hash', icon: 'hash' },
  { id: 'gen', label: 'Generate', icon: 'shuffle' },
  { id: 'cheats', label: 'Cheats', icon: 'compass' },
  { id: 'markdown', label: 'Preview', icon: 'fileText' },
  { id: 'scratch', label: 'Notes', icon: 'edit' },
  { id: 'stats', label: 'Stats', icon: 'activity' },
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
  return STATUS_META[code] || STATUS_META[code?.[0]] || { c: '#8a939c', t: code || '?' }
}

export default function RightPanel({
  accent,
  tab,
  onTab,
  activeCwd,
  tabs,
  recentSessions,
  onLaunch,
  onRun,
  onPrompt,
  onFocus,
  onOpenLauncher,
  onClose,
  onNewTab,
  settings = {},
  planId = 'free',
  commandHistory = [],
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
      <TabStrip accent={accent} tab={tab} onTab={onTab} onClose={onClose} />

      {/* Tab body */}
      <div className="flex-1 min-h-0" style={{ position: 'relative' }}>
        {tab === 'agent' && (
          <Seducia
            docked
            accent={accent}
            tabs={tabs}
            recentSessions={recentSessions}
            activeCwd={activeCwd}
            onLaunch={onLaunch}
            onRun={onRun}
            onPrompt={onPrompt}
            onFocus={onFocus}
            onOpenLauncher={onOpenLauncher}
            onClose={onClose}
            settings={settings}
            planId={planId}
          />
        )}
        {/* Kept mounted so the page (and your scroll/login state) survives tab switches. */}
        <div style={{ position: 'absolute', inset: 0, display: tab === 'browser' ? 'block' : 'none' }}>
          <Browser accent={accent} />
        </div>
        {tab === 'changes' && <ChangesTab accent={accent} cwd={activeCwd} onOpenFile={handleOpenFile} settings={settings} />}
        {tab === 'files' && <FilesTab accent={accent} cwd={activeCwd} onOpenFile={handleOpenFile} />}
        {tab === 'memory' && <MemoryTab accent={accent} cwd={activeCwd} />}
        {tab === 'scripts' && <ScriptsTab accent={accent} cwd={activeCwd} onRun={onRun} />}
        {tab === 'history' && <HistoryTab accent={accent} history={commandHistory} onRun={onRun} settings={settings} />}
        {tab === 'snippets' && <SnippetsTab accent={accent} onRun={onRun} />}
        {tab === 'ports' && <PortsTab accent={accent} onRun={onRun} />}
        {tab === 'docker' && <DockerTab accent={accent} onRun={onRun} />}
        {tab === 'api' && <ApiTesterTab accent={accent} />}
        {tab === 'env' && <EnvManagerTab accent={accent} cwd={activeCwd} />}
        {tab === 'ssh' && <SshTab accent={accent} onNewTab={onNewTab} onRun={onRun} />}
        {tab === 'regex' && <RegexTab accent={accent} />}
        {tab === 'convert' && <ConvertTab accent={accent} />}
        {tab === 'color' && <ColorTab accent={accent} />}
        {tab === 'hash' && <HashTab accent={accent} />}
        {tab === 'gen' && <GenerateTab accent={accent} />}
        {tab === 'cheats' && <CheatsTab accent={accent} onRun={onRun} />}
        {tab === 'markdown' && <MarkdownTab accent={accent} cwd={activeCwd} initialPath={mdPath} />}
        {tab === 'scratch' && <ScratchpadTab accent={accent} />}
        {tab === 'stats' && <StatsTab accent={accent} />}
      </div>
    </aside>
  )
}

// Horizontal, single-row tab strip. Tabs scroll sideways with a slim accent
// scrollbar; gradient edges hint that there's more, and the active tab is
// always scrolled into view. The collapse button is pinned outside the scroller.
function TabStrip({ accent, tab, onTab, onClose }) {
  const scrollerRef = useRef(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  // Compact mode: icon-only tabs, so all 20+ tools fit with little scrolling.
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
    <div className="flex items-center" style={{ padding: '8px 8px', gap: 6, borderBottom: `1px solid ${rgba(accent, 0.1)}` }}>
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
                  color: active ? accent : '#8a939c',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                <Icon name={t.icon} size={13} strokeWidth={2} />
                {!compact && t.label}
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
        style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: `1px solid ${compact ? rgba(accent, 0.4) : rgba(accent, 0.14)}`, background: compact ? rgba(accent, 0.1) : rgba(accent, 0.04), color: compact ? accent : '#8a939c', cursor: 'pointer' }}
      >
        <Icon name="layout" size={15} />
      </button>
      <button
        onClick={onClose}
        title="Collapse panel"
        className="sush-icon-btn flex items-center justify-center"
        style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: `1px solid ${rgba(accent, 0.14)}`, background: rgba(accent, 0.04), color: '#8a939c', cursor: 'pointer' }}
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
      <div style={{ color: '#aab3bb', fontSize: 13, fontWeight: 700 }}>{children}</div>
      {hint && <div style={{ color: '#69737d', fontSize: 11.5, maxWidth: 240 }}>{hint}</div>}
    </div>
  )
}

function TabHeader({ accent, icon, title, sub, onRefresh, right }) {
  return (
    <div className="flex items-center" style={{ gap: 9, padding: '10px 12px', borderBottom: '1px solid #141a1f' }}>
      <Icon name={icon} size={14} color={accent} strokeWidth={2} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: '#e6ebef', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {sub && <span style={{ display: 'block', fontSize: 10.5, color: '#69737d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
      </span>
      {right}
      {onRefresh && (
        <button onClick={onRefresh} title="Refresh" className="sush-icon-btn flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #20272e', background: '#11151a', color: '#8a939c', cursor: 'pointer' }}>
          <Icon name="refresh" size={13} />
        </button>
      )}
    </div>
  )
}

// ---------- Changes + Git Commit Helper ----------
async function aiSuggestCommit(files, settings) {
  const summary = files.slice(0, 20).map(f => `${f.status} ${f.path}`).join('\n')
  const prompt = `Write a concise git commit message (under 72 chars, imperative mood) for these changes:\n${summary}\nRespond with ONLY the commit message, no quotes or explanation.`
  if (settings.anthropicKey) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': settings.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 80, messages: [{ role: 'user', content: prompt }] })
    })
    const d = await res.json()
    return d.content?.[0]?.text?.trim() || null
  }
  if (settings.openaiKey) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${settings.openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 80, messages: [{ role: 'user', content: prompt }] })
    })
    const d = await res.json()
    return d.choices?.[0]?.message?.content?.trim() || null
  }
  return null
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
    const hasKey = !!(settings.anthropicKey || settings.openaiKey)
    if (!hasKey) { setCommitMsg('Add an API key in Settings to use AI suggest'); return }
    setSuggesting(true)
    try {
      const files = data?.files || []
      const text = await aiSuggestCommit(files, settings)
      if (text) setCommitMsg(text)
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
            style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${diff !== null ? rgba(accent, 0.4) : '#20272e'}`, background: diff !== null ? rgba(accent, 0.1) : '#11151a', color: diff !== null ? accent : '#8a939c', cursor: 'pointer' }}
          >
            <Icon name="fileText" size={13} />
          </button>
        }
      />
      {(diff !== null || diffLoading) && (
        <div style={{ borderBottom: '1px solid #1b2127', background: '#070909', maxHeight: 150, overflowY: 'auto' }} className="sush-scroll">
          <pre style={{ margin: 0, padding: '8px 10px', fontSize: 10.5, lineHeight: 1.6, color: '#9aa3ab', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
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
                  <button onClick={() => onOpenFile(joinPath(data.dir || cwd, f.path))} title={f.path} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: '#cdd5dc', cursor: 'pointer', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 0, fontWeight: 700 }}>{f.path}</button>
                  <button onClick={() => toggleStage(f)} title="Unstage" style={{ fontSize: 10, color: '#5a646d', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>−</button>
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
                  <button onClick={() => onOpenFile(joinPath(data.dir || cwd, f.path))} title={f.path} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: '#9aa3ab', cursor: 'pointer', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 0 }}>{f.path}</button>
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
        <div style={{ padding: '8px 10px', borderTop: '1px solid #1b2127', display: 'flex', flexDirection: 'column', gap: 6 }}>
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
              style={{ flex: 1, padding: '5px 8px', background: '#0f1318', border: '1px solid #20272e', borderRadius: 7, color: '#f1f4f6', fontSize: 11.5, outline: 'none' }}
            />
            <button
              onClick={suggestMessage}
              disabled={suggesting}
              title="AI suggest"
              style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${rgba(accent, 0.3)}`, background: rgba(accent, 0.08), color: suggesting ? '#3f4852' : accent, cursor: suggesting ? 'default' : 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
            >
              {suggesting ? '...' : '✦'}
            </button>
          </div>
          <button
            onClick={commit}
            disabled={!commitMsg.trim() || committing}
            style={{ padding: '6px 0', borderRadius: 7, border: 'none', background: (commitMsg.trim() && !committing) ? accent : '#1c2126', color: (commitMsg.trim() && !committing) ? '#0a0a0a' : '#3f4852', fontSize: 12, fontWeight: 800, cursor: (commitMsg.trim() && !committing) ? 'pointer' : 'default' }}
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
          <Icon name="search" size={12} color="#5a646d" />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter files..."
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#f1f4f6', outline: 'none', fontSize: 11.5 }}
          />
          {filter && (
            <button onClick={() => setFilter('')} title="Clear" style={{ background: 'none', border: 'none', color: '#5a646d', cursor: 'pointer', padding: 0, display: 'flex' }}>
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

  if (entries === null) return <div style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 10 + depth * 14, color: '#69737d', fontSize: 11.5 }}>...</div>
  // The filter only narrows the top level so you can still drill into subfolders.
  const shown = (depth === 0 && filter)
    ? entries.filter(e => e.name.toLowerCase().includes(filter.toLowerCase()))
    : entries
  if (!shown.length) return <div style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 10 + depth * 14, color: '#69737d', fontSize: 11.5 }}>{(depth === 0 && filter) ? 'no matches' : 'empty'}</div>
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
        style={{ gap: 6, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', color: entry.dir ? '#cdd5dc' : '#9aa3ab', padding: '4px 6px', paddingLeft: 8 + depth * 14, borderRadius: 6, cursor: 'pointer' }}
      >
        {entry.dir
          ? <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} color="#69737d" strokeWidth={2.4} />
          : <span style={{ width: 12, flexShrink: 0 }} />}
        <Icon name={entry.dir ? 'folder' : 'file'} size={13} color={entry.dir ? accent : '#69737d'} strokeWidth={2} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{entry.name}</span>
      </button>
      {entry.dir && open && <TreeLevel path={full} depth={depth + 1} accent={accent} onOpenFile={onOpenFile} />}
    </>
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
            <button onClick={() => setSelected(null)} title="Back" className="sush-icon-btn flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #20272e', background: '#11151a', color: '#8a939c', cursor: 'pointer' }}>
              <Icon name="chevronRight" size={13} style={{ transform: 'rotate(180deg)' }} />
            </button>
          }
        />
        <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 14 }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12.5, lineHeight: 1.65, color: '#d4dbe1', fontFamily: 'inherit' }}>
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
              style={{ flex: 1, minWidth: 0, height: '100%', background: 'transparent', border: 'none', color: '#f1f4f6', outline: 'none', fontSize: 12.5 }}
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
            style={{ gap: 10, width: '100%', textAlign: 'left', border: '1px solid #1b2127', borderRadius: 10, background: '#0f1318', color: '#d8dee4', padding: '9px 11px', marginBottom: 8, cursor: 'pointer' }}
          >
            <Icon name="book" size={15} color={accent} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</span>
              <span style={{ display: 'block', fontSize: 10.5, color: '#69737d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                {note.links?.length ? `${note.links.length} link${note.links.length === 1 ? '' : 's'} → ${note.links.slice(0, 3).join(', ')}` : (note.excerpt || 'empty note')}
              </span>
            </span>
            <Icon name="network" size={13} color={note.links?.length ? accent : '#3f4852'} />
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
            style={{ gap: 10, width: '100%', textAlign: 'left', border: '1px solid #1b2127', borderRadius: 9, background: '#0f1318', color: '#d8dee4', padding: '8px 11px', marginBottom: 7, cursor: 'pointer' }}
          >
            <Icon name="arrowRight" size={13} color={accent} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: accent }}>{name}</span>
              <span style={{ display: 'block', fontSize: 10.5, color: '#5a646d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', marginTop: 2 }}>{scripts[name]}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- Command History + Explainer ----------
async function explainCommand(cmd, settings) {
  const prompt = `Explain this shell command in 1-2 concise sentences for a developer. Be direct.\n\nCommand: ${cmd}`
  if (settings.anthropicKey) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': settings.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 120, messages: [{ role: 'user', content: prompt }] })
    })
    const d = await res.json()
    return d.content?.[0]?.text?.trim() || null
  }
  if (settings.openaiKey) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${settings.openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 120, messages: [{ role: 'user', content: prompt }] })
    })
    const d = await res.json()
    return d.choices?.[0]?.message?.content?.trim() || null
  }
  return null
}

function HistoryTab({ accent, history, onRun, settings = {} }) {
  const [search, setSearch] = useState('')
  const [explanations, setExplanations] = useState({})
  const [explaining, setExplaining] = useState(new Set())
  const displayed = history.filter(cmd => !search || cmd.toLowerCase().includes(search.toLowerCase())).slice().reverse()
  const hasKey = !!(settings.anthropicKey || settings.openaiKey)

  const explain = async (cmd) => {
    if (explanations[cmd]) { setExplanations(p => { const n = { ...p }; delete n[cmd]; return n }); return }
    setExplaining(p => new Set([...p, cmd]))
    try {
      const text = hasKey ? await explainCommand(cmd, settings) : null
      setExplanations(p => ({ ...p, [cmd]: text || (hasKey ? 'Could not explain' : 'Add an API key in Settings to use this.') }))
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
          <Icon name="search" size={13} color="#5a646d" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter history..."
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#f1f4f6', outline: 'none', fontSize: 12 }}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        {!displayed.length ? (
          <PanelEmpty icon="clock" accent={accent} hint="Commands you run in the active session will appear here.">No history yet</PanelEmpty>
        ) : displayed.map((cmd, i) => (
          <div key={i} style={{ marginBottom: 5 }}>
            <div className="flex items-center" style={{ gap: 6, border: '1px solid #1b2127', borderRadius: 8, background: '#0f1318', padding: '5px 6px 5px 10px' }}>
              <Icon name="chevronRight" size={11} color="#3f4852" />
              <button
                onClick={() => onRun(cmd)}
                title={`Run: ${cmd}`}
                style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: '#9aa3ab', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 0 }}
              >
                {cmd}
              </button>
              <button
                onClick={() => copyToClipboard(cmd)}
                title="Copy command"
                style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 6, border: '1px solid #20272e', background: 'transparent', color: '#5a646d', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="copy" size={11} />
              </button>
              <button
                onClick={() => explain(cmd)}
                title="Explain this command"
                style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 6, border: `1px solid ${explanations[cmd] ? rgba(accent, 0.4) : '#20272e'}`, background: explanations[cmd] ? rgba(accent, 0.1) : 'transparent', color: explanations[cmd] ? accent : '#3f4852', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}
              >
                {explaining.has(cmd) ? '...' : '?'}
              </button>
            </div>
            {explanations[cmd] && (
              <div style={{ padding: '6px 10px 6px 12px', fontSize: 11.5, color: '#8a939c', lineHeight: 1.55, borderLeft: `2px solid ${rgba(accent, 0.35)}`, marginLeft: 4, marginTop: 3 }}>
                {explanations[cmd]}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- System Stats ----------
function fmtBytes(bytes) {
  if (!bytes || bytes < 0) return '0 B'
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function fmtSpeed(bps) {
  if (!bps || bps <= 0) return '0 B/s'
  if (bps < 1024) return `${bps.toFixed(0)} B/s`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`
}

function StatCard({ title, accent, children }) {
  return (
    <div style={{ border: '1px solid #1b2127', borderRadius: 10, background: '#0f1318', overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #1b2127', fontSize: 10, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: 0.8 }}>{title}</div>
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

function BarStat({ label, value, max, unit, accent, small = false }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const color = pct > 80 ? '#ff5370' : pct > 60 ? '#ffcb6b' : accent
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: small ? 10 : 11, color: '#9aa3ab' }}>
        <span>{label}</span>
        {unit && <span style={{ color, fontWeight: 700 }}>{pct.toFixed(small ? 0 : 1)}{unit}</span>}
      </div>
      <div style={{ height: small ? 3 : 5, background: '#1b2127', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

function StatsTab({ accent }) {
  const [stats, setStats] = useState(null)
  const [statErr, setStatErr] = useState(null)
  const intervalRef = useRef(null)

  const load = useCallback(() => {
    window.sush?.getSystemStats?.()
      .then(data => {
        if (data?.error) { setStatErr(data.error) }
        else { setStats(data); setStatErr(null) }
      })
      .catch(e => setStatErr(e.message))
  }, [])

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 2000)
    return () => clearInterval(intervalRef.current)
  }, [load])

  if (!stats && !statErr) return <PanelEmpty icon="activity" accent={accent}>Loading system stats...</PanelEmpty>
  if (statErr) return <PanelEmpty icon="activity" accent={accent} hint={statErr}>Stats unavailable</PanelEmpty>

  const cpuPct = stats.cpu?.load ?? 0
  const memUsed = stats.memory?.used ?? 0
  const memTotal = stats.memory?.total ?? 1
  const swapTotal = stats.memory?.swapTotal ?? 0
  const swapUsed = stats.memory?.swapUsed ?? 0
  const uptimeH = Math.floor((stats.uptime ?? 0) / 3600)
  const uptimeM = Math.floor(((stats.uptime ?? 0) % 3600) / 60)

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="activity"
        title="System Stats"
        sub={`Uptime ${uptimeH}h ${uptimeM}m · live`}
        onRefresh={load}
      />
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>

        <StatCard title="CPU" accent={accent}>
          <BarStat label="Overall load" value={cpuPct} max={100} unit="%" accent={accent} />
          {stats.cpu?.cores?.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px', marginTop: 2 }}>
              {stats.cpu.cores.slice(0, 16).map((load, i) => (
                <BarStat key={i} label={`C${i}`} value={load} max={100} unit="%" accent={accent} small />
              ))}
            </div>
          )}
        </StatCard>

        <StatCard title="Memory" accent={accent}>
          <BarStat
            label={`${fmtBytes(memUsed)} / ${fmtBytes(memTotal)}`}
            value={memUsed}
            max={memTotal}
            unit="%"
            accent={accent}
          />
          {swapTotal > 0 && (
            <BarStat
              label={`Swap: ${fmtBytes(swapUsed)} / ${fmtBytes(swapTotal)}`}
              value={swapUsed}
              max={swapTotal}
              unit="%"
              accent={accent}
              small
            />
          )}
        </StatCard>

        {stats.gpu?.filter(g => g.utilizationGpu != null || g.memUsed != null).map((gpu, i) => (
          <StatCard key={i} title={gpu.name || `GPU ${i}`} accent={accent}>
            {gpu.utilizationGpu != null && (
              <BarStat label="GPU load" value={gpu.utilizationGpu} max={100} unit="%" accent={accent} />
            )}
            {gpu.memUsed != null && gpu.memTotal != null && gpu.memTotal > 0 && (
              <BarStat
                label={`VRAM: ${fmtBytes(gpu.memUsed * 1024 * 1024)} / ${fmtBytes(gpu.memTotal * 1024 * 1024)}`}
                value={gpu.memUsed}
                max={gpu.memTotal}
                unit="%"
                accent={accent}
                small
              />
            )}
            {gpu.temperatureGpu != null && (
              <div style={{ fontSize: 10.5, color: gpu.temperatureGpu > 80 ? '#ff5370' : '#9aa3ab' }}>
                Temp: <span style={{ fontWeight: 700 }}>{gpu.temperatureGpu}°C</span>
              </div>
            )}
          </StatCard>
        ))}

        {stats.network?.length > 0 && (
          <StatCard title="Network" accent={accent}>
            {stats.network.map(n => (
              <div key={n.iface} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="wifi" size={12} color="#5a646d" />
                <span style={{ fontSize: 11, color: accent, fontWeight: 700, flexShrink: 0 }}>{n.iface}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10.5, color: '#c3e88d' }}>↓ {fmtSpeed(n.rx_sec)}</span>
                <span style={{ fontSize: 10.5, color: '#ff9aaa', marginLeft: 6 }}>↑ {fmtSpeed(n.tx_sec)}</span>
              </div>
            ))}
            {stats.wifi?.filter(w => w.ssid).map((w, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 4, borderTop: '1px solid #1b2127' }}>
                <Icon name="wifi" size={12} color={accent} />
                <span style={{ fontSize: 11, color: '#d4dbe1', fontWeight: 700 }}>{w.ssid}</span>
                {w.quality != null && <span style={{ fontSize: 10, color: '#69737d', marginLeft: 'auto' }}>{w.quality}%</span>}
                {w.txRate != null && <span style={{ fontSize: 10, color: '#69737d' }}>{w.txRate} Mbps</span>}
              </div>
            ))}
          </StatCard>
        )}

        {Object.keys(stats.sessions || {}).length > 0 && (
          <StatCard title={`Terminal Sessions (${Object.keys(stats.sessions).length})`} accent={accent}>
            {Object.entries(stats.sessions).map(([tabId, s]) => (
              <div key={tabId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderBottom: '1px solid #141a1f' }}>
                <Icon name="terminal" size={11} color={accent} />
                <span style={{ fontSize: 10.5, color: '#d4dbe1', fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                <span style={{ fontSize: 10, color: s.cpu > 20 ? '#ffcb6b' : '#69737d', flexShrink: 0 }}>CPU {s.cpu.toFixed(1)}%</span>
                <span style={{ fontSize: 10, color: '#69737d', flexShrink: 0, marginLeft: 4 }}>{fmtBytes(s.memRss)}</span>
              </div>
            ))}
          </StatCard>
        )}

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
  system:  { label: 'System',  color: '#69737d', bg: 'rgba(105,115,125,0.1)', border: 'rgba(105,115,125,0.22)' }
}

const FILTER_OPTS = ['all', 'app', 'service', 'system']

function PortsTab({ accent, onRun }) {
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [killing, setKilling] = useState(new Set())
  const intervalRef = useRef(null)

  const load = useCallback(() => {
    window.sush?.getPorts?.()
      .then(res => setData(res))
      .catch(() => setData({ ok: false, ports: [] }))
  }, [])

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 3000)
    return () => clearInterval(intervalRef.current)
  }, [load])

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
      <div style={{ display: 'flex', gap: 5, padding: '8px 10px 4px', borderBottom: '1px solid #141a1f' }}>
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
                border: `1px solid ${active ? (catInfo?.border ?? rgba(accent, 0.45)) : '#20272e'}`,
                background: active ? (catInfo?.bg ?? rgba(accent, 0.12)) : 'transparent',
                color: active ? (catInfo?.color ?? accent) : '#5a646d',
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
          <Icon name="search" size={12} color="#5a646d" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by port or process..."
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#f1f4f6', outline: 'none', fontSize: 11.5 }}
          />
          {search && (
            <button onClick={() => setSearch('')} title="Clear" style={{ background: 'none', border: 'none', color: '#5a646d', cursor: 'pointer', padding: 0, display: 'flex' }}>
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
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', marginBottom: 5, border: '1px solid #1b2127', borderRadius: 9, background: '#0f1318' }}
            >
              {/* Port */}
              <span style={{ fontSize: 13.5, fontWeight: 800, color: accent, minWidth: 44, flexShrink: 0, fontFamily: 'monospace' }}>
                {p.port}
              </span>

              {/* Process info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: p.process ? '#d4dbe1' : '#3f4852', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.process || 'unknown'}
                </div>
                {p.pid && (
                  <div style={{ fontSize: 9.5, color: '#3f4852', marginTop: 1 }}>PID {p.pid} · {p.protocol}</div>
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
        <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid #1b2127', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <input
            ref={nameRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); cmdRef.current?.focus() } if (e.key === 'Escape') cancel() }}
            placeholder="Name (e.g. Start dev server)..."
            spellCheck={false}
            style={{ padding: '6px 9px', background: '#0f1318', border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 7, color: '#f1f4f6', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' }}
          />
          <input
            ref={cmdRef}
            value={newCmd}
            onChange={e => setNewCmd(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addSnippet(); if (e.key === 'Escape') cancel() }}
            placeholder="Command (e.g. npm run dev)..."
            spellCheck={false}
            style={{ padding: '6px 9px', background: '#0f1318', border: '1px solid #20272e', borderRadius: 7, color: '#d4dbe1', fontSize: 11.5, fontFamily: 'monospace', outline: 'none', width: '100%', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={cancel} style={{ padding: '4px 11px', borderRadius: 6, border: '1px solid #20272e', background: 'transparent', color: '#69737d', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
            <button onClick={addSnippet} disabled={!newName.trim() || !newCmd.trim()} style={{ padding: '4px 11px', borderRadius: 6, border: `1px solid ${rgba(accent, 0.4)}`, background: rgba(accent, 0.12), color: accent, fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: (!newName.trim() || !newCmd.trim()) ? 0.5 : 1 }}>Save</button>
          </div>
        </div>
      )}

      <div style={{ padding: '8px 10px 0' }}>
        <div className="sush-omni flex items-center" style={{ height: 34, gap: 8 }}>
          <Icon name="search" size={13} color="#5a646d" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search snippets..."
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#f1f4f6', outline: 'none', fontSize: 12 }}
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
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 6, border: '1px solid #1b2127', borderRadius: 9, background: '#0f1318' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#d4dbe1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
              <div style={{ fontSize: 10.5, color: '#5a646d', fontFamily: 'monospace', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.command}</div>
            </div>
            <button
              onClick={() => copyToClipboard(s.command)}
              title="Copy command"
              style={{ width: 27, height: 27, flexShrink: 0, borderRadius: 7, border: '1px solid #1b2127', background: 'transparent', color: '#5a646d', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
              style={{ width: 27, height: 27, flexShrink: 0, borderRadius: 7, border: '1px solid #1b2127', background: 'transparent', color: '#3f4852', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="trash" size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Regex Tester ----------
const REGEX_PRESETS = [
  { label: 'Email', pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.-]+' },
  { label: 'URL', pattern: 'https?:\\/\\/[^\\s/$.?#].[^\\s]*' },
  { label: 'IPv4', pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b' },
  { label: 'UUID', pattern: '[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}' },
  { label: 'Hex', pattern: '#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b' },
  { label: 'Date', pattern: '\\d{4}-\\d{2}-\\d{2}' }
]

function RegexTab({ accent }) {
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('g')
  const [testStr, setTestStr] = useState('')

  const { matches, highlighted, error } = useMemo(() => {
    if (!pattern) return { matches: [], highlighted: testStr ? [{ text: testStr, match: false }] : [], error: null }
    try {
      const gFlags = flags.includes('g') ? flags : flags + 'g'
      const ms = [...testStr.matchAll(new RegExp(pattern, gFlags))]
      const parts = []
      let last = 0
      for (const m of ms) {
        if (m.index > last) parts.push({ text: testStr.slice(last, m.index), match: false })
        parts.push({ text: m[0], match: true, groups: m.slice(1) })
        last = m.index + m[0].length
      }
      if (last < testStr.length) parts.push({ text: testStr.slice(last), match: false })
      return { matches: ms, highlighted: parts.length ? parts : [{ text: testStr, match: false }], error: null }
    } catch (e) {
      return { matches: [], highlighted: [], error: e.message }
    }
  }, [pattern, flags, testStr])

  const toggleFlag = (f) => setFlags(prev => prev.includes(f) ? prev.replace(f, '') : prev + f)

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="spark"
        title="Regex Tester"
        sub={pattern && !error ? `${matches.length} match${matches.length !== 1 ? 'es' : ''}` : 'Live pattern tester'}
      />

      <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid #1b2127', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {/* Pattern input styled like /regex/ */}
        <div className="sush-omni flex items-center" style={{ gap: 6, height: 36, borderColor: error ? 'rgba(255,83,112,0.4)' : undefined }}>
          <span style={{ color: '#5a646d', fontSize: 15, fontFamily: 'monospace', fontWeight: 800, paddingLeft: 2, flexShrink: 0 }}>/</span>
          <input
            value={pattern}
            onChange={e => setPattern(e.target.value)}
            placeholder="pattern..."
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: error ? '#ff5370' : '#f1f4f6', outline: 'none', fontSize: 13.5, fontFamily: 'monospace' }}
          />
          <span style={{ color: '#5a646d', fontSize: 15, fontFamily: 'monospace', fontWeight: 800, paddingRight: 4, flexShrink: 0 }}>/{flags}</span>
        </div>

        {/* Flags row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {['g', 'i', 'm', 's'].map(f => (
            <button
              key={f}
              onClick={() => toggleFlag(f)}
              style={{ width: 26, height: 22, borderRadius: 5, border: `1px solid ${flags.includes(f) ? rgba(accent, 0.4) : '#20272e'}`, background: flags.includes(f) ? rgba(accent, 0.12) : 'transparent', color: flags.includes(f) ? accent : '#3f4852', fontSize: 11, fontWeight: 800, fontFamily: 'monospace', cursor: 'pointer' }}
            >
              {f}
            </button>
          ))}
          {error
            ? <span style={{ fontSize: 10, color: '#ff5370', marginLeft: 6, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{error}</span>
            : pattern && <span style={{ fontSize: 10.5, color: matches.length ? accent : '#3f4852', marginLeft: 6, fontWeight: 700 }}>{matches.length} match{matches.length !== 1 ? 'es' : ''}</span>
          }
        </div>

        {/* Quick-insert preset patterns */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {REGEX_PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => setPattern(p.pattern)}
              title={p.pattern}
              className="sush-mini-btn"
              style={{ padding: '2px 7px', borderRadius: 5, border: '1px solid #20272e', background: 'transparent', color: '#8a939c', fontSize: 9.5, fontWeight: 700, cursor: 'pointer' }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {/* Test string area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '5px 10px 3px', fontSize: 9.5, fontWeight: 800, color: '#3f4852', textTransform: 'uppercase', letterSpacing: 0.6 }}>Test string</div>
          <textarea
            value={testStr}
            onChange={e => setTestStr(e.target.value)}
            placeholder="Paste text to test against..."
            spellCheck={false}
            style={{ flex: 1, padding: '6px 10px', background: '#0a0c0f', border: 'none', borderTop: '1px solid #141a1f', color: '#9aa3ab', outline: 'none', resize: 'none', fontSize: 12, lineHeight: 1.65, fontFamily: 'monospace' }}
          />
        </div>

        {/* Match highlights + group list */}
        {testStr && pattern && !error && (
          <div style={{ borderTop: '1px solid #1b2127', maxHeight: '40%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {highlighted.length > 0 && (
              <div style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.9, wordBreak: 'break-all', borderBottom: '1px solid #141a1f' }}>
                {highlighted.map((p, i) =>
                  p.match
                    ? <mark key={i} style={{ background: rgba(accent, 0.28), color: accent, borderRadius: 3, padding: '0 1px' }}>{p.text}</mark>
                    : <span key={i} style={{ color: '#5a646d' }}>{p.text}</span>
                )}
              </div>
            )}
            {matches.length > 0 && (
              <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  onClick={() => copyToClipboard(matches.map(m => m[0]).join('\n'))}
                  className="sush-mini-btn flex items-center"
                  style={{ alignSelf: 'flex-start', gap: 5, padding: '2px 8px', borderRadius: 5, border: `1px solid ${rgba(accent, 0.3)}`, background: rgba(accent, 0.08), color: accent, fontSize: 9.5, fontWeight: 700, cursor: 'pointer', marginBottom: 2 }}
                >
                  <Icon name="copy" size={10} /> Copy {matches.length} match{matches.length !== 1 ? 'es' : ''}
                </button>
                {matches.slice(0, 12).map((m, i) => (
                  <div key={i} style={{ fontSize: 10.5, display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <span style={{ color: accent, fontWeight: 700, flexShrink: 0 }}>#{i + 1}</span>
                    <code style={{ color: '#c3e88d', fontFamily: 'monospace' }}>{m[0] || '(empty)'}</code>
                    {m.length > 1 && m.slice(1).map((g, gi) => (
                      <code key={gi} style={{ color: '#82aaff', fontFamily: 'monospace' }}>${gi + 1}:{g ?? '∅'}</code>
                    ))}
                    <span style={{ color: '#3f4852', marginLeft: 'auto', flexShrink: 0 }}>@{m.index}</span>
                  </div>
                ))}
                {matches.length > 12 && <div style={{ fontSize: 10, color: '#3f4852' }}>...{matches.length - 12} more matches</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Docker ----------
function DockerTab({ accent, onRun }) {
  const [data, setData] = useState(null)
  const [logs, setLogs] = useState({})
  const [loadingLogs, setLoadingLogs] = useState(new Set())
  const [stopping, setStopping] = useState(new Set())
  const intervalRef = useRef(null)

  const load = useCallback(() => {
    window.sush?.dockerPs?.()
      .then(res => setData(res))
      .catch(() => setData({ ok: false, containers: [], error: 'Docker not available' }))
  }, [])

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 5000)
    return () => clearInterval(intervalRef.current)
  }, [load])

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
            <div key={id} style={{ marginBottom: 8, border: '1px solid #1b2127', borderRadius: 9, background: '#0f1318', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#c3e88d', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#d4dbe1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ fontSize: 10, color: '#5a646d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{image}</div>
                </div>
                {hostPort && (
                  <button onClick={() => window.sush?.openExternal?.({ url: `http://localhost:${hostPort}` })} title={`Open localhost:${hostPort}`} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${rgba(accent, 0.25)}`, background: rgba(accent, 0.07), color: accent, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="globe" size={12} />
                  </button>
                )}
                <button onClick={() => copyToClipboard(id)} title="Copy container ID" style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #20272e', background: 'transparent', color: '#5a646d', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="copy" size={11} />
                </button>
                <button onClick={() => fetchLogs(id)} title={hasLogs ? 'Hide logs' : 'View logs'} disabled={isLoadingLogs} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${hasLogs ? rgba(accent, 0.4) : '#20272e'}`, background: hasLogs ? rgba(accent, 0.1) : 'transparent', color: hasLogs ? accent : '#5a646d', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>
                  {isLoadingLogs ? '...' : '≡'}
                </button>
                <button onClick={() => shell(id)} title="Open shell" style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #20272e', background: 'transparent', color: '#5a646d', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="terminal" size={12} />
                </button>
                <button onClick={() => stop(id)} disabled={isStopping} title="Stop container" style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(255,83,112,0.2)', background: 'rgba(255,83,112,0.06)', color: isStopping ? '#3f2020' : '#ff5370', cursor: isStopping ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="stop" size={11} />
                </button>
              </div>
              {ports && <div style={{ padding: '0 9px 5px', fontSize: 9.5, color: '#5a646d', fontFamily: 'monospace' }}>{ports}</div>}
              {status && <div style={{ padding: '0 9px 5px', fontSize: 9, color: '#3f4852' }}>{status}</div>}
              {hasLogs && (
                <pre style={{ margin: 0, padding: '8px 10px', background: '#070909', borderTop: '1px solid #141a1f', fontSize: 10, lineHeight: 1.65, color: '#9aa3ab', maxHeight: 160, overflowY: 'auto', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
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

// ---------- API Tester ----------
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const API_HISTORY_KEY = 'sush-api-history'
function loadApiHistory() {
  try { return JSON.parse(localStorage.getItem(API_HISTORY_KEY) ?? '[]') } catch { return [] }
}

function ApiTesterTab({ accent }) {
  const [method, setMethod] = useState('GET')
  const [url, setUrl] = useState('')
  const [headersText, setHeadersText] = useState('Content-Type: application/json')
  const [body, setBody] = useState('')
  const [response, setResponse] = useState(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState(loadApiHistory)
  const [showHistory, setShowHistory] = useState(false)
  const abortRef = useRef(null)

  const rememberRequest = (req) => {
    setHistory(prev => {
      const next = [req, ...prev.filter(h => !(h.method === req.method && h.url === req.url))].slice(0, 15)
      localStorage.setItem(API_HISTORY_KEY, JSON.stringify(next))
      return next
    })
  }
  const recall = (h) => {
    setMethod(h.method); setUrl(h.url)
    if (h.headersText != null) setHeadersText(h.headersText)
    if (h.body != null) setBody(h.body)
    setShowHistory(false)
  }
  const clearHistory = () => { setHistory([]); localStorage.removeItem(API_HISTORY_KEY) }

  const send = async () => {
    if (!url.trim() || loading) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setResponse(null)
    const start = Date.now()

    try {
      const headers = {}
      headersText.split('\n').forEach(line => {
        const i = line.indexOf(':')
        if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim()
      })
      const opts = { method, headers, signal: controller.signal }
      if (!['GET', 'HEAD'].includes(method) && body.trim()) opts.body = body

      const res = await fetch(url.trim(), opts)
      const elapsed = Date.now() - start
      const respHeaders = {}
      res.headers.forEach((v, k) => { respHeaders[k] = v })
      let text = ''
      try { text = await res.text() } catch {}
      setResponse({ status: res.status, statusText: res.statusText, headers: respHeaders, body: text, elapsed })
      rememberRequest({ method, url: url.trim(), headersText, body })
    } catch (e) {
      if (e.name !== 'AbortError') setResponse({ error: e.message })
    } finally {
      setLoading(false)
    }
  }

  const statusColor = response?.status ? (response.status < 300 ? '#c3e88d' : response.status < 400 ? '#ffcb6b' : '#ff5370') : accent

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="globe"
        title="API Tester"
        sub="HTTP request builder"
        right={history.length > 0 && (
          <button
            onClick={() => setShowHistory(s => !s)}
            title="Recent requests"
            className="sush-icon-btn flex items-center justify-center"
            style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${showHistory ? rgba(accent, 0.4) : '#20272e'}`, background: showHistory ? rgba(accent, 0.1) : '#11151a', color: showHistory ? accent : '#8a939c', cursor: 'pointer' }}
          >
            <Icon name="clock" size={13} />
          </button>
        )}
      />

      {showHistory && history.length > 0 && (
        <div style={{ borderBottom: '1px solid #1b2127', maxHeight: 160, overflowY: 'auto', padding: 6 }} className="sush-scroll">
          <div style={{ display: 'flex', alignItems: 'center', padding: '2px 4px 5px' }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: '#3f4852', textTransform: 'uppercase', letterSpacing: 0.6, flex: 1 }}>Recent</span>
            <button onClick={clearHistory} style={{ fontSize: 9.5, color: '#5a646d', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Clear</button>
          </div>
          {history.map((h, i) => (
            <button
              key={i}
              onClick={() => recall(h)}
              className="sush-row flex items-center"
              style={{ gap: 7, width: '100%', textAlign: 'left', border: '1px solid #1b2127', borderRadius: 7, background: '#0f1318', color: '#cdd5dc', padding: '5px 8px', marginBottom: 4, cursor: 'pointer' }}
            >
              <span style={{ fontSize: 9.5, fontWeight: 800, color: accent, minWidth: 38, flexShrink: 0, fontFamily: 'monospace' }}>{h.method}</span>
              <span style={{ fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{h.url}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: '8px 10px', borderBottom: '1px solid #1b2127', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Method + URL */}
        <div style={{ display: 'flex', gap: 5 }}>
          <select
            value={method}
            onChange={e => setMethod(e.target.value)}
            style={{ padding: '5px 7px', background: '#0f1318', border: '1px solid #20272e', borderRadius: 7, color: accent, fontSize: 11, fontWeight: 800, outline: 'none', cursor: 'pointer' }}
          >
            {HTTP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="https://api.example.com/endpoint"
            spellCheck={false}
            style={{ flex: 1, padding: '5px 8px', background: '#0f1318', border: '1px solid #20272e', borderRadius: 7, color: '#f1f4f6', fontSize: 11, outline: 'none', fontFamily: 'monospace' }}
          />
        </div>
        {/* Headers */}
        <textarea
          value={headersText}
          onChange={e => setHeadersText(e.target.value)}
          placeholder="Headers (one per line, Name: value)"
          spellCheck={false}
          rows={2}
          style={{ padding: '5px 8px', background: '#070909', border: '1px solid #1b2127', borderRadius: 7, color: '#9aa3ab', fontSize: 10.5, outline: 'none', resize: 'none', fontFamily: 'monospace', lineHeight: 1.6 }}
        />
        {/* Body */}
        {!['GET', 'HEAD'].includes(method) && (
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder='{"key": "value"}'
            spellCheck={false}
            rows={3}
            style={{ padding: '5px 8px', background: '#070909', border: '1px solid #1b2127', borderRadius: 7, color: '#9aa3ab', fontSize: 10.5, outline: 'none', resize: 'none', fontFamily: 'monospace', lineHeight: 1.6 }}
          />
        )}
        <button
          onClick={loading ? () => abortRef.current?.abort() : send}
          style={{ padding: '6px 0', borderRadius: 7, border: 'none', background: loading ? 'rgba(255,83,112,0.1)' : (url.trim() ? accent : '#1c2126'), color: loading ? '#ff5370' : (url.trim() ? '#0a0a0a' : '#3f4852'), fontSize: 12, fontWeight: 800, cursor: url.trim() ? 'pointer' : 'default' }}
        >
          {loading ? 'Cancel' : 'Send'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 8 }}>
        {!response && !loading && <PanelEmpty icon="globe" accent={accent} hint="Fill in a URL and click Send.">No response yet</PanelEmpty>}
        {response?.error && <div style={{ padding: 10, color: '#ff5370', fontSize: 12 }}>{response.error}</div>}
        {response && !response.error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#0f1318', border: `1px solid ${statusColor}44`, borderRadius: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: statusColor, fontFamily: 'monospace' }}>{response.status}</span>
              <span style={{ fontSize: 11, color: '#9aa3ab' }}>{response.statusText}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#5a646d' }}>{response.elapsed}ms</span>
            </div>
            {Object.keys(response.headers).length > 0 && (
              <div style={{ padding: '6px 8px', background: '#0a0c0f', border: '1px solid #1b2127', borderRadius: 8 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, color: '#3f4852', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Response Headers</div>
                {Object.entries(response.headers).slice(0, 12).map(([k, v]) => (
                  <div key={k} style={{ fontSize: 10, fontFamily: 'monospace', color: '#69737d', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: accent }}>{k}</span>: {v}
                  </div>
                ))}
              </div>
            )}
            <div style={{ padding: '6px 8px', background: '#0a0c0f', border: '1px solid #1b2127', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, color: '#3f4852', textTransform: 'uppercase', letterSpacing: 0.6, flex: 1 }}>Body</div>
                <button
                  onClick={() => copyToClipboard(response.body || '')}
                  title="Copy response body"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '1px 6px', borderRadius: 5, border: '1px solid #20272e', background: 'transparent', color: '#69737d', fontSize: 9.5, fontWeight: 700, cursor: 'pointer' }}
                >
                  <Icon name="copy" size={10} /> Copy
                </button>
              </div>
              <pre style={{ margin: 0, fontSize: 10.5, lineHeight: 1.65, color: '#c5cdd5', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 300, overflowY: 'auto' }}>
                {(() => {
                  try { return JSON.stringify(JSON.parse(response.body), null, 2) } catch { return response.body || '(empty)' }
                })()}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Env Manager ----------
// Drop a single pair of matching surrounding quotes, leaving inner text intact.
function unquoteEnv(v) {
  const s = String(v)
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    return s.slice(1, -1)
  }
  return s
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
                    style={{ width: 110, padding: '4px 7px', background: '#0f1318', border: `1px solid ${rgba(accent, 0.2)}`, borderRadius: 6, color: accent, fontSize: 11, fontFamily: 'monospace', outline: 'none', fontWeight: 700 }}
                  />
                  <span style={{ color: '#3f4852', flexShrink: 0 }}>=</span>
                  <input
                    value={p.value}
                    onChange={e => setPairValue(p.id, e.target.value)}
                    type={secret && !shown ? 'password' : 'text'}
                    placeholder="value"
                    spellCheck={false}
                    style={{ flex: 1, minWidth: 0, padding: '4px 7px', background: '#070909', border: '1px solid #1b2127', borderRadius: 6, color: '#d4dbe1', fontSize: 11, fontFamily: 'monospace', outline: 'none' }}
                  />
                  {secret && (
                    <button onClick={() => toggleVisible(p.id)} title={shown ? 'Hide' : 'Show'} style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid #20272e', background: 'transparent', color: '#5a646d', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={shown ? 'eyeOff' : 'eye'} size={11} />
                    </button>
                  )}
                  <button onClick={() => delPair(p.id)} style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid #1b2127', background: 'transparent', color: '#3f4852', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="trash" size={10} />
                  </button>
                </div>
              )
            })}
          </div>

          <div style={{ padding: '8px 10px', borderTop: '1px solid #1b2127' }}>
            {saveResult && (
              <div style={{ fontSize: 10.5, color: saveResult === 'Saved!' ? '#c3e88d' : '#ff5370', marginBottom: 5 }}>{saveResult}</div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={save}
                disabled={saving}
                style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', background: saving ? '#1c2126' : accent, color: saving ? '#3f4852' : '#0a0a0a', fontSize: 12, fontWeight: 800, cursor: saving ? 'default' : 'pointer' }}
              >
                {saving ? 'Saving...' : 'Save .env'}
              </button>
              <button
                onClick={copyEnv}
                disabled={!pairs.length}
                title="Copy .env to clipboard"
                className="flex items-center justify-center"
                style={{ width: 36, flexShrink: 0, borderRadius: 7, border: '1px solid #20272e', background: '#11151a', color: pairs.length ? '#8a939c' : '#2c333a', cursor: pairs.length ? 'pointer' : 'default' }}
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
        <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid #1b2127', display: 'flex', flexDirection: 'column', gap: 6 }}>
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
              style={{ padding: '5px 8px', background: '#0f1318', border: `1px solid ${key === 'host' ? rgba(accent, 0.3) : '#20272e'}`, borderRadius: 7, color: '#f1f4f6', fontSize: 11, outline: 'none', fontFamily: key === 'keyPath' || key === 'host' ? 'monospace' : 'inherit' }}
            />
          ))}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setCreating(false)} style={{ padding: '4px 11px', borderRadius: 6, border: '1px solid #20272e', background: 'transparent', color: '#69737d', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
            <button onClick={save} disabled={!form.host.trim()} style={{ padding: '4px 11px', borderRadius: 6, border: `1px solid ${rgba(accent, 0.4)}`, background: rgba(accent, 0.12), color: accent, fontSize: 11, fontWeight: 700, cursor: form.host.trim() ? 'pointer' : 'default', opacity: form.host.trim() ? 1 : 0.5 }}>Save</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        {!profiles.length ? (
          <PanelEmpty icon="lock" accent={accent} hint="Save SSH connection details for one-click access. Press + to add.">No SSH profiles</PanelEmpty>
        ) : profiles.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 6, border: '1px solid #1b2127', borderRadius: 9, background: '#0f1318' }}>
            <Icon name="lock" size={14} color={accent} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#d4dbe1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
              <div style={{ fontSize: 10, color: '#5a646d', fontFamily: 'monospace', marginTop: 1 }}>
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
            <button onClick={() => del(p.id)} title="Delete" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #1b2127', background: 'transparent', color: '#3f4852', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="trash" size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Markdown Preview ----------
function parseInline(text, accent) {
  const parts = []
  let rest = String(text)
  let k = 0
  while (rest.length) {
    let m
    if ((m = rest.match(/^`([^`]+)`/))) {
      parts.push(<code key={k++} style={{ background: '#1b2127', color: '#c3e88d', padding: '1px 5px', borderRadius: 4, fontSize: '0.88em' }}>{m[1]}</code>)
      rest = rest.slice(m[0].length); continue
    }
    if ((m = rest.match(/^\*\*([^*]+)\*\*/))) {
      parts.push(<strong key={k++} style={{ color: '#f1f4f6', fontWeight: 800 }}>{m[1]}</strong>)
      rest = rest.slice(m[0].length); continue
    }
    if ((m = rest.match(/^\*([^*]+)\*/))) {
      parts.push(<em key={k++} style={{ fontStyle: 'italic', color: '#d4dbe1' }}>{m[1]}</em>)
      rest = rest.slice(m[0].length); continue
    }
    if ((m = rest.match(/^~~([^~]+)~~/))) {
      parts.push(<span key={k++} style={{ textDecoration: 'line-through', color: '#5a646d' }}>{m[1]}</span>)
      rest = rest.slice(m[0].length); continue
    }
    if ((m = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/))) {
      const url = m[2]
      parts.push(<a key={k++} href="#" onClick={e => { e.preventDefault(); window.sush?.openExternal?.({ url }) }} style={{ color: accent, textDecoration: 'underline', cursor: 'pointer' }}>{m[1]}</a>)
      rest = rest.slice(m[0].length); continue
    }
    parts.push(rest[0])
    rest = rest.slice(1)
  }
  return parts
}

function renderMarkdown(content, accent) {
  const lines = content.split('\n')
  const out = []
  let i = 0
  let listItems = []
  let listType = null

  const flushList = () => {
    if (!listItems.length) return
    const Tag = listType === 'ul' ? 'ul' : 'ol'
    out.push(<Tag key={`list-${i}`} style={{ paddingLeft: 20, margin: '5px 0', color: '#c5cdd5', fontSize: 12.5 }}>{listItems}</Tag>)
    listItems = []; listType = null
  }

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('```')) {
      flushList()
      const code = []; i++
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++ }
      out.push(<pre key={`pre${i}`} style={{ background: '#0a0c0f', border: '1px solid #1b2127', borderRadius: 8, padding: '10px 12px', margin: '8px 0', fontSize: 11.5, overflowX: 'auto', color: '#c3e88d', fontFamily: 'monospace', lineHeight: 1.6 }}><code>{code.join('\n')}</code></pre>)
      i++; continue
    }

    const hM = line.match(/^(#{1,6})\s+(.+)/)
    if (hM) {
      flushList()
      const lvl = hM[1].length
      const sz = [20, 17, 15, 13.5, 12.5, 12][lvl - 1]
      out.push(<div key={`h${i}`} style={{ fontSize: sz, fontWeight: 800, color: lvl === 1 ? accent : '#f1f4f6', marginTop: lvl < 3 ? 14 : 10, marginBottom: 4, lineHeight: 1.3 }}>{parseInline(hM[2], accent)}</div>)
      i++; continue
    }

    if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
      flushList()
      out.push(<hr key={`hr${i}`} style={{ border: 'none', borderTop: '1px solid #1b2127', margin: '10px 0' }} />)
      i++; continue
    }

    if (line.startsWith('> ')) {
      flushList()
      out.push(<div key={`bq${i}`} style={{ borderLeft: `3px solid ${rgba(accent, 0.5)}`, paddingLeft: 10, margin: '4px 0', color: '#8a939c', fontSize: 12.5, fontStyle: 'italic' }}>{parseInline(line.slice(2), accent)}</div>)
      i++; continue
    }

    const ulM = line.match(/^[-*]\s+(.+)/)
    if (ulM) {
      if (listType !== 'ul') flushList(); listType = 'ul'
      listItems.push(<li key={`li${i}`} style={{ marginBottom: 2 }}>{parseInline(ulM[1], accent)}</li>)
      i++; continue
    }

    const olM = line.match(/^\d+\.\s+(.+)/)
    if (olM) {
      if (listType !== 'ol') flushList(); listType = 'ol'
      listItems.push(<li key={`li${i}`} style={{ marginBottom: 2 }}>{parseInline(olM[1], accent)}</li>)
      i++; continue
    }

    if (!line.trim()) { flushList(); out.push(<div key={`sp${i}`} style={{ height: 7 }} />); i++; continue }

    flushList()
    out.push(<p key={`p${i}`} style={{ margin: '3px 0', fontSize: 12.5, lineHeight: 1.75, color: '#c5cdd5' }}>{parseInline(line, accent)}</p>)
    i++
  }
  flushList()
  return out
}

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

      <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderBottom: '1px solid #1b2127' }}>
        <input
          value={path}
          onChange={e => setPath(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(path)}
          placeholder={cwd ? `${cwd}/README.md` : 'Path to .md file...'}
          spellCheck={false}
          style={{ flex: 1, padding: '5px 8px', background: '#0f1318', border: '1px solid #20272e', borderRadius: 7, color: '#f1f4f6', fontSize: 11, outline: 'none', fontFamily: 'monospace' }}
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

// ---------- Scratchpad ----------
const SCRATCH_KEY = 'sush-scratchpad'

function ScratchpadTab({ accent }) {
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(SCRATCH_KEY) ?? '' } catch { return '' }
  })
  const [savedAt, setSavedAt] = useState(false)

  // Debounced persist so we don't hit localStorage on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(SCRATCH_KEY, text) } catch {}
      setSavedAt(true)
      const clear = setTimeout(() => setSavedAt(false), 1200)
      return () => clearTimeout(clear)
    }, 400)
    return () => clearTimeout(t)
  }, [text])

  const chars = text.length
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const lines = text ? text.split('\n').length : 0

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="edit"
        title="Scratchpad"
        sub="Auto-saved · local to this machine"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => copyToClipboard(text)} title="Copy all" disabled={!text} className="sush-icon-btn flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #20272e', background: '#11151a', color: text ? '#8a939c' : '#2c333a', cursor: text ? 'pointer' : 'default' }}>
              <Icon name="copy" size={13} />
            </button>
            <button onClick={() => { if (text && confirm('Clear the scratchpad?')) setText('') }} title="Clear" disabled={!text} className="sush-icon-btn flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #20272e', background: '#11151a', color: text ? '#8a939c' : '#2c333a', cursor: text ? 'pointer' : 'default' }}>
              <Icon name="trash" size={12} />
            </button>
          </div>
        }
      />
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="A quick place for notes, snippets, TODOs… Everything here is saved automatically and survives restarts."
        spellCheck={false}
        style={{ flex: 1, padding: '12px 14px', background: '#0a0c0f', border: 'none', color: '#d4dbe1', outline: 'none', resize: 'none', fontSize: 12.5, lineHeight: 1.65, fontFamily: "'Cascadia Code', 'Fira Code', monospace" }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 12px', borderTop: '1px solid #1b2127', fontSize: 10, color: '#5a646d' }}>
        <span>{words} words</span>
        <span>{chars} chars</span>
        <span>{lines} lines</span>
        <span style={{ marginLeft: 'auto', color: savedAt ? '#c3e88d' : '#3f4852', transition: 'color .2s ease' }}>{savedAt ? 'Saved ✓' : 'Auto-save'}</span>
      </div>
    </div>
  )
}

// ===== Shared little controls for the dev-tool tabs =====
function Segmented({ options, value, onChange, accent }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {options.map(o => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{ padding: '4px 10px', borderRadius: 7, border: `1px solid ${active ? rgba(accent, 0.45) : '#20272e'}`, background: active ? rgba(accent, 0.12) : 'transparent', color: active ? accent : '#8a939c', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function CopyRow({ label, value, accent, mono = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#0f1318', border: '1px solid #1b2127', borderRadius: 8 }}>
      <span style={{ fontSize: 9.5, fontWeight: 800, color: '#5a646d', textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 42, flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: '#d4dbe1', fontFamily: mono ? 'monospace' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '—'}</span>
      <button onClick={() => copyToClipboard(value)} disabled={!value} title="Copy" style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 6, border: '1px solid #20272e', background: 'transparent', color: value ? accent : '#2c333a', cursor: value ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="copy" size={11} />
      </button>
    </div>
  )
}

// ---------- Convert (Base64 / URL / JWT) ----------
function b64encode(str) {
  try { return btoa(String.fromCharCode(...new TextEncoder().encode(str))) } catch { return '' }
}
function b64decode(str) {
  const bin = atob(str.trim())
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
}
function b64urlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return b64decode(s)
}

function ConvertTab({ accent }) {
  const [mode, setMode] = useState('base64')
  const [input, setInput] = useState('')

  const { output, error } = useMemo(() => {
    if (!input.trim()) return { output: '', error: null }
    try {
      if (mode === 'base64-dec') return { output: b64decode(input), error: null }
      if (mode === 'base64') return { output: b64encode(input), error: null }
      if (mode === 'url') return { output: encodeURIComponent(input), error: null }
      if (mode === 'url-dec') return { output: decodeURIComponent(input.trim()), error: null }
      if (mode === 'jwt') {
        const parts = input.trim().split('.')
        if (parts.length < 2) return { output: '', error: 'Not a JWT (needs header.payload.signature)' }
        const header = JSON.parse(b64urlDecode(parts[0]))
        const payload = JSON.parse(b64urlDecode(parts[1]))
        let extra = ''
        if (payload.exp) extra = `\n\n// exp: ${new Date(payload.exp * 1000).toLocaleString()}${payload.exp * 1000 < Date.now() ? ' (EXPIRED)' : ''}`
        return { output: `// header\n${JSON.stringify(header, null, 2)}\n\n// payload\n${JSON.stringify(payload, null, 2)}${extra}`, error: null }
      }
      return { output: '', error: null }
    } catch (e) { return { output: '', error: e.message } }
  }, [mode, input])

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader accent={accent} icon="code" title="Convert" sub="Base64 · URL · JWT" />
      <div style={{ padding: '10px', borderBottom: '1px solid #1b2127', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Segmented
          accent={accent}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'base64', label: 'B64 enc' },
            { value: 'base64-dec', label: 'B64 dec' },
            { value: 'url', label: 'URL enc' },
            { value: 'url-dec', label: 'URL dec' },
            { value: 'jwt', label: 'JWT' }
          ]}
        />
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={mode === 'jwt' ? 'Paste a JWT…' : 'Input text…'}
          spellCheck={false}
          rows={5}
          style={{ padding: '8px 10px', background: '#070909', border: '1px solid #1b2127', borderRadius: 8, color: '#d4dbe1', fontSize: 11.5, outline: 'none', resize: 'vertical', fontFamily: 'monospace', lineHeight: 1.55 }}
        />
      </div>
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        {error && <div style={{ color: '#ff5370', fontSize: 11.5, padding: '4px 0' }}>{error}</div>}
        {!error && output && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => copyToClipboard(output)} title="Copy output" style={{ position: 'absolute', top: 6, right: 6, display: 'flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 6, border: `1px solid ${rgba(accent, 0.3)}`, background: rgba(accent, 0.1), color: accent, fontSize: 9.5, fontWeight: 700, cursor: 'pointer' }}>
              <Icon name="copy" size={10} /> Copy
            </button>
            <pre style={{ margin: 0, padding: '10px', paddingTop: 32, background: '#0a0c0f', border: '1px solid #1b2127', borderRadius: 8, fontSize: 11.5, lineHeight: 1.6, color: '#c3e88d', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{output}</pre>
          </div>
        )}
        {!error && !output && <PanelEmpty icon="code" accent={accent} hint="Pick a mode and paste your input above.">Nothing to convert</PanelEmpty>}
      </div>
    </div>
  )
}

// ---------- Color converter / picker ----------
function hexToRgb(hex) {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0; const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function ColorTab({ accent }) {
  const [hex, setHex] = useState('#ff6b9d')
  const rgb = hexToRgb(hex)
  const hsl = rgb ? rgbToHsl(rgb.r, rgb.g, rgb.b) : null
  const valid = !!rgb
  const normHex = valid ? '#' + [rgb.r, rgb.g, rgb.b].map(x => x.toString(16).padStart(2, '0')).join('') : hex

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader accent={accent} icon="palette" title="Color" sub="HEX · RGB · HSL" />
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, border: '1px solid #2c333a', background: valid ? normHex : '#11151a', flexShrink: 0, boxShadow: valid ? `0 6px 18px ${normHex}55` : 'none' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              value={hex}
              onChange={e => setHex(e.target.value)}
              spellCheck={false}
              placeholder="#rrggbb"
              style={{ padding: '7px 10px', background: '#070909', border: `1px solid ${valid ? '#1b2127' : 'rgba(255,83,112,0.4)'}`, borderRadius: 8, color: valid ? '#d4dbe1' : '#ff5370', fontSize: 13, outline: 'none', fontFamily: 'monospace', fontWeight: 700 }}
            />
            <input
              type="color"
              value={valid ? normHex : '#000000'}
              onChange={e => setHex(e.target.value)}
              style={{ width: '100%', height: 30, background: 'transparent', border: '1px solid #1b2127', borderRadius: 8, cursor: 'pointer', padding: 2 }}
            />
          </div>
        </div>
        {valid ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <CopyRow label="HEX" value={normHex} accent={accent} />
            <CopyRow label="RGB" value={`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`} accent={accent} />
            <CopyRow label="HSL" value={`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`} accent={accent} />
            <CopyRow label="CSS" value={`color: ${normHex};`} accent={accent} />
          </div>
        ) : (
          <PanelEmpty icon="palette" accent={accent} hint="Enter a 3- or 6-digit hex like #f6a or #ff66aa.">Invalid color</PanelEmpty>
        )}
      </div>
    </div>
  )
}

// ---------- Hash (Web Crypto) ----------
function HashTab({ accent }) {
  const [input, setInput] = useState('')
  const [hashes, setHashes] = useState({})

  useEffect(() => {
    let alive = true
    if (!input) { setHashes({}); return }
    const data = new TextEncoder().encode(input)
    const algos = ['SHA-1', 'SHA-256', 'SHA-512']
    Promise.all(algos.map(a =>
      crypto.subtle.digest(a, data).then(buf => [a, [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')])
    )).then(entries => { if (alive) setHashes(Object.fromEntries(entries)) }).catch(() => {})
    return () => { alive = false }
  }, [input])

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader accent={accent} icon="hash" title="Hash" sub="SHA-1 · SHA-256 · SHA-512" />
      <div style={{ padding: 10, borderBottom: '1px solid #1b2127' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Text to hash…"
          spellCheck={false}
          rows={4}
          style={{ width: '100%', padding: '8px 10px', background: '#070909', border: '1px solid #1b2127', borderRadius: 8, color: '#d4dbe1', fontSize: 11.5, outline: 'none', resize: 'vertical', fontFamily: 'monospace', lineHeight: 1.55, boxSizing: 'border-box' }}
        />
      </div>
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!input ? (
          <PanelEmpty icon="hash" accent={accent} hint="Hashes are computed locally with the Web Crypto API.">Enter text to hash</PanelEmpty>
        ) : ['SHA-1', 'SHA-256', 'SHA-512'].map(a => (
          <div key={a} style={{ background: '#0a0c0f', border: '1px solid #1b2127', borderRadius: 8, padding: '7px 9px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: accent, letterSpacing: 0.5, flex: 1 }}>{a}</span>
              <button onClick={() => copyToClipboard(hashes[a])} disabled={!hashes[a]} title="Copy" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '1px 6px', borderRadius: 5, border: '1px solid #20272e', background: 'transparent', color: hashes[a] ? '#8a939c' : '#2c333a', fontSize: 9, fontWeight: 700, cursor: hashes[a] ? 'pointer' : 'default' }}>
                <Icon name="copy" size={9} /> Copy
              </button>
            </div>
            <div style={{ fontSize: 10.5, color: '#9aa3ab', fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.5 }}>{hashes[a] || '…'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Generators (UUID / token / timestamp / lorem) ----------
const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat'.split(' ')

function GenerateTab({ accent }) {
  const [tick, setTick] = useState(0)
  const regen = () => setTick(t => t + 1)
  const [tokenLen, setTokenLen] = useState(24)
  const [loremN, setLoremN] = useState(2)

  // tick is a dependency so each regen produces fresh values.
  const uuid = useMemo(() => (crypto.randomUUID ? crypto.randomUUID() : 'crypto.randomUUID unavailable'), [tick])
  const token = useMemo(() => {
    const bytes = new Uint8Array(tokenLen)
    crypto.getRandomValues(bytes)
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, tokenLen)
  }, [tick, tokenLen])
  const nowMs = useMemo(() => {
    // Date.now via performance-free path is fine in the renderer.
    return new Date()
  }, [tick])
  const lorem = useMemo(() => {
    const lines = []
    for (let i = 0; i < loremN; i++) {
      const n = 18 + (i * 7 % 20)
      let s = LOREM.slice(0, n).join(' ')
      lines.push(s.charAt(0).toUpperCase() + s.slice(1) + '.')
    }
    return lines.join('\n\n')
  }, [tick, loremN])

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="shuffle"
        title="Generate"
        sub="UUID · token · time · lorem"
        right={
          <button onClick={regen} title="Regenerate all" className="sush-icon-btn flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${rgba(accent, 0.35)}`, background: rgba(accent, 0.1), color: accent, cursor: 'pointer' }}>
            <Icon name="refresh" size={13} />
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <StatCard title="UUID v4" accent={accent}>
          <CopyRow label="uuid" value={uuid} accent={accent} />
        </StatCard>

        <StatCard title="Random token (hex)" accent={accent}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <input type="range" min={8} max={64} value={tokenLen} onChange={e => setTokenLen(Number(e.target.value))} style={{ flex: 1, accentColor: accent }} />
            <span style={{ fontSize: 10.5, color: '#8a939c', minWidth: 48, textAlign: 'right' }}>{tokenLen} chars</span>
          </div>
          <CopyRow label="token" value={token} accent={accent} />
        </StatCard>

        <StatCard title="Timestamp" accent={accent}>
          <CopyRow label="unix" value={String(Math.floor(nowMs.getTime() / 1000))} accent={accent} />
          <CopyRow label="ms" value={String(nowMs.getTime())} accent={accent} />
          <CopyRow label="iso" value={nowMs.toISOString()} accent={accent} />
        </StatCard>

        <StatCard title="Lorem ipsum" accent={accent}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <input type="range" min={1} max={6} value={loremN} onChange={e => setLoremN(Number(e.target.value))} style={{ flex: 1, accentColor: accent }} />
            <span style={{ fontSize: 10.5, color: '#8a939c', minWidth: 64, textAlign: 'right' }}>{loremN} para{loremN > 1 ? 's' : ''}</span>
          </div>
          <div style={{ position: 'relative' }}>
            <button onClick={() => copyToClipboard(lorem)} title="Copy" style={{ position: 'absolute', top: 4, right: 4, display: 'flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 5, border: '1px solid #20272e', background: '#0f1318', color: accent, fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>
              <Icon name="copy" size={9} /> Copy
            </button>
            <pre style={{ margin: 0, padding: '8px 9px', paddingTop: 26, background: '#0a0c0f', border: '1px solid #1b2127', borderRadius: 7, fontSize: 11, lineHeight: 1.6, color: '#9aa3ab', whiteSpace: 'pre-wrap' }}>{lorem}</pre>
          </div>
        </StatCard>
      </div>
    </div>
  )
}

// ---------- Cheatsheet (click to run / copy) ----------
const CHEATS = [
  { cat: 'git', items: [
    { label: 'Status (short)', cmd: 'git status -sb' },
    { label: 'Log (graph)', cmd: 'git log --oneline --graph --all -20' },
    { label: 'Undo last commit (keep changes)', cmd: 'git reset --soft HEAD~1' },
    { label: 'Discard local changes', cmd: 'git checkout -- .' },
    { label: 'Current branch', cmd: 'git branch --show-current' },
    { label: 'Stash all', cmd: 'git stash -u' }
  ] },
  { cat: 'npm', items: [
    { label: 'Install', cmd: 'npm install' },
    { label: 'Outdated', cmd: 'npm outdated' },
    { label: 'List top-level', cmd: 'npm ls --depth=0' },
    { label: 'Run dev', cmd: 'npm run dev' }
  ] },
  { cat: 'docker', items: [
    { label: 'Running containers', cmd: 'docker ps' },
    { label: 'All containers', cmd: 'docker ps -a' },
    { label: 'Images', cmd: 'docker images' },
    { label: 'Prune system', cmd: 'docker system prune -f' }
  ] },
  { cat: 'system', items: [
    { label: 'Disk usage', cmd: 'df -h' },
    { label: 'Listening ports', cmd: 'netstat -ano' },
    { label: 'Env vars', cmd: 'Get-ChildItem Env:' }
  ] }
]

function CheatsTab({ accent, onRun }) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const groups = CHEATS.map(g => ({
    ...g,
    items: g.items.filter(it => !q || it.label.toLowerCase().includes(q) || it.cmd.toLowerCase().includes(q))
  })).filter(g => g.items.length)

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader accent={accent} icon="compass" title="Cheatsheet" sub="Click to run · copy" />
      <div style={{ padding: '8px 10px 0' }}>
        <div className="sush-omni flex items-center" style={{ height: 30, gap: 7 }}>
          <Icon name="search" size={12} color="#5a646d" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search commands…" spellCheck={false} style={{ flex: 1, background: 'transparent', border: 'none', color: '#f1f4f6', outline: 'none', fontSize: 11.5 }} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        {!groups.length ? (
          <PanelEmpty icon="compass" accent={accent}>No matches</PanelEmpty>
        ) : groups.map(g => (
          <div key={g.cat} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: 0.8, padding: '0 4px 5px' }}>{g.cat}</div>
            {g.items.map(it => (
              <div key={it.cmd} className="flex items-center" style={{ gap: 7, padding: '6px 8px', marginBottom: 5, border: '1px solid #1b2127', borderRadius: 8, background: '#0f1318' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#d4dbe1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</div>
                  <div style={{ fontSize: 10, color: '#5a646d', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.cmd}</div>
                </div>
                <button onClick={() => copyToClipboard(it.cmd)} title="Copy" style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, border: '1px solid #1b2127', background: 'transparent', color: '#5a646d', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="copy" size={11} />
                </button>
                <button onClick={() => onRun?.(it.cmd)} title="Run" style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, border: `1px solid ${rgba(accent, 0.3)}`, background: rgba(accent, 0.08), color: accent, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="arrowRight" size={12} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
