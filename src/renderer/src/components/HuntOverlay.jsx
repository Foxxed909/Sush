import React, { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

// Hunt overlay (Ctrl+Shift+F) — the `hunt` command with a face: search the
// output of every session (live + the saved scrollback of closed ones) as you
// type, arrow through the hits, Enter to jump to a live session. Saved-session
// hits are read-only context (their PTY is gone), shown dimmed with a "saved"
// tag. Same palette recipe as CommandPalette: one backdrop, one sheet.

export default function HuntOverlay({ accent, tabs = [], onJump, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [idx, setIdx] = useState(0)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef(null)
  const reqRef = useRef(0)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Debounced live search; stale responses are dropped by the request id.
  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) { setResults([]); setSearched(false); return }
    const id = ++reqRef.current
    const t = setTimeout(() => {
      window.sush?.huntSearch?.({ term })
        .then(r => {
          if (id !== reqRef.current) return
          setResults(r?.ok ? (r.results || []) : [])
          setSearched(true)
        })
        .catch(() => { if (id === reqRef.current) { setResults([]); setSearched(true) } })
    }, 180)
    return () => clearTimeout(t)
  }, [query])

  // Flatten to one row per matched line so arrow keys walk hits, not sessions.
  const rows = useMemo(() => {
    const liveIds = new Set(tabs.map(t => t.id))
    const out = []
    for (const r of results) {
      const jumpable = !r.saved && liveIds.has(r.tabId)
      for (const line of r.lines || []) {
        out.push({ tabId: r.tabId, saved: !!r.saved, jumpable, label: r.label, line: line.line, text: line.text })
      }
    }
    return out.slice(0, 40)
  }, [results, tabs])

  useEffect(() => { setIdx(0) }, [rows.length, query])

  const jump = (row) => {
    if (!row?.jumpable) return
    onJump(row.tabId)
    onClose()
  }

  const handleKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, rows.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); jump(rows[idx]) }
  }

  const mark = (text) => {
    // Highlight the matched term inside the row (case-insensitive, first hit).
    const q = query.trim()
    const at = text.toLowerCase().indexOf(q.toLowerCase())
    if (q.length < 2 || at < 0) return text
    return (
      <>
        {text.slice(0, at)}
        <span style={{ color: accent, fontWeight: 800 }}>{text.slice(at, at + q.length)}</span>
        {text.slice(at + q.length)}
      </>
    )
  }

  return (
    <div
      className="sush-backdrop"
      style={{ position: 'fixed', inset: 0, zIndex: 450, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', paddingTop: '14vh' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="sush-pop"
        style={{ width: '100%', maxWidth: 640, background: '#0d1015', border: `1px solid ${rgba(accent, 0.35)}`, borderRadius: 'var(--r-xl)', boxShadow: `0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px ${rgba(accent, 0.1)}`, overflow: 'hidden' }}
      >
        <div className="flex items-center" style={{ gap: 10, padding: '12px 16px', borderBottom: `1px solid ${rgba(accent, 0.12)}` }}>
          <Icon name="search" size={16} color={accent} strokeWidth={2} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Hunt across every session's output..."
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-1)', fontSize: 15, outline: 'none', fontFamily: 'inherit' }}
          />
          <kbd style={{ fontSize: 10, color: 'var(--text-4)', background: '#1a2128', border: '1px solid #2a333c', borderRadius: 5, padding: '2px 6px' }}>ESC</kbd>
        </div>

        <div style={{ maxHeight: 380, overflowY: 'auto' }} className="sush-scroll">
          {query.trim().length < 2 && (
            <div style={{ padding: '22px 16px', textAlign: 'center', color: 'var(--text-4)', fontSize: 12.5 }}>
              Type at least 2 characters — live sessions and saved scrollback are both searched.
            </div>
          )}
          {searched && query.trim().length >= 2 && rows.length === 0 && (
            <div style={{ padding: '22px 16px', textAlign: 'center', color: 'var(--text-4)', fontSize: 12.5 }}>
              No session output matches “{query.trim()}”.
            </div>
          )}
          {rows.map((row, i) => (
            <button
              key={`${row.saved ? 's' : 'l'}-${row.tabId || i}-${row.line}-${i}`}
              onClick={() => jump(row)}
              onMouseEnter={() => setIdx(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 16px',
                border: 'none', background: i === idx ? rgba(accent, 0.1) : 'transparent',
                color: 'var(--text-2)', cursor: row.jumpable ? 'pointer' : 'default', textAlign: 'left'
              }}
            >
              <span className="flex items-center" style={{ gap: 6, flexShrink: 0, width: 148, overflow: 'hidden' }}>
                <Icon name={row.saved ? 'clock' : 'terminal'} size={12} color={row.saved ? 'var(--text-5)' : accent} strokeWidth={2} />
                <span style={{ fontSize: 11, fontWeight: 800, color: row.saved ? 'var(--text-4)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.label}
                </span>
                {row.saved && <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.6, color: 'var(--text-5)', border: '1px solid var(--border-2)', borderRadius: 999, padding: '1px 5px', flexShrink: 0 }}>SAVED</span>}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontFamily: 'monospace', color: row.saved ? 'var(--text-4)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {mark(row.text)}
              </span>
              {row.jumpable && i === idx && (
                <span style={{ fontSize: 10, fontWeight: 800, color: accent, flexShrink: 0 }}>jump ↵</span>
              )}
            </button>
          ))}
        </div>

        <div style={{ padding: '8px 16px', borderTop: `1px solid ${rgba(accent, 0.08)}`, display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-5)' }}>
          <span><kbd style={kbd}>↑↓</kbd> hits</span>
          <span><kbd style={kbd}>↵</kbd> jump to session</span>
          <span><kbd style={kbd}>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}

const kbd = { background: '#141a20', border: '1px solid #1d242b', borderRadius: 4, padding: '1px 5px' }
