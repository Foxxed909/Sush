import React, { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import { useThreadFeed } from '../../hooks/useThreadFeed'
import { clip, prettyInput } from '../panel/ThreadTab'
import { renderMarkdown } from '../../lib/markdown'
import { describeToolUse, groupThreadTurns, workSummary } from '../../lib/threadTurns'

// The Nightly shell's centre: the live session's structured transcript as a
// T3-style reading column. Raw terminal output stays in the drawer below and
// remains the source of truth; nothing here is inferred from terminal text.
export default function ThreadView({ accent, activeTab }) {
  const { state, error, items } = useThreadFeed(activeTab)
  const blocks = useMemo(() => groupThreadTurns(items), [items])
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
                <div key={block.id} className={`shell-msg is-assistant${block.item.error ? ' is-error' : ''}`}>
                  <div className="shell-msg-body">{renderMarkdown(block.item.text, accent)}</div>
                  {block.item.model && <small>{block.item.model}</small>}
                </div>
              )
            }
            return <WorkLog key={block.id} block={block} />
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

function WorkLog({ block }) {
  const [open, setOpen] = useState(false)
  const errored = block.steps.some(step => step.result?.isError)
  return (
    <div className={`shell-work${open ? ' is-open' : ''}${errored ? ' is-error' : ''}`}>
      <button className="shell-work-head" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
        <span>Worked</span>
        <small>{workSummary(block)}</small>
      </button>
      {!open && (
        <ul className="shell-work-peek">
          {block.steps.slice(-3).map(step => (
            <li key={step.id} className={step.result?.isError ? 'is-error' : undefined}>{describeToolUse(step.use)}</li>
          ))}
        </ul>
      )}
      {open && block.steps.map(step => (
        <div key={step.id} className="shell-work-step">
          <div className="shell-work-step-title">{describeToolUse(step.use)}</div>
          {step.use?.input && <pre>{prettyInput(step.use.input)}</pre>}
          {step.result && (
            <pre className={step.result.isError ? 'is-error' : undefined}>{clip(step.result.text, 2400) || '(no output)'}</pre>
          )}
        </div>
      ))}
    </div>
  )
}
