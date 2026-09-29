import React, { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import { useThreadFeed } from '../../hooks/useThreadFeed'
import { clip, prettyInput } from '../panel/ThreadTab'
import { renderMarkdown } from '../../lib/markdown'
import { buildTurns, describeToolUse, formatWorkedFor, workSummary } from '../../lib/threadTurns'

// The Nightly shell's centre: the live session's structured transcript as a
// T3-style reading column. Raw terminal output stays in the drawer below and
// remains the source of truth; nothing here is inferred from terminal text.
export default function ThreadView({ accent, activeTab, onOpenDiff }) {
  const { state, error, items } = useThreadFeed(activeTab)
  const blocks = useMemo(() => buildTurns(items), [items])
  const feedRef = useRef(null)
  const pinnedRef = useRef(true)

  // Follow new turns only while the reader is already at the bottom.
  useEffect(() => {
    const el = feedRef.current
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight
  }, [blocks.length, items.length])
  const onScroll = () => {
    const el = feedRef.current
    if (el) pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  const shortId = state?.sessionId ? state.sessionId.slice(0, 8) : null
  const working = state?.state === 'working'

  return (
    <div className="shell-thread">
      <div className="shell-thread-feed sush-scroll" ref={feedRef} onScroll={onScroll} aria-live="polite">
        <div className="shell-thread-column">
          {!state?.bound && !error && (
            <div className="shell-thread-empty">
              <Icon name="fileText" size={18} />
              <strong>Waiting for Claude to identify this session…</strong>
              <span>The terminal below is already live. The transcript attaches when Claude reports its session.</span>
            </div>
          )}
          {state?.bound && !state.transcriptAvailable && !items.length && (
            <div className="shell-thread-empty">
              <Icon name="clock" size={18} />
              <strong>Session {shortId} bound — transcript not flushed yet.</strong>
              <span>Sush shows only what Claude has written; it never invents replies.</span>
            </div>
          )}
          {state?.transcriptTruncated && (
            <div className="nightly-thread-warning">Showing the most recent records — this session is larger than the Thread read cap.</div>
          )}
          {error && <div className="nightly-thread-warning is-error">{error}</div>}

          {blocks.map(block => {
            if (block.kind === 'user') {
              return (
                <div key={block.id} className="shell-msg is-user">
                  <div className="shell-msg-bubble">{block.item.text}</div>
                  {block.item.live && <small>sent · waiting for transcript</small>}
                </div>
              )
            }
            if (block.kind === 'assistant') {
              return (
                <div key={block.id} className={`shell-msg is-assistant${block.item.error ? ' is-error' : ''}`} title={block.item.model || undefined}>
                  <div className="shell-msg-body">{renderMarkdown(block.item.text, accent)}</div>
                </div>
              )
            }
            return (
              <React.Fragment key={block.id}>
                <WorkLog block={block} accent={accent} />
                {block.files.length > 0 && <ChangedFiles files={block.files} onOpenDiff={onOpenDiff} />}
              </React.Fragment>
            )
          })}

          {working && (
            <div className="shell-working" style={{ '--pulse': accent }}>
              <span className="sush-pulse-dot" style={{ background: accent }} /> Working…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WorkLog({ block, accent }) {
  const [open, setOpen] = useState(false)
  const errored = block.steps.some(step => step.result?.isError)
  const duration = formatWorkedFor(block.durationMs)
  return (
    <div className={`shell-work${open ? ' is-open' : ''}${errored ? ' is-error' : ''}`}>
      <button className="shell-work-head" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <span>{duration ? `Worked for ${duration}` : 'Worked'}</span>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
        <small>{workSummary(block)}</small>
      </button>
      {open && (
        <div className="shell-work-body">
          {block.narration.map(item => (
            <div key={item.id} className="shell-work-narration">{renderMarkdown(item.text, accent)}</div>
          ))}
          {block.steps.map(step => (
            <div key={step.id} className="shell-work-step">
              <div className="shell-work-step-title">{describeToolUse(step.use)}</div>
              {step.use?.input && <pre>{prettyInput(step.use.input)}</pre>}
              {step.result && (
                <pre className={step.result.isError ? 'is-error' : undefined}>{clip(step.result.text, 2400) || '(no output)'}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function fileName(path) {
  return String(path || '').split(/[\\/]/).pop() || path
}

// T3's changed-files card: what this turn wrote, with a way into the diff.
function ChangedFiles({ files, onOpenDiff }) {
  const [open, setOpen] = useState(false)
  const added = files.reduce((n, f) => n + f.added, 0)
  const removed = files.reduce((n, f) => n + f.removed, 0)
  return (
    <div className="shell-files">
      <div className="shell-files-head">
        <button className="shell-files-toggle" onClick={() => setOpen(v => !v)} aria-expanded={open}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
          <span>{files.length} changed file{files.length === 1 ? '' : 's'}</span>
          <em className="is-add">+{added}</em>
          <em className="is-del">−{removed}</em>
          <small>{open ? 'Hide files' : 'Show files'}</small>
        </button>
        <button className="shell-files-open" onClick={() => onOpenDiff?.()} aria-label="Open diff">
          <Icon name="code" size={12} /> Open diff
        </button>
      </div>
      {open && (
        <ul className="shell-files-list">
          {files.map(file => (
            <li key={file.path} title={file.path}>
              <Icon name="file" size={12} />
              <span className="shell-files-name">{fileName(file.path)}</span>
              <span className="shell-files-dir">{file.path}</span>
              <em className="is-add">+{file.added}</em>
              <em className="is-del">−{file.removed}</em>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
