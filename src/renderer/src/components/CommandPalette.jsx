import React, { useState, useEffect, useRef, useCallback } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

function fuzzyScore(query, target) {
  if (!query) return 1
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (t === q) return 100
  if (t.startsWith(q)) return 80
  if (t.includes(q)) return 60
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  if (qi === q.length) return 40
  return 0
}

const STATIC_ACTIONS = [
  { id: 'new-session', label: 'New Session', description: 'Open the swarm launcher', icon: 'plus', action: 'new-session' },
  { id: 'open-seducia', label: 'Open Seducia', description: 'AI session orchestrator (Ctrl+K)', icon: 'sparkles', action: 'open-seducia' },
  { id: 'settings', label: 'Settings', description: 'Open settings panel', icon: 'settings', action: 'settings' },
  { id: 'plans', label: 'Plans & Billing', description: 'View plan tiers', icon: 'layers', action: 'plans' },
  { id: 'toggle-panel', label: 'Toggle Right Panel', description: 'Show/hide the right panel (Ctrl+B)', icon: 'panel', action: 'toggle-panel' },
  { id: 'zen', label: 'Toggle Zen Mode', description: 'Hide all panels for focus', icon: 'terminal', action: 'zen' },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', description: 'View all shortcuts (Ctrl+?)', icon: 'command', action: 'shortcuts' },
  { id: 'home', label: 'Go Home', description: 'Open the home dashboard', icon: 'home', action: 'home' },
]

export default function CommandPalette({ accent, onClose, onAction, onRun }) {
  const [query, setQuery] = useState('')
  const [commands, setCommands] = useState([])
  const [idx, setIdx] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    window.sush?.getAllCommands?.().then(cmds => setCommands(cmds || [])).catch(() => {})
  }, [])

  const items = (() => {
    const q = query.trim()
    const all = [
      ...STATIC_ACTIONS.map(a => ({ ...a, type: 'action', score: fuzzyScore(q, a.label) + fuzzyScore(q, a.description) })),
      ...commands.map(c => ({ id: `cmd:${c.name}`, label: c.name, description: c.description, usage: c.usage, icon: 'terminal', type: 'command', score: fuzzyScore(q, c.name) + fuzzyScore(q, c.description) }))
    ]
    return all.filter(i => i.score > 0).sort((a, b) => b.score - a.score).slice(0, 20)
  })()

  const select = useCallback((item) => {
    if (item.type === 'action') onAction(item.action)
    else onRun(item.label)
    onClose()
  }, [onAction, onRun, onClose])

  useEffect(() => { setIdx(0) }, [query])

  const handleKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, items.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); if (items[idx]) select(items[idx]); return }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', paddingTop: '14vh' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="sush-fade-up"
        style={{ width: '100%', maxWidth: 580, background: '#0d1015', border: `1px solid ${rgba(accent, 0.35)}`, borderRadius: 14, boxShadow: `0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px ${rgba(accent, 0.1)}`, overflow: 'hidden' }}
      >
        {/* Search input */}
        <div className="flex items-center" style={{ gap: 10, padding: '12px 16px', borderBottom: `1px solid ${rgba(accent, 0.12)}` }}>
          <Icon name="search" size={16} color={accent} strokeWidth={2} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search commands and actions..."
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#f1f4f6', fontSize: 15, outline: 'none', fontFamily: 'inherit' }}
          />
          <kbd style={{ fontSize: 10, color: '#5a646d', background: '#1a2128', border: '1px solid #2a333c', borderRadius: 5, padding: '2px 6px' }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 400, overflowY: 'auto' }} className="sush-scroll">
          {items.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#5a646d', fontSize: 13 }}>No results</div>
          )}
          {items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => select(item)}
              onMouseEnter={() => setIdx(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                padding: '10px 16px',
                border: 'none',
                background: i === idx ? rgba(accent, 0.1) : 'transparent',
                color: '#d4dbe1',
                cursor: 'pointer',
                borderLeft: `3px solid ${i === idx ? accent : 'transparent'}`,
                textAlign: 'left'
              }}
            >
              <span style={{ width: 32, height: 32, borderRadius: 8, background: i === idx ? rgba(accent, 0.2) : '#141a20', border: `1px solid ${i === idx ? rgba(accent, 0.4) : '#1d242b'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: i === idx ? accent : '#8a939c' }}>
                <Icon name={item.icon} size={15} strokeWidth={2} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: i === idx ? '#f1f4f6' : '#d4dbe1' }}>{item.label}</span>
                <span style={{ display: 'block', fontSize: 11, color: '#5a646d', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.usage ? <span style={{ color: rgba(accent, 0.7), marginRight: 6, fontFamily: 'monospace' }}>{item.usage}</span> : null}
                  {item.description}
                </span>
              </span>
              {item.type === 'command' && (
                <span style={{ fontSize: 10, color: '#3f4852', background: '#141a20', border: '1px solid #1d242b', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>cmd</span>
              )}
            </button>
          ))}
        </div>

        <div style={{ padding: '8px 16px', borderTop: `1px solid ${rgba(accent, 0.08)}`, display: 'flex', gap: 14, fontSize: 11, color: '#3f4852' }}>
          <span><kbd style={{ background: '#141a20', border: '1px solid #1d242b', borderRadius: 4, padding: '1px 5px' }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ background: '#141a20', border: '1px solid #1d242b', borderRadius: 4, padding: '1px 5px' }}>↵</kbd> select</span>
          <span><kbd style={{ background: '#141a20', border: '1px solid #1d242b', borderRadius: 4, padding: '1px 5px' }}>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
