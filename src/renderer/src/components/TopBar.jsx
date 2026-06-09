import React, { useEffect, useRef, useState, useCallback } from 'react'
import Icon from './Icons'
import { rgba, accentVars } from '../lib/ui'

// ---- Path autocomplete helpers (typed paths get a directory dropdown) ----
function extractPathToken(input) {
  const trimmed = input.trimEnd()
  const cmdMatch = trimmed.match(/^(?:cd|work|ls|open|edit|size|cat|touch|type)\s+(.*)$/i)
  if (cmdMatch) return cmdMatch[1]
  if (/^[~/]|^[a-zA-Z]:[/\\]|^\.{1,2}[/\\]/.test(trimmed)) return trimmed
  return null
}
function splitPath(value) {
  const v = String(value || '')
  const lastSlash = Math.max(v.lastIndexOf('\\'), v.lastIndexOf('/'))
  if (lastSlash < 0) return { parent: '', partial: v, sep: '/' }
  const sep = v[lastSlash] || '/'
  return { parent: v.slice(0, lastSlash) || sep, partial: v.slice(lastSlash + 1), sep }
}
function lookupPath(parent) { return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent }

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
  const suggestions = entries.filter(e => e.name.toLowerCase().startsWith(lower)).slice(0, 40)
  const complete = useCallback((entry) => {
    const base = parent.endsWith(sep) ? parent : `${parent}${sep}`
    const completed = `${base}${entry.name}${entry.dir ? sep : ''}`
    const pathToken = extractPathToken(input) ?? ''
    const prefix = input.slice(0, input.lastIndexOf(pathToken))
    return `${prefix}${completed}`
  }, [input, parent, sep])
  return { suggestions, complete, hasToken: !!token }
}

