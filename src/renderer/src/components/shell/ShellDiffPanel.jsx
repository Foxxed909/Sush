import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import { usePolling } from '../../hooks/usePolling'
import { useThreadFeed } from '../../hooks/useThreadFeed'
import { buildTurns } from '../../lib/threadTurns'
import { diffTotals, gapBefore, parseUnifiedDiff, splitRows } from '../../lib/unifiedDiff'

// Nightly diff panel, after T3 Code's DiffPanel (MIT, (c) 2026 T3 Tools Inc.):
// the working tree against HEAD, one collapsible section per file with line
// numbers, folded unmodified lines, unified or split view, and a scope picker
// that narrows to the files a Thread turn touched.

const VIEW_KEY = 'sush-shell-diff-view'
const WRAP_KEY = 'sush-shell-diff-wrap'
const MAX_UNTRACKED = 20
const MAX_LINES_PER_FILE = 1200

function samePath(repoRel, turnPath) {
  const a = String(repoRel || '').replace(/\\/g, '/')
  const b = String(turnPath || '').replace(/\\/g, '/')
  return a === b || b.endsWith(`/${a}`) || a.endsWith(`/${b}`)
}

function splitPath(path) {
  const p = String(path || '')
  const i = p.lastIndexOf('/')
  return i < 0 ? { dir: '', name: p } : { dir: p.slice(0, i + 1), name: p.slice(i + 1) }
}

const STATUS_MARK = { added: ['A', 'is-add'], deleted: ['D', 'is-del'], renamed: ['R', 'is-ren'], modified: ['M', 'is-mod'] }

function Gap({ count }) {
  if (!count) return null
  return <div className="sd-gap">{count} unmodified line{count === 1 ? '' : 's'}</div>
}

