import React, { useEffect, useMemo, useRef, useState } from 'react'

// Ctrl+K palette: sessions, agents, themes, app actions. Flat list, fuzzy-ish
// substring filter, arrows + Enter. Deliberately dependency-free.
export default function Palette({ entries, theme, onPick, onClose }) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef(null)

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter((e) => `${e.label} ${e.hint || ''}`.toLowerCase().includes(needle))
  }, [q, entries])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setIdx(0) }, [q])

  const onKey = (e) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && matches[idx]) { onPick(matches[idx]); onClose() }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', justifyContent: 'center', paddingTop: '12vh' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 90vw)', height: 'fit-content', background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 18px 50px rgba(0,0,0,0.5)' }}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Type a command, session, agent, or theme…"
          style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', outline: 'none', color: theme.text, fontSize: 14 }}
        />
        <div style={{ maxHeight: 320, overflowY: 'auto', borderTop: `1px solid ${theme.border}` }}>
          {matches.length === 0 && (
            <div style={{ padding: '14px 16px', color: theme.dim, fontSize: 13 }}>No matches</div>
          )}
          {matches.map((e, i) => (
            <div
              key={e.id}
              onMouseEnter={() => setIdx(i)}
              onClick={() => { onPick(e); onClose() }}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 16px', cursor: 'pointer', background: i === idx ? `${theme.accent}22` : 'transparent', borderLeft: `2px solid ${i === idx ? theme.accent : 'transparent'}` }}
            >
              <span style={{ color: theme.text, fontSize: 13, fontWeight: 600 }}>{e.label}</span>
              <span style={{ color: theme.dim, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.hint}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
