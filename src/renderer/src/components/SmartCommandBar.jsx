import React, { useEffect, useRef, useState, useCallback } from 'react'
import Icon from './Icons'
import { rgba, accentVars } from '../lib/ui'

// Detect if the last token in an input looks like a filesystem path being typed.
function extractPathToken(input) {
  const trimmed = input.trimEnd()
  // After path-navigation commands
  const cmdMatch = trimmed.match(/^(?:cd|work|ls|open|edit|size|cat|touch|type)\s+(.*)$/i)
  if (cmdMatch) return cmdMatch[1]
  // Bare paths (/, ~, C:\, ./, ../)
  if (/^[~/]|^[a-zA-Z]:[/\\]|^\.{1,2}[/\\]/.test(trimmed)) return trimmed
  return null
}

// Split a path token into parent + partial leaf for directory listing.
function splitPath(value) {
  const v = String(value || '')
  const lastSlash = Math.max(v.lastIndexOf('\\'), v.lastIndexOf('/'))
  if (lastSlash < 0) return { parent: '', partial: v, sep: '/' }
  const sep = v[lastSlash] || '/'
  return { parent: v.slice(0, lastSlash) || sep, partial: v.slice(lastSlash + 1), sep }
}

function lookupPath(parent) {
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent
}

function usePathSuggestions(input) {
  const token = extractPathToken(input) ?? ''
  const { parent, partial, sep } = splitPath(token)
  const [entries, setEntries] = useState([])
  const reqId = useRef(0)

  useEffect(() => {
    if (!parent) { setEntries([]); return }
    const id = ++reqId.current
    window.sush?.listDir?.({ path: lookupPath(parent) })
      .then(res => { if (id === reqId.current) setEntries(res?.entries ?? []) })
      .catch(() => { if (id === reqId.current) setEntries([]) })
  }, [parent])

  const lower = partial.toLowerCase()
  const suggestions = entries
    .filter(e => e.name.toLowerCase().startsWith(lower))
    .slice(0, 40)

  const complete = useCallback((entry) => {
    const base = parent.endsWith(sep) ? parent : `${parent}${sep}`
    const completed = `${base}${entry.name}${entry.dir ? sep : ''}`
    // Replace the path token back into the original input.
    const pathToken = extractPathToken(input) ?? ''
    const prefix = input.slice(0, input.lastIndexOf(pathToken))
    return `${prefix}${completed}`
  }, [input, parent, sep])

  return { suggestions, complete, hasToken: !!token }
}

