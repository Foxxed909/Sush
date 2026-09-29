import React from 'react'
import Icon from '../Icons'
import { useThreadFeed } from '../../hooks/useThreadFeed'
import { rgba } from '../../lib/ui'
import { PanelEmpty, TabHeader } from './shared'

export function clip(value, max = 1600) {
  const text = String(value ?? '')
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

export function prettyInput(input) {
  if (!input || typeof input !== 'object') return ''
  try {
    return clip(JSON.stringify(input, null, 2), 2200)
  } catch {
    return ''
  }
}

export function ThreadItem({ item, accent }) {
  if (item.type === 'user' || item.type === 'assistant') {
    const assistant = item.type === 'assistant'
    return (
      <article className={`nightly-thread-turn ${assistant ? 'is-assistant' : 'is-user'}`}>
        <header>
          <span>{assistant ? 'Agent' : 'You'}</span>
          {assistant && item.model && <small>{item.model}</small>}
          {!assistant && item.live && <small>live hook · transcript pending</small>}
        </header>
        <div className="nightly-thread-text">{item.text}</div>
      </article>
    )
  }

  if (item.type === 'tool_use') {
    return (
      <article className="nightly-thread-tool">
        <header>
          <span className="nightly-thread-tool-icon" style={{ color: accent, background: rgba(accent, .08) }}>
            <Icon name="command" size={12} />
          </span>
          <strong>{item.name}</strong>
          <small>tool call</small>
        </header>
        {item.input && <pre>{prettyInput(item.input)}</pre>}
      </article>
    )
  }

  if (item.type === 'tool_result') {
    return (
      <article className={`nightly-thread-result${item.isError ? ' is-error' : ''}`}>
        <header>{item.isError ? 'Tool error' : 'Tool result'}</header>
        {item.text && <pre>{clip(item.text, 2400)}</pre>}
      </article>
    )
  }

  return null
}

export default function ThreadTab({ accent, activeTab }) {
  const { state, error, items, read, supported } = useThreadFeed(activeTab)

  if (!supported) {
    return (
      <PanelEmpty icon="fileText" accent={accent} hint="Thread is enabled only when Sush can bind structured records to the exact same live provider session.">
        Structured Thread is not available for this session yet.
      </PanelEmpty>
    )
  }

  const shortId = state?.sessionId ? state.sessionId.slice(0, 8) : null
  const sub = state?.bound
    ? `Claude session ${shortId}${state.transcriptAvailable ? ' · transcript bound' : ' · waiting for transcript'}`
    : 'Waiting for Claude session hook'

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader accent={accent} icon="fileText" title="Thread" sub={sub} onRefresh={read} />
      <div className="nightly-thread-notice">
        <Icon name="sparkles" size={12} />
        <span>
          Same live Claude Code session. Sush renders only structured transcript records Claude has actually persisted; raw terminal remains the source of truth.
        </span>
      </div>
      {state?.transcriptTruncated && (
        <div className="nightly-thread-warning">Showing the most recent structured transcript records because this session is larger than the Thread read cap.</div>
      )}
      {error && <div className="nightly-thread-warning is-error">{error}</div>}
      {!state?.bound && !error && (
        <div className="nightly-thread-empty">
          <strong>Waiting for Claude to identify this session…</strong>
          <span>The terminal is already live. Thread will attach when Claude's SessionStart/UserPromptSubmit hook reports its real session ID.</span>
        </div>
      )}
      {state?.bound && !state.transcriptAvailable && !items.length && (
        <div className="nightly-thread-empty">
          <strong>Session bound. Transcript not flushed yet.</strong>
          <span>Claude has identified session {shortId}. Some Claude Code versions delay the JSONL transcript while the session is active, so Sush will not invent assistant turns.</span>
        </div>
      )}
      <div className="sush-scroll nightly-thread-feed" aria-live="polite">
        {items.map(item => <ThreadItem key={item.id} item={item} accent={accent} />)}
      </div>
    </div>
  )
}
