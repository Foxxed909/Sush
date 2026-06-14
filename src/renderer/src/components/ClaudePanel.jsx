import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'
import { renderMarkdown } from '../lib/markdown'

// Claude Code panel — a mini-ADE: prompt Claude Code on the active directory
// and watch the work happen. Live streamed markdown, every tool call (file
// edits, commands, searches) as a visible step, resumable per-directory
// conversations via --resume. Driven by main's stream-json runner; the panel
// never touches the CLI directly.

const PANEL_ID = 'right-panel'
const SESSIONS_KEY = 'sush-claude-panel-sessions'   // cwd -> sessionId

function loadSessions() {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '{}') } catch { return {} }
}
function saveSession(cwd, sessionId) {
  if (!cwd || !sessionId) return
  try {
    let map = loadSessions()
    // Re-inserting keeps insertion order ≈ recency, so the cap below evicts
    // the oldest directories. Without it this map grew one entry per project
    // forever and eventually tripped the localStorage quota.
    delete map[cwd]
    map[cwd] = sessionId
    const keys = Object.keys(map)
    if (keys.length > 40) map = Object.fromEntries(keys.slice(-40).map(k => [k, map[k]]))
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(map))
  } catch {}
}
function clearSession(cwd) {
  try {
    const map = loadSessions()
    delete map[cwd]
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(map))
  } catch {}
}

const TOOL_ICONS = {
  Read: 'file', Write: 'edit', Edit: 'edit', Glob: 'search', Grep: 'search',
  Bash: 'terminal', PowerShell: 'terminal', WebFetch: 'globe', WebSearch: 'globe',
  TodoWrite: 'check', Task: 'users'
}

function ToolStep({ step, accent }) {
  const [open, setOpen] = useState(false)
  const icon = TOOL_ICONS[step.name] || 'spark'
  const color = step.error ? '#ff8aa0' : step.done ? '#5fd3a8' : accent
  return (
    <div style={{ margin: '6px 0', borderRadius: 9, border: `1px solid ${rgba(color, 0.25)}`, background: rgba(color, 0.04), overflow: 'hidden' }}>
      <button
        onClick={() => step.preview && setOpen(o => !o)}
        className="flex items-center"
        style={{ gap: 8, width: '100%', padding: '6px 10px', background: 'transparent', border: 'none', cursor: step.preview ? 'pointer' : 'default', textAlign: 'left' }}
      >
        <Icon name={step.error ? 'x' : step.done ? 'check' : icon} size={12} color={color} strokeWidth={2.2} />
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-2)', flexShrink: 0 }}>{step.name}</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontFamily: 'monospace' }}>
          {step.detail}
        </span>
        {!step.done && !step.error && <span className="sush-pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: color, '--pulse': rgba(color, 0.6), flexShrink: 0 }} />}
      </button>
      {open && step.preview && (
        <pre style={{ margin: 0, padding: '8px 12px', borderTop: `1px solid ${rgba(color, 0.15)}`, fontSize: 10.5, lineHeight: 1.5, color: '#9aa3ab', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 160, overflow: 'auto', fontFamily: 'monospace' }}>
          {step.preview}
        </pre>
      )}
    </div>
  )
}