export default function SmartCommandBar({ activeTab, accent, onRun, onSeducia, onTogglePanel, rightOpen, busy, broadcastMode, onToggleBroadcast, splitMode, onToggleSplit, settings = {} }) {
  const [value, setValue] = useState('')
  const [history, setHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const blurTimer = useRef(null)
  const aiTimer = useRef(null)

  const { suggestions, complete, hasToken } = usePathSuggestions(value)

  useEffect(() => { setActiveIdx(0) }, [value])
  useEffect(() => {
    listRef.current?.children?.[activeIdx]?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIdx])

  // Ctrl+L to focus the bar.
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const fetchAiSuggestion = useCallback(async (input) => {
    const hasKey = !!(settings.anthropicKey || settings.openaiKey)
    if (!hasKey || !input.trim() || input.length < 3) { setAiSuggestion(''); return }
    setAiLoading(true)
    try {
      const prompt = `Complete this shell command or path in 1 line. Reply with ONLY the completion (no explanation):\n${input}`
      let text = null
      if (settings.anthropicKey) {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': settings.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 60, messages: [{ role: 'user', content: prompt }] })
        })
        const d = await res.json()
        text = d.content?.[0]?.text?.trim()
      } else if (settings.openaiKey) {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${settings.openaiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 60, messages: [{ role: 'user', content: prompt }] })
        })
        const d = await res.json()
        text = d.choices?.[0]?.message?.content?.trim()
      }
      if (text && text.startsWith(input)) setAiSuggestion(text)
      else if (text) setAiSuggestion(input + text)
    } catch {}
    finally { setAiLoading(false) }
  }, [settings.anthropicKey, settings.openaiKey])

  const submit = async (e) => {
    if (e) e.preventDefault()
    const input = value.trim()
    if (!input || busy) return
    setHistory(prev => [input, ...prev.filter(i => i !== input)].slice(0, 25))
    setHistoryIndex(-1)
    setShowSuggestions(false)
    setAiSuggestion('')
    setValue('')
    await onRun(input)
  }

  const handleChange = (e) => {
    const v = e.target.value
    setValue(v)
    setHistoryIndex(-1)
    setShowSuggestions(true)
    setAiSuggestion('')
    clearTimeout(aiTimer.current)
    aiTimer.current = setTimeout(() => fetchAiSuggestion(v), 700)
  }

  const handleKeyDown = (e) => {
    const vis = showSuggestions && suggestions.length > 0

    if (vis && e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(a => Math.min(a + 1, suggestions.length - 1)); return }
    if (vis && e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setActiveIdx(a => Math.max(a - 1, 0)); return }
    if (vis && e.key === 'Tab') { e.preventDefault(); setValue(complete(suggestions[activeIdx])); return }
    if (vis && e.key === 'Escape') { e.preventDefault(); setShowSuggestions(false); return }
    // Accept AI suggestion with Tab when path dropdown not visible
    if (!vis && e.key === 'Tab' && aiSuggestion) { e.preventDefault(); setValue(aiSuggestion); setAiSuggestion(''); return }

    // History navigation when no suggestions visible.
    if (!vis && e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(historyIndex + 1, history.length - 1)
      if (next >= 0) { setHistoryIndex(next); setValue(history[next]) }
      return
    }
    if (!vis && e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.max(historyIndex - 1, -1)
      setHistoryIndex(next)
      setValue(next >= 0 ? history[next] : '')
      return
    }
  }

  const closeSuggestions = () => {
    blurTimer.current = setTimeout(() => setShowSuggestions(false), 140)
  }
  const openSuggestions = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current)
    if (hasToken) setShowSuggestions(true)
  }

  const visibleSuggestions = showSuggestions && hasToken && suggestions.length > 0

  return (
    <div
      style={{ ...accentVars(accent), position: 'relative' }}
    >
      <form
        onSubmit={submit}
        className="flex items-center shrink-0"
        style={{
          gap: 8,
          height: 52,
          padding: '0 12px',
          background: '#0c0e11',
          borderBottom: `1px solid ${rgba(accent, 0.14)}`
        }}
      >
        {/* Home */}
        <button
          type="button"
          title="Home"
          onClick={() => onRun('home')}
          style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${rgba(accent, 0.35)}`, background: rgba(accent, 0.08), color: accent, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="home" size={15} strokeWidth={2.2} />
        </button>

        {/* Input */}
        <div className="sush-omni flex items-center" style={{ flex: 1, minWidth: 0, gap: 9, position: 'relative' }}>
          <Icon name="command" size={14} color={busy ? accent : '#5a646d'} className={busy ? 'sush-spin' : undefined} />
          <div style={{ flex: 1, minWidth: 0, position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}>
            <input
              ref={inputRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={openSuggestions}
              onBlur={() => { closeSuggestions(); setTimeout(() => setAiSuggestion(''), 200) }}
              placeholder="Smart command, path, or shell..."
              spellCheck={false}
              style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', background: 'transparent', border: 'none', color: '#f1f4f6', outline: 'none', fontSize: 13 }}
            />
            {/* AI ghost suggestion */}
            {aiSuggestion && !showSuggestions && (
              <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#3f4852', pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%', zIndex: 0 }}>
                {aiSuggestion}
              </span>
            )}
          </div>
          {aiSuggestion && !showSuggestions && (
            <span style={{ fontSize: 9.5, color: '#3f4852', flexShrink: 0, userSelect: 'none' }}>Tab</span>
          )}
          {!value && !aiSuggestion && (
            <span className="flex items-center" style={{ gap: 3, color: '#3f4852', fontSize: 10, fontWeight: 700, flexShrink: 0, userSelect: 'none' }}>
              <kbd style={kbdStyle}>Ctrl</kbd><kbd style={kbdStyle}>L</kbd>
            </span>
          )}
        </div>

        {/* Active tab pill */}
        <span
          title={activeTab?.cwd || activeTab?.profileLabel || ''}
          className="flex items-center"
          style={{ gap: 5, color: '#8a939c', fontSize: 11, background: '#0f1318', border: '1px solid #1d242b', borderRadius: 999, padding: '4px 10px', flexShrink: 0, maxWidth: 160 }}
        >
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: accent, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTab?.label || 'Shell'}</span>
        </span>

        {/* Seducia */}
        <button
          type="button"
          title="Seducia (Ctrl+K)"
          onClick={onSeducia}
          className="sush-btn flex items-center"
          style={{ gap: 6, height: 32, padding: '0 11px', borderRadius: 9, border: `1px solid ${rgba(accent, 0.4)}`, background: rgba(accent, 0.1), color: accent, fontWeight: 800, fontSize: 11.5, cursor: 'pointer', flexShrink: 0 }}
        >
          <Icon name="sparkles" size={13} strokeWidth={2} />
          Seducia
        </button>

        {/* Run */}
        <button
          type="submit"
          disabled={busy}
          style={{ gap: 6, height: 32, padding: '0 13px', border: 'none', borderRadius: 9, background: busy ? '#1c2126' : accent, color: busy ? '#7a838b' : '#0a0a0a', fontSize: 12, fontWeight: 800, cursor: busy ? 'default' : 'pointer', boxShadow: busy ? 'none' : `0 4px 14px ${rgba(accent, 0.3)}`, flexShrink: 0, display: 'flex', alignItems: 'center' }}
        >
          {busy ? 'Running' : 'Run'}
          {!busy && <Icon name="enter" size={13} strokeWidth={2.2} color="#0a0a0a" style={{ marginLeft: 4 }} />}
        </button>

        {/* Broadcast toggle */}
        {onToggleBroadcast && (
          <button
            type="button"
            title={broadcastMode ? 'Broadcast ON -- input goes to all tabs (Ctrl+Shift+B)' : 'Broadcast mode off (Ctrl+Shift+B)'}
            onClick={onToggleBroadcast}
            style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${broadcastMode ? 'rgba(255,83,112,0.5)' : '#20272e'}`, background: broadcastMode ? 'rgba(255,83,112,0.12)' : '#11151a', color: broadcastMode ? '#ff5370' : '#76808a', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="radio" size={14} />
          </button>
        )}

        {/* Split pane toggle */}
        {onToggleSplit && (
          <button
            type="button"
            title={splitMode ? 'Exit split pane (Ctrl+Shift+H)' : 'Split pane (Ctrl+Shift+H)'}
            onClick={onToggleSplit}
            style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${splitMode ? rgba(accent, 0.45) : '#20272e'}`, background: splitMode ? rgba(accent, 0.1) : '#11151a', color: splitMode ? accent : '#76808a', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="layout" size={14} />
          </button>
        )}

        {/* Panel toggle */}
        <button
          type="button"
          title={rightOpen ? 'Hide panel (Ctrl+B)' : 'Show panel (Ctrl+B)'}
          onClick={onTogglePanel}
          style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${rightOpen ? rgba(accent, 0.45) : '#20272e'}`, background: rightOpen ? rgba(accent, 0.1) : '#11151a', color: rightOpen ? accent : '#76808a', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="panel" size={15} />
        </button>
      </form>

      {/* Path autocomplete dropdown */}
      {visibleSuggestions && (
        <div
          ref={listRef}
          className="sush-scroll sush-fade-up"
          onMouseDown={e => { clearTimeout(blurTimer.current); e.preventDefault() }}
          style={{
            position: 'absolute',
            top: '100%',
            left: 44,
            right: 44,
            zIndex: 200,
            maxHeight: 220,
            overflowY: 'auto',
            background: '#0b0e11',
            border: `1px solid ${rgba(accent, 0.28)}`,
            borderTop: 'none',
            borderRadius: '0 0 12px 12px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
            padding: '4px 4px 6px'
          }}
        >
          {suggestions.map((entry, i) => {
            const on = i === activeIdx
            return (
              <button
                key={entry.name}
                type="button"
                onMouseDown={() => { setValue(complete(entry)); setShowSuggestions(entry.dir); inputRef.current?.focus() }}
                onMouseEnter={() => setActiveIdx(i)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: '1px solid transparent', borderRadius: 8, background: on ? rgba(accent, 0.12) : 'transparent', color: on ? '#f1f4f6' : '#b0b9c2', padding: '6px 9px', cursor: 'pointer' }}
              >
                <Icon name={entry.dir ? 'folder' : 'file'} size={13} color={entry.dir ? accent : '#4a5560'} strokeWidth={2} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5 }}>{entry.name}</span>
                {entry.dir && <Icon name="chevronRight" size={11} color="#3f4852" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const kbdStyle = { background: '#171c22', border: '1px solid #262d35', borderRadius: 4, padding: '1px 4px', fontSize: 9.5, fontFamily: 'inherit', lineHeight: 1.4 }
