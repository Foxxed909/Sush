import React, { useCallback, useEffect, useRef, useState } from 'react'
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
  { id: 'snippets', label: 'Snippets', icon: 'layers' },
  { id: 'ports', label: 'Ports', icon: 'ports' },
  { id: 'stats', label: 'Stats', icon: 'activity' },
]

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
  settings = {},
  planId = 'free',
  commandHistory = []
}) {
  return (
    <aside
      className="shrink-0 flex flex-col"
      style={{
        ...accentVars(accent),
        width: 360,
        minWidth: 300,
        maxWidth: '42vw',
        background: '#090b0d',
        borderLeft: `1px solid ${rgba(accent, 0.16)}`
      }}
    >
      {/* Tab header */}
      <div className="flex items-center" style={{ gap: 4, rowGap: 6, flexWrap: 'wrap', padding: '8px 8px', borderBottom: `1px solid ${rgba(accent, 0.1)}` }}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => onTab(t.id)}
              className="flex items-center sush-icon-btn"
              style={{
                gap: 6,
                height: 30,
                padding: '0 9px',
                borderRadius: 8,
                border: `1px solid ${active ? rgba(accent, 0.45) : 'transparent'}`,
                background: active ? rgba(accent, 0.12) : 'transparent',
                color: active ? accent : '#8a939c',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              <Icon name={t.icon} size={13} strokeWidth={2} />
              {t.label}
            </button>
          )
        })}
        <button
          onClick={onClose}
          title="Collapse panel"
          className="sush-icon-btn flex items-center justify-center"
          style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 8, border: '1px solid #20272e', background: '#11151a', color: '#8a939c', cursor: 'pointer' }}
        >
          <Icon name="panel" size={15} />
        </button>
      </div>

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
        {tab === 'changes' && <ChangesTab accent={accent} cwd={activeCwd} onOpenFile={(p) => onRun(`edit "${p}"`)} />}
        {tab === 'files' && <FilesTab accent={accent} cwd={activeCwd} onOpenFile={(p) => onRun(`edit "${p}"`)} />}
        {tab === 'memory' && <MemoryTab accent={accent} cwd={activeCwd} />}
        {tab === 'scripts' && <ScriptsTab accent={accent} cwd={activeCwd} onRun={onRun} />}
        {tab === 'history' && <HistoryTab accent={accent} history={commandHistory} onRun={onRun} />}
        {tab === 'snippets' && <SnippetsTab accent={accent} onRun={onRun} />}
        {tab === 'ports' && <PortsTab accent={accent} onRun={onRun} />}
        {tab === 'stats' && <StatsTab accent={accent} />}
      </div>
    </aside>
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

// ---------- Changes ----------
function ChangesTab({ accent, cwd, onOpenFile }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    if (!cwd) { setData({ repo: false, files: [] }); setLoading(false); return }
    setLoading(true)
    window.sush?.gitStatus?.({ cwd }).then(res => { setData(res); setLoading(false) }).catch(() => { setData({ repo: false, files: [] }); setLoading(false) })
  }
  useEffect(() => { load() }, [cwd]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <PanelEmpty icon="gitBranch" accent={accent}>Reading changes…</PanelEmpty>
  if (!data?.repo) return <PanelEmpty icon="gitBranch" accent={accent} hint="Open a session inside a git repository to see its working-tree changes here.">Not a git repository</PanelEmpty>

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="gitBranch"
        title={data.branch || 'changes'}
        sub={`${data.files.length} change${data.files.length === 1 ? '' : 's'}`}
        onRefresh={load}
      />
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 8 }}>
        {data.files.length ? data.files.map(f => {
          const meta = statusMeta(f.status)
          return (
            <button
              key={f.path}
              onClick={() => onOpenFile(joinPath(data.dir || cwd, f.path))}
              title={f.path}
              className="sush-row flex items-center"
              style={{ gap: 10, width: '100%', textAlign: 'left', border: '1px solid transparent', borderRadius: 8, background: 'transparent', color: '#cdd5dc', padding: '6px 8px', cursor: 'pointer' }}
            >
              <span style={{ width: 18, textAlign: 'center', fontSize: 11, fontWeight: 900, color: meta.c, flexShrink: 0 }}>{meta.t}</span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName(f.path)}</span>
                <span style={{ display: 'block', fontSize: 10, color: '#69737d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</span>
              </span>
            </button>
          )
        }) : (
          <PanelEmpty icon="check" accent={accent}>Working tree clean</PanelEmpty>
        )}
      </div>
    </div>
  )
}

// ---------- Files ----------
function FilesTab({ accent, cwd, onOpenFile }) {
  if (!cwd) return <PanelEmpty icon="file" accent={accent}>No directory</PanelEmpty>
  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader accent={accent} icon="folder" title={fileName(cwd)} sub={cwd} />
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 8 }}>
        <TreeLevel path={cwd} depth={0} accent={accent} onOpenFile={onOpenFile} />
      </div>
    </div>
  )
}

