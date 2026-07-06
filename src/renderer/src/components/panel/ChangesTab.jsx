import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { cliComplete } from '../../lib/ai'
import { PanelEmpty, TabHeader, joinPath, statusMeta } from './shared'

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

export default ChangesTab