export default function ClaudePanel({ accent, activeCwd, visible = true }) {
  const [cwd, setCwd] = useState(activeCwd || '')
  const [entries, setEntries] = useState([])   // { id, role:'you'|'claude', text } | { id, role:'tool', step }
  const [running, setRunning] = useState(false)
  const [value, setValue] = useState('')
  const [meta, setMeta] = useState(null)        // { model, sessionId }
  const [limits, setLimits] = useState(null)    // { status, resetsAt, rateLimitType }
  const [error, setError] = useState('')
  const idRef = useRef(1)
  const scrollRef = useRef(null)
  const liveTextRef = useRef(null)              // entry id receiving deltas
  const cwdRef = useRef(cwd)
  cwdRef.current = cwd

  // Follow the active directory until the user prompts; then the conversation
  // pins to the directory it started in (resume needs a stable cwd).
  const pinnedRef = useRef(false)
  useEffect(() => {
    if (!pinnedRef.current && activeCwd) setCwd(activeCwd)
  }, [activeCwd])

  const sessionId = useMemo(() => loadSessions()[cwd] || null, [cwd, running]) // eslint-disable-line react-hooks/exhaustive-deps

  const push = useCallback((entry) => {
    const id = idRef.current++
    // Long sessions accumulate hundreds of markdown blocks + tool previews;
    // keep the visible transcript bounded so the panel can't eat RAM.
    setEntries(prev => [...prev.slice(-300), { id, ...entry }])
    return id
  }, [])

  useEffect(() => {
    if (visible) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [entries, visible])

  // One global subscription; filter to our panel id.
  useEffect(() => {
    const unsub = window.sush.onClaudePanelEvent?.((ev) => {
      // '*' = broadcast (rate-limit snapshots from any claude run).
      if (ev.kind === 'limits') { setLimits(ev.limits); return }
      if (ev.panelId !== PANEL_ID) return
      if (ev.kind === 'init') {
        setMeta({ model: ev.model, sessionId: ev.sessionId })
        saveSession(cwdRef.current, ev.sessionId)
      } else if (ev.kind === 'delta') {
        setEntries(prev => {
          const liveId = liveTextRef.current
          if (liveId != null && prev.length && prev[prev.length - 1].id === liveId) {
            return prev.map(e => e.id === liveId ? { ...e, text: e.text + ev.text } : e)
          }
          const id = idRef.current++
          liveTextRef.current = id
          return [...prev, { id, role: 'claude', text: ev.text }]
        })
      } else if (ev.kind === 'text') {
        // Authoritative full block: replace the delta-accumulated text.
        setEntries(prev => {
          const liveId = liveTextRef.current
          liveTextRef.current = null
          if (liveId != null) return prev.map(e => e.id === liveId ? { ...e, text: ev.text } : e)
          const id = idRef.current++
          return [...prev, { id, role: 'claude', text: ev.text }]
        })
      } else if (ev.kind === 'tool') {
        liveTextRef.current = null
        push({ role: 'tool', step: { toolId: ev.id, name: ev.name, detail: ev.detail, done: false, error: false } })
      } else if (ev.kind === 'tool-result') {
        setEntries(prev => prev.map(e =>
          e.role === 'tool' && e.step.toolId === ev.id
            ? { ...e, step: { ...e.step, done: true, error: ev.error, preview: ev.preview } }
            : e
        ))
      } else if (ev.kind === 'done') {
        liveTextRef.current = null
        setRunning(false)
        if (ev.sessionId) saveSession(cwdRef.current, ev.sessionId)
        if (!ev.ok && ev.error) setError(ev.error)
      }
    })
    return unsub
  }, [push])

  const submit = useCallback(async (text) => {
    const prompt = String(text ?? value).trim()
    if (!prompt || running) return
    setValue('')
    setError('')
    pinnedRef.current = true
    push({ role: 'you', text: prompt })
    setRunning(true)
    const res = await window.sush.claudePanelStart({
      panelId: PANEL_ID,
      prompt,
      cwd: cwdRef.current || undefined,
      sessionId: loadSessions()[cwdRef.current] || undefined
    })
    if (!res?.ok) {
      setRunning(false)
      setError(res?.error || 'Could not start Claude Code')
    }
  }, [value, running, push])

  const stop = useCallback(() => {
    window.sush.claudePanelStop({ panelId: PANEL_ID })
  }, [])

  const newConversation = useCallback(() => {
    stop()
    clearSession(cwdRef.current)
    setEntries([])
    setMeta(null)
    setError('')
    pinnedRef.current = false
  }, [stop])

  const dirLabel = cwd ? cwd.split(/[\\/]/).filter(Boolean).pop() : 'no directory'

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ padding: '12px 14px', borderBottom: `1px solid ${rgba(accent, 0.1)}` }}>
        <div className="flex items-center" style={{ gap: 9, minWidth: 0 }}>
          <span className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(217,119,87,0.14)', border: '1px solid rgba(217,119,87,0.4)', color: '#d97757', fontWeight: 900, fontSize: 13, flexShrink: 0 }}>C</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-1)' }}>Claude Code</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cwd}>
              {dirLabel}{meta?.model ? ` · ${meta.model}` : ''}{sessionId ? ' · resumable' : ''}
              {limits?.resetsAt && (
                <span style={{ color: limits.status === 'allowed' ? 'var(--text-3)' : '#ffb74d' }}>
                  {' '}· limit resets {new Date(limits.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={newConversation}
          title="New conversation (forgets the resume session for this directory)"
          style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', flexShrink: 0 }}
        >
          New chat
        </button>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto sush-scroll" style={{ padding: '10px 14px' }}>
        {!entries.length && (
          <div style={{ padding: '26px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
              Prompt Claude Code on <strong style={{ color: 'var(--text-2)' }}>{dirLabel}</strong> and watch the work happen — file edits, commands, and the answer, live. Conversations resume per directory.
            </div>
          </div>
        )}
        {entries.map(e => {
          if (e.role === 'tool') return <ToolStep key={e.id} step={e.step} accent={accent} />
          if (e.role === 'you') {
            return (
              <div key={e.id} className="flex justify-end" style={{ margin: '8px 0' }}>
                <div style={{ maxWidth: '88%', fontSize: 12.5, lineHeight: 1.5, padding: '7px 11px', borderRadius: 11, borderTopRightRadius: 4, border: `1px solid ${rgba(accent, 0.35)}`, background: rgba(accent, 0.12), color: 'var(--text-1)', whiteSpace: 'pre-wrap' }}>
                  {e.text}
                </div>
              </div>
            )
          }
          return (
            <div key={e.id} style={{ margin: '4px 0' }}>
              {renderMarkdown(e.text, accent)}
            </div>
          )
        })}
        {running && (
          <div className="flex items-center" style={{ gap: 7, margin: '8px 0', color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>
            <Icon name="sparkles" size={12} color={accent} className="sush-spin" />
            working...
          </div>
        )}
        {error && (
          <div style={{ margin: '8px 0', padding: '8px 11px', borderRadius: 9, background: 'rgba(255,83,112,0.07)', border: '1px solid rgba(255,83,112,0.25)', fontSize: 11.5, color: '#ffb3c0', whiteSpace: 'pre-wrap' }}>
            {error}
          </div>
        )}
      </div>

      {/* Composer */}
      <div style={{ padding: '0 12px 12px' }}>
        <div className="sush-omni flex items-end" style={{ minHeight: 44, gap: 8, padding: '8px 10px' }}>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
            }}
            placeholder={running ? 'Claude is working...' : `Ask Claude Code about ${dirLabel}...`}
            disabled={running}
            spellCheck={false}
            rows={Math.min(4, Math.max(1, value.split('\n').length))}
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: 'var(--text-1)', outline: 'none', fontSize: 12.5, resize: 'none', lineHeight: 1.5, fontFamily: 'inherit' }}
          />
          {running ? (
            <button onClick={stop} title="Stop" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,83,112,0.4)', background: 'rgba(255,83,112,0.1)', color: '#ff5370', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="stop" size={13} />
            </button>
          ) : (
            <button
              onClick={() => submit()}
              disabled={!value.trim()}
              style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: value.trim() ? accent : 'rgba(255,255,255,0.05)', color: value.trim() ? '#0a0a0c' : 'var(--text-4)', cursor: value.trim() ? 'pointer' : 'default', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="send" size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
