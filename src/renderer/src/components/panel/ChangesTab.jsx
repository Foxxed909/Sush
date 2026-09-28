import React, { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { cliComplete } from '../../lib/ai'
import { isGitFileStaged } from '../../lib/gitStatus'
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

function DiffView({ text }) {
  return (
    <pre className="changes-diff">
      {String(text).split('\n').map((line, i) => {
        const kind = line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ') ? 'meta'
          : line.startsWith('@@') ? 'hunk' : line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : ''
        return <span key={i} className={kind ? `is-${kind}` : undefined}>{line || ' '}{'\n'}</span>
      })}
    </pre>
  )
}

function ChangesTab({ accent, cwd, onOpenFile, settings = {} }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [commitResult, setCommitResult] = useState(null)
  const [suggesting, setSuggesting] = useState(false)
  const [diff, setDiff] = useState(null)
  const [diffLoading, setDiffLoading] = useState(false)
  // Per-file inline diff: { key, path, text, loading, truncated, error }
  const [fileDiff, setFileDiff] = useState(null)
  const fileDiffRequestRef = useRef(0)
  const loadRequestRef = useRef(0)
  const diffRequestRef = useRef(0)
  const commitRequestRef = useRef(0)
  const suggestRequestRef = useRef(0)
  const loadedCwdRef = useRef(null)
  const activeCwdRef = useRef(cwd)
  activeCwdRef.current = cwd || null

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current
    const targetCwd = cwd || null
    if (loadedCwdRef.current !== targetCwd) loadedCwdRef.current = null
    if (!targetCwd) {
      setData({ repo: false, files: [] })
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await window.sush?.gitStatus?.({ cwd: targetCwd })
      if (requestId !== loadRequestRef.current || activeCwdRef.current !== targetCwd) return
      loadedCwdRef.current = targetCwd
      setData(res || { repo: false, files: [] })
    } catch {
      if (requestId !== loadRequestRef.current || activeCwdRef.current !== targetCwd) return
      loadedCwdRef.current = targetCwd
      setData({ repo: false, files: [] })
    } finally {
      if (requestId === loadRequestRef.current && activeCwdRef.current === targetCwd) setLoading(false)
    }
  }, [cwd])

  useEffect(() => {
    diffRequestRef.current += 1
    commitRequestRef.current += 1
    suggestRequestRef.current += 1
    setDiff(null)
    setDiffLoading(false)
    setCommitMsg('')
    setCommitResult(null)
    setCommitting(false)
    setSuggesting(false)
    load()
  }, [load])

  const toggleFileDiff = async (file, staged) => {
    const key = `${staged ? 's' : 'u'}:${file.path}`
    if (fileDiff?.key === key) { setFileDiff(null); return }
    const targetCwd = data?.dir || cwd
    const requestId = ++fileDiffRequestRef.current
    setFileDiff({ key, path: file.path, text: '', loading: true })
    const res = await window.sush?.gitDiffFile?.({ cwd: targetCwd, path: file.path, staged, untracked: file.status === '??' }).catch(() => null)
    if (requestId !== fileDiffRequestRef.current) return
    setFileDiff({
      key, path: file.path, loading: false,
      text: res?.diff || '',
      truncated: !!res?.truncated,
      error: res?.ok ? (res.diff ? '' : 'No textual changes to show.') : (res?.error || 'Could not read the diff')
    })
  }
  // Fill the composer; the user reads it and presses Enter. Nothing is sent on its own.
  const sendDiffToAgent = () => {
    if (!fileDiff?.text) return
    const body = fileDiff.text.length > 12000 ? `${fileDiff.text.slice(0, 12000)}\n… (diff truncated)` : fileDiff.text
    window.dispatchEvent(new CustomEvent('sush:composer-fill', {
      detail: { text: `Please review my changes to ${fileDiff.path}:\n\n\`\`\`diff\n${body.trimEnd()}\n\`\`\`\n` }
    }))
  }

  const renderFileDiff = () => (
    <div className="changes-file-diff">
      {fileDiff.loading && <div className="changes-diff-note">Loading diff…</div>}
      {!fileDiff.loading && fileDiff.text && <DiffView text={fileDiff.text} />}
      {!fileDiff.loading && fileDiff.error && <div className="changes-diff-note">{fileDiff.error}</div>}
      {!fileDiff.loading && fileDiff.truncated && <div className="changes-diff-note">Diff truncated at 80,000 characters.</div>}
      {!fileDiff.loading && fileDiff.text && (
        <div className="changes-diff-actions">
          <button type="button" onClick={sendDiffToAgent}>Send to agent</button>
          <small>Fills the message box — you review it, then press Enter.</small>
        </div>
      )}
    </div>
  )

  const toggleDiff = async () => {
    if (diff !== null) { setDiff(null); return }
    const targetCwd = loadedCwdRef.current
    if (!targetCwd || targetCwd !== cwd) return
    const requestId = ++diffRequestRef.current
    setDiffLoading(true)
    try {
      const res = await window.sush?.gitDiffStaged?.({ cwd: targetCwd })
      if (requestId !== diffRequestRef.current || activeCwdRef.current !== targetCwd || loadedCwdRef.current !== targetCwd) return
      setDiff(res?.diff || (res?.ok ? '(nothing staged)' : res?.error || 'Could not read diff'))
    } catch (e) {
      if (requestId === diffRequestRef.current && activeCwdRef.current === targetCwd && loadedCwdRef.current === targetCwd) {
        setDiff(e.message)
      }
    } finally {
      if (requestId === diffRequestRef.current && activeCwdRef.current === targetCwd) setDiffLoading(false)
    }
  }

  const setFileStaged = async (f, shouldStage) => {
    const targetCwd = loadedCwdRef.current
    if (!targetCwd || targetCwd !== cwd) return
    try {
      if (shouldStage) await window.sush?.gitStage?.({ cwd: targetCwd, file: f.path })
      else await window.sush?.gitUnstage?.({ cwd: targetCwd, file: f.path })
    } finally {
      if (activeCwdRef.current === targetCwd && loadedCwdRef.current === targetCwd) load()
    }
  }

  const stageAll = async () => {
    const targetCwd = loadedCwdRef.current
    if (!targetCwd || targetCwd !== cwd) return
    try {
      await window.sush?.gitStage?.({ cwd: targetCwd, file: '.' })
    } finally {
      if (activeCwdRef.current === targetCwd && loadedCwdRef.current === targetCwd) load()
    }
  }

  const commit = async () => {
    if (!commitMsg.trim()) return
    const targetCwd = loadedCwdRef.current
    if (!targetCwd || targetCwd !== cwd) return
    const requestId = ++commitRequestRef.current
    setCommitting(true)
    setCommitResult(null)
    try {
      const res = await window.sush?.gitCommit?.({ cwd: targetCwd, message: commitMsg.trim() })
      if (requestId !== commitRequestRef.current || activeCwdRef.current !== targetCwd || loadedCwdRef.current !== targetCwd) return
      setCommitResult(res)
      if (res?.ok) { setCommitMsg(''); load() }
    } catch (e) {
      if (requestId === commitRequestRef.current && activeCwdRef.current === targetCwd && loadedCwdRef.current === targetCwd) {
        setCommitResult({ ok: false, error: e.message })
      }
    } finally {
      if (requestId === commitRequestRef.current && activeCwdRef.current === targetCwd) setCommitting(false)
    }
  }

  const suggestMessage = async () => {
    const targetCwd = loadedCwdRef.current
    if (!targetCwd || targetCwd !== cwd) return
    const requestId = ++suggestRequestRef.current
    setSuggesting(true)
    try {
      const files = data?.files || []
      const text = await aiSuggestCommit(files, targetCwd)
      if (requestId !== suggestRequestRef.current || activeCwdRef.current !== targetCwd || loadedCwdRef.current !== targetCwd) return
      setCommitMsg(text || 'Could not suggest (is the Claude/Codex CLI installed and signed in?)')
    } catch {}
    finally {
      if (requestId === suggestRequestRef.current && activeCwdRef.current === targetCwd) setSuggesting(false)
    }
  }

  if (loading || (cwd && loadedCwdRef.current !== cwd)) return <PanelEmpty icon="gitBranch" accent={accent}>Reading changes...</PanelEmpty>
  if (!data?.repo) return <PanelEmpty icon="gitBranch" accent={accent} hint="Open a session inside a git repository to see its working-tree changes here.">Not a git repository</PanelEmpty>

  const stagedFiles = (data.files || []).filter(isGitFileStaged)
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
                <React.Fragment key={`s-${f.path}`}>
                <div className="flex items-center" style={{ gap: 6, borderRadius: 8, background: 'rgba(195,232,141,0.06)', padding: '4px 6px', marginBottom: 2 }}>
                  <span style={{ width: 16, textAlign: 'center', fontSize: 10.5, fontWeight: 900, color: meta.c, flexShrink: 0 }}>{meta.t}</span>
                  <button onClick={() => onOpenFile(joinPath(data.dir || cwd, f.path))} title={f.path} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 0, fontWeight: 700 }}>{f.path}</button>
                  <button onClick={() => toggleFileDiff(f, true)} title="View diff" aria-label={`View diff of ${f.path}`} aria-expanded={fileDiff?.key === `s:${f.path}`} className="changes-diff-btn"><Icon name="code" size={12} /></button>
                  <button onClick={() => setFileStaged(f, false)} title="Unstage" style={{ fontSize: 10, color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>−</button>
                </div>
                {fileDiff?.key === `s:${f.path}` && renderFileDiff()}
                </React.Fragment>
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
                <React.Fragment key={`u-${f.path}`}>
                <div className="flex items-center" style={{ gap: 6, padding: '4px 6px', marginBottom: 2 }}>
                  <span style={{ width: 16, textAlign: 'center', fontSize: 10.5, fontWeight: 900, color: meta.c, flexShrink: 0 }}>{meta.t}</span>
                  <button onClick={() => onOpenFile(joinPath(data.dir || cwd, f.path))} title={f.path} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 0 }}>{f.path}</button>
                  <button onClick={() => toggleFileDiff(f, false)} title="View diff" aria-label={`View diff of ${f.path}`} aria-expanded={fileDiff?.key === `u:${f.path}`} className="changes-diff-btn"><Icon name="code" size={12} /></button>
                  <button onClick={() => setFileStaged(f, true)} title="Stage" style={{ fontSize: 10, color: accent, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0, fontWeight: 800 }}>+</button>
                </div>
                {fileDiff?.key === `u:${f.path}` && renderFileDiff()}
                </React.Fragment>
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
