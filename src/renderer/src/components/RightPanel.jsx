import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import Seducia from './Seducia'
import { rgba, accentVars } from '../lib/ui'

const TABS = [
  { id: 'agent', label: 'Agent', icon: 'sparkles' },
  { id: 'changes', label: 'Changes', icon: 'gitBranch' },
  { id: 'files', label: 'Files', icon: 'file' },
  { id: 'memory', label: 'Memory', icon: 'book' }
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
  onClose
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
      <div className="flex items-center" style={{ gap: 4, padding: '8px 8px', borderBottom: `1px solid ${rgba(accent, 0.1)}` }}>
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
                padding: '0 10px',
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
          />
        )}
        {tab === 'changes' && <ChangesTab accent={accent} cwd={activeCwd} onOpenFile={(p) => onRun(`edit "${p}"`)} />}
        {tab === 'files' && <FilesTab accent={accent} cwd={activeCwd} onOpenFile={(p) => onRun(`edit "${p}"`)} />}
        {tab === 'memory' && <MemoryTab accent={accent} cwd={activeCwd} />}
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

  if (entries === null) return <div style={{ paddingLeft: 10 + depth * 14, color: '#69737d', fontSize: 11.5, padding: '4px 0 4px' }}>…</div>
  if (!entries.length) return <div style={{ paddingLeft: 10 + depth * 14, color: '#69737d', fontSize: 11.5, padding: '4px 0' }}>empty</div>
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