function TreeLevel({ path, depth, accent, onOpenFile }) {
  const [entries, setEntries] = useState(null)
  useEffect(() => {
    let alive = true
    window.sush?.listDir?.({ path }).then(res => { if (alive) setEntries(res.entries || []) }).catch(() => { if (alive) setEntries([]) })
    return () => { alive = false }
  }, [path])

  if (entries === null) return <div style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 10 + depth * 14, color: '#69737d', fontSize: 11.5 }}>…</div>
  if (!entries.length) return <div style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 10 + depth * 14, color: '#69737d', fontSize: 11.5 }}>empty</div>
  return entries.map(entry => (
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
              placeholder="note name…"
              spellCheck={false}
              style={{ flex: 1, minWidth: 0, height: '100%', background: 'transparent', border: 'none', color: '#f1f4f6', outline: 'none', fontSize: 12.5 }}
            />
          </div>
        )}
        {notes === null ? (
          <PanelEmpty icon="book" accent={accent}>Loading…</PanelEmpty>
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
          <PanelEmpty icon="rocket" accent={accent}>Loading…</PanelEmpty>
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

// ---------- Command History ----------
function HistoryTab({ accent, history, onRun }) {
  const [search, setSearch] = useState('')
  const displayed = history.filter(cmd => !search || cmd.toLowerCase().includes(search.toLowerCase())).slice().reverse()

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader accent={accent} icon="clock" title="History" sub={`${history.length} commands`} />
      <div style={{ padding: '8px 10px 0' }}>
        <div className="sush-omni flex items-center" style={{ height: 34, gap: 8 }}>
          <Icon name="search" size={13} color="#5a646d" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter history…"
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#f1f4f6', outline: 'none', fontSize: 12 }}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        {!displayed.length ? (
          <PanelEmpty icon="clock" accent={accent} hint="Commands you run in the active session will appear here.">No history yet</PanelEmpty>
        ) : displayed.map((cmd, i) => (
          <button
            key={i}
            onClick={() => onRun(cmd)}
            title={`Run: ${cmd}`}
            className="sush-row flex items-center"
            style={{ gap: 9, width: '100%', textAlign: 'left', border: '1px solid #1b2127', borderRadius: 8, background: '#0f1318', color: '#9aa3ab', padding: '6px 10px', marginBottom: 5, cursor: 'pointer', fontFamily: 'monospace', fontSize: 11.5 }}
          >
            <Icon name="chevronRight" size={11} color="#3f4852" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{cmd}</span>
          </button>
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

  if (!stats && !statErr) return <PanelEmpty icon="activity" accent={accent}>Loading system stats…</PanelEmpty>
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
const DEV_PORTS = new Set([
  3000, 3001, 3002, 3003, 3004, 3005,
  4000, 4200, 4321,
  5000, 5173, 5174, 5175, 5176,
  6006, 7000, 7070,
  8000, 8080, 8081, 8082, 8083, 8888,
  9000, 9001, 9229,
  24678
])

const APP_KEYWORDS = ['node', 'bun', 'deno', 'python', 'python3', 'ruby', 'go', 'java', 'php', 'dotnet', 'vite', 'next', 'nuxt', 'cargo', 'uvicorn', 'gunicorn', 'puma', 'rails', 'flask', 'django', 'fastapi', 'express', 'esbuild']
const SVC_KEYWORDS = ['nginx', 'apache', 'httpd', 'postgres', 'mysqld', 'redis', 'mongod', 'rabbitmq', 'elastic', 'kafka', 'zookeeper', 'memcached', 'grafana', 'prometheus', 'caddy']

function categorizePort(port, processName) {
  const p = Number(port)
  const name = (processName || '').toLowerCase()
  if (p < 1024) return 'system'
  if (SVC_KEYWORDS.some(k => name.includes(k))) return 'service'
  if (APP_KEYWORDS.some(k => name.includes(k))) return 'app'
  if (DEV_PORTS.has(p)) return 'app'
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

  if (!data) return <PanelEmpty icon="ports" accent={accent}>Scanning ports…</PanelEmpty>

  const ports = data.ports ?? []
  const counts = { all: ports.length }
  for (const f of ['app', 'service', 'system']) {
    counts[f] = ports.filter(p => categorizePort(p.port, p.process) === f).length
  }
  const filtered = filter === 'all' ? ports : ports.filter(p => categorizePort(p.port, p.process) === filter)

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

      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 8 }}>
        {!filtered.length ? (
          <PanelEmpty
            icon="ports"
            accent={accent}
            hint={filter !== 'all' ? `No ${filter} ports are currently listening.` : 'No listening ports found.'}
          >
            No {filter === 'all' ? '' : CAT[filter]?.label + ' '}ports
          </PanelEmpty>
        ) : filtered.map(p => {
          const cat = categorizePort(p.port, p.process)
          const c = CAT[cat]
          const isKilling = killing.has(p.port)
          const isHttp = Number(p.port) < 65535

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
            placeholder="Name (e.g. Start dev server)…"
            spellCheck={false}
            style={{ padding: '6px 9px', background: '#0f1318', border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 7, color: '#f1f4f6', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' }}
          />
          <input
            ref={cmdRef}
            value={newCmd}
            onChange={e => setNewCmd(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addSnippet(); if (e.key === 'Escape') cancel() }}
            placeholder="Command (e.g. npm run dev)…"
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
            placeholder="Search snippets…"
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
