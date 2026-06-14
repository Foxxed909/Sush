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

export default function SmartCommandBar({ activeTab, accent, onRun, onSeducia, onTogglePanel, rightOpen, busy, broadcastMode, onToggleBroadcast, gridMode, onToggleGrid, settings = {} }) {
  const [value, setValue] = useState('')
  const [history, setHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [gitBranch, setGitBranch] = useState(null)
  const [historySearch, setHistorySearch] = useState(false)
  const [historyQuery, setHistoryQuery] = useState('')
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const blurTimer = useRef(null)

  const { suggestions, complete, hasToken } = usePathSuggestions(value)

  useEffect(() => () => { clearTimeout(blurTimer.current) }, [])

  useEffect(() => { setActiveIdx(0) }, [value])
  useEffect(() => {
    listRef.current?.children?.[activeIdx]?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIdx, suggestions])

  // Feature: git branch chip — refresh when the active tab's cwd changes.
  useEffect(() => {
    if (!activeTab?.cwd) { setGitBranch(null); return }
    let cancelled = false
    window.sush.gitStatus?.({ cwd: activeTab.cwd })
      .then(g => { if (!cancelled) setGitBranch(g?.repo ? g.branch : null) })
      .catch(() => { if (!cancelled) setGitBranch(null) })
    return () => { cancelled = true }
  }, [activeTab?.cwd])

  // Ctrl+L to focus the bar. Ctrl+R to open history search mode.
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        setHistorySearch(prev => !prev)
        setHistoryQuery('')
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const submit = async (e) => {
    if (e) e.preventDefault()
    let input = value.trim()
    if (!input || busy) return
    // Auto-cd on bare absolute/home paths so typing a path navigates to it
    if (/^([A-Za-z]:[/\\]|~[/\\]?$|~[/\\]|\/[^/])/.test(input)) input = `cd ${input}`
    setHistory(prev => [input, ...prev.filter(i => i !== input)].slice(0, 25))
    setHistoryIndex(-1)
    setShowSuggestions(false)
    setValue('')
    await onRun(input)
  }

  const handleChange = (e) => {
    const v = e.target.value
    if (historySearch) { setHistoryQuery(v); return }
    setValue(v)
    setHistoryIndex(-1)
    setShowSuggestions(true)
  }

  const handleKeyDown = (e) => {
    // History search mode (Ctrl+R)
    if (historySearch) {
      if (e.key === 'Escape') { e.preventDefault(); setHistorySearch(false); setHistoryQuery(''); return }
      if (e.key === 'Enter') {
        e.preventDefault()
        const matches = history.filter(h => h.toLowerCase().includes(historyQuery.toLowerCase()))
        if (matches[0]) { setValue(matches[0]); setHistorySearch(false); setHistoryQuery('') }
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const matches = history.filter(h => h.toLowerCase().includes(historyQuery.toLowerCase()))
        const idx = matches.indexOf(value)
        const next = idx < matches.length - 1 ? matches[idx + 1] : matches[0]
        if (next) setValue(next)
        return
      }
      return
    }

    const vis = showSuggestions && suggestions.length > 0

    if (vis && e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(a => Math.min(a + 1, suggestions.length - 1)); return }
    if (vis && e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setActiveIdx(a => Math.max(a - 1, 0)); return }
    if (vis && e.key === 'Tab') { e.preventDefault(); setValue(complete(suggestions[activeIdx])); return }
    if (vis && e.key === 'Escape') { e.preventDefault(); setShowSuggestions(false); return }
    // Accept AI suggestion with Tab when path dropdown not visible

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
          gap: 9,
          height: 54,
          padding: '0 14px',
          background: 'transparent',
          borderBottom: '1px solid var(--border-1)'
        }}
      >
        {/* Home */}
        <button
          type="button"
          title="Home"
          onClick={() => onRun('home')}
          className="sush-icon-btn flex items-center justify-center"
          style={{ width: 34, height: 34, borderRadius: 'var(--r-btn)', border: `1px solid ${rgba(accent, 0.3)}`, background: rgba(accent, 0.08), color: accent, cursor: 'pointer', flexShrink: 0 }}
        >
          <Icon name="home" size={15} strokeWidth={2.2} />
        </button>

        {/* Input */}
        <div className="sush-omni flex items-center" style={{ flex: 1, minWidth: 0, gap: 9, position: 'relative' }}>
          <Icon name="command" size={14} color={busy ? accent : 'var(--text-4)'} className={busy ? 'sush-spin' : undefined} />
          <div style={{ flex: 1, minWidth: 0, position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}>
            <input
              ref={inputRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={openSuggestions}
              onBlur={closeSuggestions}
              placeholder="Smart command, path, or shell..."
              spellCheck={false}
              style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', background: 'transparent', border: 'none', color: 'var(--text-1)', outline: 'none', fontSize: 13 }}
            />
          </div>
          {!value && (
            <span className="flex items-center" style={{ gap: 3, color: 'var(--text-5)', fontSize: 10, fontWeight: 700, flexShrink: 0, userSelect: 'none' }}>
              <kbd style={kbdStyle}>Ctrl</kbd><kbd style={kbdStyle}>L</kbd>
            </span>
          )}
        </div>

        {/* Active tab pill */}
        <span
          title={activeTab?.cwd || activeTab?.profileLabel || ''}
          className="flex items-center"
          style={{ gap: 6, color: 'var(--text-2)', fontSize: 11, fontWeight: 700, background: rgba(accent, 0.07), border: `1px solid ${rgba(accent, 0.18)}`, borderRadius: 'var(--r-pill)', padding: '5px 11px', flexShrink: 0, maxWidth: 160 }}
        >
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: accent, boxShadow: `0 0 6px ${rgba(accent, 0.8)}`, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTab?.label || 'Shell'}</span>
        </span>

        {/* Git branch chip */}
        {gitBranch && (
          <span
            title={`Branch: ${gitBranch}`}
            className="flex items-center"
            style={{ gap: 4, color: '#5a9f7a', fontSize: 10, background: 'rgba(66,211,146,0.07)', border: '1px solid rgba(66,211,146,0.18)', borderRadius: 'var(--r-pill)', padding: '3px 8px', flexShrink: 0, maxWidth: 120 }}
          >
            <Icon name="gitBranch" size={10} strokeWidth={2.2} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gitBranch}</span>
          </span>
        )}

        {/* Seducia */}
        <button
          type="button"
          title="Seducia (Ctrl+K)"
          onClick={onSeducia}
          className="sush-btn flex items-center"
          style={{ gap: 6, height: 34, padding: '0 12px', borderRadius: 'var(--r-btn)', border: `1px solid ${rgba(accent, 0.38)}`, background: rgba(accent, 0.1), color: accent, fontWeight: 800, fontSize: 11.5, cursor: 'pointer', flexShrink: 0 }}
        >
          <Icon name="sparkles" size={13} strokeWidth={2} />
          Seducia
        </button>

        {/* Run */}
        <button
          type="submit"
          disabled={busy}
          className="sush-btn"
          style={{ gap: 6, height: 34, padding: '0 14px', border: 'none', borderRadius: 'var(--r-btn)', background: busy ? rgba(accent, 0.14) : accent, color: busy ? rgba(accent, 0.7) : '#0a0a0a', fontSize: 12, fontWeight: 800, cursor: busy ? 'default' : 'pointer', boxShadow: busy ? 'none' : `0 4px 16px ${rgba(accent, 0.34)}`, flexShrink: 0, display: 'flex', alignItems: 'center' }}
        >
          {busy && <span className="sush-spinner" style={{ width: 11, height: 11, marginRight: 6, color: accent }} />}
          {busy ? 'Running' : 'Run'}
          {!busy && <Icon name="enter" size={13} strokeWidth={2.2} color="#0a0a0a" style={{ marginLeft: 4 }} />}
        </button>

        {/* Divider before the view toggles */}
        <span style={{ width: 1, height: 20, background: 'var(--border-2)', margin: '0 2px', flexShrink: 0 }} />

        {/* Broadcast toggle */}
        {onToggleBroadcast && (
          <button
            type="button"
            title={broadcastMode ? 'Broadcast ON -- input goes to all tabs (Ctrl+Shift+B)' : 'Broadcast mode off (Ctrl+Shift+B)'}
            onClick={onToggleBroadcast}
            className="sush-icon-btn flex items-center justify-center"
            style={{ width: 34, height: 34, borderRadius: 'var(--r-btn)', border: `1px solid ${broadcastMode ? 'rgba(255,83,112,0.5)' : 'var(--border-2)'}`, background: broadcastMode ? 'rgba(255,83,112,0.12)' : 'var(--surface-2)', color: broadcastMode ? '#ff5370' : 'var(--text-3)', cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="radio" size={14} />
          </button>
        )}

        {/* Layout: one toggle, two choices — sidebar (off) or auto-grid (on).
            Grid tiles every session in a near-square that grows with the
            session count; turning it off returns to the single-session +
            sidebar view. (Split-pane was retired — it was a third, redundant
            layout mode.) */}
        {onToggleGrid && (
          <button
            type="button"
            title={gridMode ? 'Sidebar layout (Ctrl+Shift+G)' : 'Grid layout - tile all sessions (Ctrl+Shift+G)'}
            onClick={onToggleGrid}
            className="sush-icon-btn flex items-center justify-center"
            style={{ width: 34, height: 34, borderRadius: 'var(--r-btn)', border: `1px solid ${gridMode ? rgba(accent, 0.45) : 'var(--border-2)'}`, background: gridMode ? rgba(accent, 0.1) : 'var(--surface-2)', color: gridMode ? accent : 'var(--text-3)', cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="grid" size={14} />
          </button>
        )}

        {/* Panel toggle */}
        <button
          type="button"
          title={rightOpen ? 'Hide panel (Ctrl+B)' : 'Show panel (Ctrl+B)'}
          onClick={onTogglePanel}
          className="sush-icon-btn flex items-center justify-center"
          style={{ width: 34, height: 34, borderRadius: 'var(--r-btn)', border: `1px solid ${rightOpen ? rgba(accent, 0.45) : 'var(--border-2)'}`, background: rightOpen ? rgba(accent, 0.1) : 'var(--surface-2)', color: rightOpen ? accent : 'var(--text-3)', cursor: 'pointer', flexShrink: 0 }}
        >
          <Icon name="panel" size={15} />
        </button>
      </form>

      {/* History search dropdown (Ctrl+R) */}
      {historySearch && (
        <div
          className="sush-scroll sush-fade-up"
          style={{
            position: 'absolute',
            top: 'calc(100% - 1px)',
            left: 49,
            right: 49,
            zIndex: 210,
            maxHeight: 220,
            overflowY: 'auto',
            background: 'rgba(9,11,14,0.94)',
            backdropFilter: 'blur(18px) saturate(160%)',
            WebkitBackdropFilter: 'blur(18px) saturate(160%)',
            border: `1px solid ${rgba(accent, 0.3)}`,
            borderTop: 'none',
            borderRadius: '0 0 var(--r-lg) var(--r-lg)',
            boxShadow: '0 18px 44px rgba(0,0,0,0.6)',
            padding: '5px 5px 6px'
          }}
        >
          <div style={{ padding: '4px 9px 6px', borderBottom: '1px solid var(--border-1)', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-4)', fontWeight: 700 }}>HISTORY SEARCH  </span>
            <span style={{ fontSize: 10, color: accent, fontWeight: 700 }}>{historyQuery || '(type to filter)'}</span>
          </div>
          {history
            .filter(h => !historyQuery || h.toLowerCase().includes(historyQuery.toLowerCase()))
            .slice(0, 15)
            .map((cmd, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={() => { setValue(cmd); setHistorySearch(false); setHistoryQuery(''); inputRef.current?.focus() }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: '1px solid transparent', borderRadius: 8, background: value === cmd ? rgba(accent, 0.12) : 'transparent', color: 'var(--text-2)', padding: '6px 9px', cursor: 'pointer', fontSize: 12.5 }}
              >
                <Icon name="clock" size={12} color="var(--text-5)" strokeWidth={2} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{cmd}</span>
              </button>
            ))
          }
          {history.filter(h => !historyQuery || h.toLowerCase().includes(historyQuery.toLowerCase())).length === 0 && (
            <div style={{ padding: '8px 12px', color: 'var(--text-5)', fontSize: 12 }}>No matching history</div>
          )}
        </div>
      )}

      {/* Path autocomplete dropdown */}
      {visibleSuggestions && (
        <div
          ref={listRef}
          className="sush-scroll sush-fade-up"
          onMouseDown={e => { clearTimeout(blurTimer.current); e.preventDefault() }}
          style={{
            position: 'absolute',
            top: 'calc(100% - 1px)',
            left: 49,
            right: 49,
            zIndex: 200,
            maxHeight: 220,
            overflowY: 'auto',
            background: 'rgba(9,11,14,0.94)',
            backdropFilter: 'blur(18px) saturate(160%)',
            WebkitBackdropFilter: 'blur(18px) saturate(160%)',
            border: `1px solid ${rgba(accent, 0.26)}`,
            borderTop: 'none',
            borderRadius: '0 0 var(--r-lg) var(--r-lg)',
            boxShadow: '0 18px 44px rgba(0,0,0,0.55)',
            padding: '5px 5px 6px'
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
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: '1px solid transparent', borderRadius: 8, background: on ? rgba(accent, 0.12) : 'transparent', color: on ? 'var(--text-1)' : 'var(--text-2)', padding: '6px 9px', cursor: 'pointer' }}
              >
                <Icon name={entry.dir ? 'folder' : 'file'} size={13} color={entry.dir ? accent : 'var(--text-5)'} strokeWidth={2} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5 }}>{entry.name}</span>
                {entry.dir && <Icon name="chevronRight" size={11} color="var(--text-5)" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const kbdStyle = { background: 'var(--border-1)', border: '1px solid var(--border-2)', borderRadius: 4, padding: '1px 4px', fontSize: 9.5, fontFamily: 'inherit', lineHeight: 1.4 }