function UnifiedHunk({ hunk }) {
  return hunk.lines.map((line, i) => (
    <div key={i} className={`sd-row is-${line.kind}`}>
      <span className="sd-no">{line.old ?? ''}</span>
      <span className="sd-no">{line.new ?? ''}</span>
      <span className="sd-code"><i>{line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '}</i>{line.text || ' '}</span>
    </div>
  ))
}

function SplitHunk({ hunk }) {
  return splitRows(hunk).map((row, i) => (
    <div key={i} className="sd-split">
      <div className={`sd-row is-${row.left ? (row.left.kind === 'ctx' ? 'ctx' : 'del') : 'empty'}`}>
        <span className="sd-no">{row.left?.old ?? ''}</span>
        <span className="sd-code">{row.left ? (row.left.text || ' ') : ''}</span>
      </div>
      <div className={`sd-row is-${row.right ? (row.right.kind === 'ctx' ? 'ctx' : 'add') : 'empty'}`}>
        <span className="sd-no">{row.right?.new ?? ''}</span>
        <span className="sd-code">{row.right ? (row.right.text || ' ') : ''}</span>
      </div>
    </div>
  ))
}

function FileSection({ file, view, collapsed, onToggle, onSend }) {
  const [mark, tone] = STATUS_MARK[file.status] || STATUS_MARK.modified
  const { dir, name } = splitPath(file.path)
  let budget = MAX_LINES_PER_FILE
  return (
    <section className={`sd-file${collapsed ? ' is-collapsed' : ''}`}>
      <header className="sd-file-head">
        <button className="sd-file-toggle" onClick={onToggle} aria-expanded={!collapsed}>
          <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={12} />
          <span className={`sd-status ${tone}`}>{mark}</span>
          <span className="sd-path" title={file.path}><span>{dir}</span>{name}</span>
        </button>
        <button className="sd-mini" onClick={() => window.sush?.copyText?.(file.path)} title="Copy path" aria-label="Copy path"><Icon name="copy" size={11} /></button>
        <span className="sd-count is-del">−{file.removed}</span>
        <span className="sd-count is-add">+{file.added}</span>
        <button className="sd-mini" onClick={() => onSend(file)} title="Send this diff to the agent (fills the composer)" aria-label="Send to agent"><Icon name="send" size={11} /></button>
      </header>
      {!collapsed && (
        <div className="sd-file-body">
          {file.binary && <div className="sd-gap">Binary file</div>}
          {file.hunks.map((hunk, index) => {
            if (budget <= 0) return null
            budget -= hunk.lines.length
            return (
              <React.Fragment key={index}>
                <Gap count={gapBefore(file.hunks, index)} />
                {view === 'split' ? <SplitHunk hunk={hunk} /> : <UnifiedHunk hunk={hunk} />}
              </React.Fragment>
            )
          })}
          {budget <= 0 && <div className="sd-gap">Long diff — open the file to see the rest</div>}
        </div>
      )}
    </section>
  )
}

export default function ShellDiffPanel({ cwd, activeTab, onCommit }) {
  const [files, setFiles] = useState([])
  const [state, setState] = useState({ loading: true, error: '', truncated: false, repo: true })
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) === 'split' ? 'split' : 'unified')
  const [wrap, setWrap] = useState(() => localStorage.getItem(WRAP_KEY) === '1')
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [scope, setScope] = useState('all')
  const requestRef = useRef(0)
  const inflightRef = useRef(null)
  const lastTextRef = useRef(null)

  const load = useCallback(async () => {
    if (!cwd) { setFiles([]); setState({ loading: false, error: '', truncated: false, repo: false }); return }
    // One git round at a time per folder: mount, the poller and a click can
    // all ask at once.
    if (inflightRef.current === cwd) return
    inflightRef.current = cwd
    const id = ++requestRef.current
    try {
      const status = await window.sush?.gitStatus?.({ cwd })
      if (id !== requestRef.current) return
      if (!status?.repo) { setFiles([]); setState({ loading: false, error: '', truncated: false, repo: false }); return }
      const dir = status.dir || cwd
      const head = await window.sush?.gitDiffHead?.({ cwd: dir })
      const untracked = (status.files || []).filter(f => String(f.rawStatus || f.status || '').startsWith('??')).slice(0, MAX_UNTRACKED)
      const extra = await Promise.all(untracked.map(f => window.sush?.gitDiffFile?.({ cwd: dir, path: f.path, untracked: true }).catch(() => null)))
      if (id !== requestRef.current) return
      const text = [head?.diff || '', ...extra.map(r => r?.diff || '')].join('\n')
      // Unchanged working tree: keep the parsed files (and every rendered row).
      if (text !== lastTextRef.current) {
        lastTextRef.current = text
        setFiles(parseUnifiedDiff(text))
      }
      setState({
        loading: false,
        error: head?.ok === false ? head.error : '',
        truncated: !!head?.truncated,
        tooLarge: !!head?.tooLarge,
        repo: true
      })
    } catch (e) {
      if (id === requestRef.current) setState(s => ({ ...s, loading: false, error: e?.message || 'Could not read the diff' }))
    } finally {
      if (inflightRef.current === cwd) inflightRef.current = null
    }
  }, [cwd])
  useEffect(() => { setScope('all'); setCollapsed(new Set()); lastTextRef.current = null; load() }, [load])
  usePolling(load, 10000, !!cwd)

  // Turn scopes: the files each Thread turn edited (bridged Claude sessions).
  const { items } = useThreadFeed(activeTab)
  const turns = useMemo(() => {
    let n = 0
    return buildTurns(items).filter(b => b.kind === 'user' || b.kind === 'work').reduce((acc, b) => {
      if (b.kind === 'user') n++
      else if (b.files.length) acc.push({ id: `turn-${n}`, label: `Turn ${n}`, paths: b.files.map(f => f.path) })
      return acc
    }, [])
  }, [items])
  const scoped = useMemo(() => {
    const turn = turns.find(t => t.id === scope)
    return turn ? files.filter(f => turn.paths.some(p => samePath(f.path, p))) : files
  }, [files, turns, scope])
  const totals = diffTotals(scoped)

  const setViewMode = next => { setView(next); try { localStorage.setItem(VIEW_KEY, next) } catch {} }
  const toggleWrap = () => setWrap(prev => { try { localStorage.setItem(WRAP_KEY, prev ? '0' : '1') } catch {}; return !prev })
  const allCollapsed = scoped.length > 0 && scoped.every(f => collapsed.has(f.path))
  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(scoped.map(f => f.path)))
  const toggleFile = path => setCollapsed(prev => { const next = new Set(prev); next.has(path) ? next.delete(path) : next.add(path); return next })
  const sendFile = file => {
    const body = file.hunks.map(h => [`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, ...h.lines.map(l => `${l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '}${l.text}`)].join('\n')).join('\n')
    const clipped = body.length > 12000 ? `${body.slice(0, 12000)}\n… (diff truncated)` : body
    window.dispatchEvent(new CustomEvent('sush:composer-fill', { detail: { text: `Please review my changes to ${file.path}:\n\n\`\`\`diff\n${clipped}\n\`\`\`\n` } }))
  }

  return (
    <div className={`sd-panel${wrap ? ' is-wrap' : ''}`}>
      <div className="sd-toolbar">
        <label className="sd-scope">
          <select value={scope} onChange={e => setScope(e.target.value)} aria-label="Diff scope">
            <option value="all">All changes</option>
            {turns.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <Icon name="chevronDown" size={11} />
        </label>
        <span className="sd-totals"><em className="is-add">+{totals.added}</em> <em className="is-del">−{totals.removed}</em></span>
        <span className="sd-flex" />
        <button className="sd-tool" onClick={toggleAll} title={allCollapsed ? 'Expand all' : 'Collapse all'} aria-label={allCollapsed ? 'Expand all' : 'Collapse all'}>
          <Icon name={allCollapsed ? 'chevronDown' : 'minus'} size={13} />
        </button>
        <button className={`sd-tool${view === 'unified' ? ' is-on' : ''}`} onClick={() => setViewMode('unified')} title="Unified" aria-pressed={view === 'unified'}><Icon name="layers" size={13} /></button>
        <button className={`sd-tool${view === 'split' ? ' is-on' : ''}`} onClick={() => setViewMode('split')} title="Split" aria-pressed={view === 'split'}><Icon name="layout" size={13} /></button>
        <button className={`sd-tool${wrap ? ' is-on' : ''}`} onClick={toggleWrap} title="Wrap long lines" aria-pressed={wrap}><Icon name="enter" size={13} /></button>
        <button className="sd-tool" onClick={load} title="Refresh" aria-label="Refresh"><Icon name="refresh" size={13} /></button>
        <button className="sd-commit" onClick={onCommit} title="Stage and commit">Commit…</button>
      </div>
      <div className="sd-files sush-scroll">
        {state.loading && !files.length && <div className="sd-empty">Reading changes…</div>}
        {!state.loading && !state.repo && <div className="sd-empty">This folder is not a git repository.</div>}
        {!state.loading && state.repo && !scoped.length && !state.error && (
          <div className="sd-empty">{scope === 'all' ? 'No changes against HEAD.' : 'None of this turn’s files differ from HEAD any more.'}</div>
        )}
        {state.error && <div className="sd-empty is-error">{state.error}</div>}
        {state.tooLarge && <div className="sd-empty">These changes are too large to show here — use Commit… or a terminal `git diff`.</div>}
        {state.truncated && !state.tooLarge && <div className="sd-gap">Diff truncated — showing the first 300,000 characters.</div>}
        {scoped.map(file => (
          <FileSection
            key={file.path}
            file={file}
            view={view}
            collapsed={collapsed.has(file.path)}
            onToggle={() => toggleFile(file.path)}
            onSend={sendFile}
          />
        ))}
      </div>
    </div>
  )
}