function GhostToggle({ icon, on, danger, onClick, title }) {
  const color = on ? (danger ? '#ff5370' : 'var(--accent)') : '#697079'
  return (
    <button
      type="button" title={title} onClick={onClick}
      style={{ WebkitAppRegion: 'no-drag', width: 30, height: 30, borderRadius: 8, border: '1px solid transparent', background: on ? (danger ? 'rgba(255,83,112,0.12)' : 'var(--accent-a10)') : 'transparent', color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s, color .15s' }}
      onMouseEnter={e => { if (!on) e.currentTarget.style.color = '#c2cad1' }}
      onMouseLeave={e => { if (!on) e.currentTarget.style.color = '#697079' }}
    >
      <Icon name={icon} size={15} strokeWidth={2} />
    </button>
  )
}

// The single top bar: window drag region + app mark + context chip + smart
// command input + view toggles + window controls. Replaces TitleBar +
// SmartCommandBar + StatusBar.
export default function TopBar({
  accent, activeTab, onRun, onHome, onSettings, busy, sessionCount = 0,
  broadcastMode, onToggleBroadcast, splitMode, onToggleSplit, rightOpen, onTogglePanel,
  settings = {}
}) {
  const [value, setValue] = useState('')
  const [history, setHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [gitBranch, setGitBranch] = useState(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const blurTimer = useRef(null)
  const aiTimer = useRef(null)

  const { suggestions, complete, hasToken } = usePathSuggestions(value)

  useEffect(() => () => { clearTimeout(aiTimer.current); clearTimeout(blurTimer.current) }, [])
  useEffect(() => { setActiveIdx(0) }, [value])
  useEffect(() => { listRef.current?.children?.[activeIdx]?.scrollIntoView?.({ block: 'nearest' }) }, [activeIdx, suggestions])

  useEffect(() => {
    if (!activeTab?.cwd) { setGitBranch(null); return }
    let cancelled = false
    window.sush.gitStatus?.({ cwd: activeTab.cwd })
      .then(g => { if (!cancelled) setGitBranch(g?.repo ? g.branch : null) })
      .catch(() => { if (!cancelled) setGitBranch(null) })
    return () => { cancelled = true }
  }, [activeTab?.cwd])

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault(); inputRef.current?.focus(); inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const fetchAiSuggestion = useCallback(async (input) => {
    const hasKey = !!(settings.anthropicKey || settings.openaiKey)
    if (!hasKey || !input.trim() || input.length < 3) { setAiSuggestion(''); return }
    try {
      const prompt = `Complete this shell command or path in 1 line. Reply with ONLY the completion (no explanation):\n${input}`
      let text = null
      if (settings.anthropicKey) {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': settings.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
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
  }, [settings.anthropicKey, settings.openaiKey])

  const submit = async (e) => {
    if (e) e.preventDefault()
    let input = value.trim()
    if (!input || busy) return
    if (/^([A-Za-z]:[/\\]|~[/\\]?$|~[/\\]|\/[^/])/.test(input)) input = `cd ${input}`
    setHistory(prev => [input, ...prev.filter(i => i !== input)].slice(0, 25))
    setHistoryIndex(-1); setShowSuggestions(false); setAiSuggestion(''); setValue('')
    await onRun(input)
  }

  const handleChange = (e) => {
    const v = e.target.value
    setValue(v); setHistoryIndex(-1); setShowSuggestions(true); setAiSuggestion('')
    clearTimeout(aiTimer.current)
    aiTimer.current = setTimeout(() => fetchAiSuggestion(v), 700)
  }

  const handleKeyDown = (e) => {
    const vis = showSuggestions && suggestions.length > 0
    if (vis && e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(a => Math.min(a + 1, suggestions.length - 1)); return }
    if (vis && e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setActiveIdx(a => Math.max(a - 1, 0)); return }
    if (vis && e.key === 'Tab') { e.preventDefault(); setValue(complete(suggestions[activeIdx])); return }
    if (vis && e.key === 'Escape') { e.preventDefault(); setShowSuggestions(false); return }
    if (!vis && e.key === 'Tab' && aiSuggestion) { e.preventDefault(); setValue(aiSuggestion); setAiSuggestion(''); return }
    if (!vis && e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(historyIndex + 1, history.length - 1)
      if (next >= 0) { setHistoryIndex(next); setValue(history[next]) }
      return
    }
    if (!vis && e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.max(historyIndex - 1, -1)
      setHistoryIndex(next); setValue(next >= 0 ? history[next] : '')
      return
    }
  }

  const closeSuggestions = () => { blurTimer.current = setTimeout(() => setShowSuggestions(false), 140) }
  const openSuggestions = () => { if (blurTimer.current) clearTimeout(blurTimer.current); if (hasToken) setShowSuggestions(true) }
  const visibleSuggestions = showSuggestions && hasToken && suggestions.length > 0
  const ctrl = (action) => window.sush.windowControl(action)

  return (
    <div style={{ ...accentVars(accent), position: 'relative', flexShrink: 0 }}>
      <form
        onSubmit={submit}
        className="flex items-center"
        style={{ gap: 10, height: 48, padding: '0 10px 0 14px', background: 'rgba(7,9,12,0.92)', borderBottom: '1px solid rgba(255,255,255,0.05)', WebkitAppRegion: 'drag' }}
      >
        {/* App mark -> Home */}
        <button
          type="button" onClick={onHome} title="Home"
          className="flex items-center" style={{ gap: 8, WebkitAppRegion: 'no-drag', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span style={{ width: 15, height: 15, borderRadius: 5, background: `linear-gradient(150deg, ${accent}, ${rgba(accent, 0.35)})`, boxShadow: `0 0 10px ${rgba(accent, 0.45)}` }} />
          <span style={{ color: '#e7ecf1', fontWeight: 800, fontSize: 12, letterSpacing: 1.5 }}>SUSH</span>
        </button>

        {/* Context chip: active session + branch */}
        <span
          title={activeTab?.cwd || ''}
          className="flex items-center"
          style={{ WebkitAppRegion: 'no-drag', gap: 6, color: '#9aa3ab', fontSize: 11, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 999, padding: '4px 11px', flexShrink: 0, maxWidth: 230 }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0, boxShadow: `0 0 6px ${rgba(accent, 0.7)}` }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700, color: '#cdd5dc' }}>{activeTab?.label || 'Home'}</span>
          {gitBranch && (
            <>
              <span style={{ color: '#3f4852' }}>/</span>
              <span className="flex items-center" style={{ gap: 3, color: '#5a9f7a', flexShrink: 0, maxWidth: 110 }}>
                <Icon name="gitBranch" size={10} strokeWidth={2.2} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gitBranch}</span>
              </span>
            </>
          )}
        </span>

        {/* Smart command input */}
        <div className="sush-omni flex items-center" style={{ WebkitAppRegion: 'no-drag', flex: 1, minWidth: 0, gap: 9, height: 34, position: 'relative' }}>
          <Icon name="command" size={14} color={busy ? accent : '#5a646d'} className={busy ? 'sush-spin' : undefined} />
          <div style={{ flex: 1, minWidth: 0, position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}>
            <input
              ref={inputRef} value={value} onChange={handleChange} onKeyDown={handleKeyDown}
              onFocus={openSuggestions} onBlur={() => { closeSuggestions(); setTimeout(() => setAiSuggestion(''), 200) }}
              placeholder="Run a command, path, or ask..." spellCheck={false}
              style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', background: 'transparent', border: 'none', color: '#f1f4f6', outline: 'none', fontSize: 13 }}
            />
            {aiSuggestion && !visibleSuggestions && (
              <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#3f4852', pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%', zIndex: 0 }}>{aiSuggestion}</span>
            )}
          </div>
          {aiSuggestion && !visibleSuggestions
            ? <span style={{ fontSize: 9.5, color: '#3f4852', flexShrink: 0, userSelect: 'none' }}>Tab</span>
            : !value && <span className="flex items-center" style={{ gap: 3, color: '#3f4852', fontSize: 10, fontWeight: 700, flexShrink: 0, userSelect: 'none' }}><kbd style={kbdStyle}>Ctrl</kbd><kbd style={kbdStyle}>L</kbd></span>}
        </div>

        {/* View toggles (ghost) */}
        <div className="flex items-center" style={{ gap: 2, WebkitAppRegion: 'no-drag' }}>
          {onToggleSplit && <GhostToggle icon="layout" on={splitMode} onClick={onToggleSplit} title={splitMode ? 'Exit split (Ctrl+Shift+H)' : 'Split pane (Ctrl+Shift+H)'} />}
          {onToggleBroadcast && <GhostToggle icon="radio" on={broadcastMode} danger onClick={onToggleBroadcast} title={broadcastMode ? 'Broadcast ON (Ctrl+Shift+B)' : 'Broadcast (Ctrl+Shift+B)'} />}
          <GhostToggle icon="panel" on={rightOpen} onClick={onTogglePanel} title={rightOpen ? 'Hide tools (Ctrl+B)' : 'Tools (Ctrl+B)'} />
          <GhostToggle icon="settings" on={false} onClick={onSettings} title="Settings (Ctrl+,)" />
        </div>

        {/* Window controls */}
        <div
          className="flex traffic-lights" style={{ gap: 7, marginLeft: 4, WebkitAppRegion: 'no-drag' }}
          onMouseEnter={e => e.currentTarget.querySelectorAll('button').forEach(b => { b.style.color = 'rgba(0,0,0,0.55)' })}
          onMouseLeave={e => e.currentTarget.querySelectorAll('button').forEach(b => { b.style.color = 'transparent' })}
        >
          {[{ action: 'minimize', symbol: '-', color: '#ffbd2e' }, { action: 'maximize', symbol: '+', color: '#28ca42' }, { action: 'close', symbol: 'x', color: '#ff5f57' }].map(({ action, symbol, color }) => (
            <button key={action} type="button" onClick={() => ctrl(action)} title={action}
              style={{ width: 12, height: 12, borderRadius: '50%', background: color, border: 'none', cursor: 'pointer', fontSize: 9, lineHeight: 1, color: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color .1s' }}>
              {symbol}
            </button>
          ))}
        </div>
      </form>

      {/* Path autocomplete dropdown */}
      {visibleSuggestions && (
        <div
          ref={listRef} className="sush-scroll sush-fade-up"
          onMouseDown={e => { clearTimeout(blurTimer.current); e.preventDefault() }}
          style={{ position: 'absolute', top: '100%', left: 240, right: 160, zIndex: 200, maxHeight: 240, overflowY: 'auto', background: '#0b0e11', border: `1px solid ${rgba(accent, 0.28)}`, borderTop: 'none', borderRadius: '0 0 12px 12px', boxShadow: '0 16px 40px rgba(0,0,0,0.55)', padding: '4px 4px 6px' }}
        >
          {suggestions.map((entry, i) => {
            const on = i === activeIdx
            return (
              <button key={entry.name} type="button"
                onMouseDown={() => { setValue(complete(entry)); setShowSuggestions(entry.dir); inputRef.current?.focus() }}
                onMouseEnter={() => setActiveIdx(i)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: '1px solid transparent', borderRadius: 8, background: on ? rgba(accent, 0.12) : 'transparent', color: on ? '#f1f4f6' : '#b0b9c2', padding: '6px 9px', cursor: 'pointer' }}>
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

const kbdStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '1px 4px', fontSize: 9.5, fontFamily: 'inherit', lineHeight: 1.4 }
