import React, { useMemo, useState, useEffect, useRef } from 'react'

// Ctrl+K. Commands, themes and open sessions in one list, filtered by a plain
// substring match. Not fuzzy: fuzzy matching in a list this small mostly
// produces surprising top hits, and every entry here is one word long.

export default function Palette({ commands, themes, tabs, onClose, onRun, onGo }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef(null)

  const entries = useMemo(() => {
    const all = [
      ...commands.map(c => ({
        key: `cmd:${c.name}`,
        label: `:${c.name}`,
        hint: c.summary,
        group: 'command',
        run: () => onRun(`:${c.name}`),
        // A command that needs an argument can't be run blind from a list —
        // prefill the input instead of failing with "give it a name".
        needsArg: /^</.test(c.args)
      })),
      ...themes.map(t => ({
        key: `theme:${t.id}`,
        label: t.label,
        hint: t.note,
        group: 'theme',
        run: () => onRun(`:theme ${t.id}`)
      })),
      ...tabs.map((t, i) => ({
        key: `tab:${t.id}`,
        label: t.label,
        hint: t.cwd ?? `session ${i + 1}`,
        group: 'session',
        run: () => onGo(t.id)
      }))
    ]
    const q = query.trim().toLowerCase().replace(/^:/, '')
    if (!q) return all
    return all.filter(e => `${e.label} ${e.hint}`.toLowerCase().includes(q))
  }, [commands, themes, tabs, query, onRun, onGo])

  useEffect(() => { setIndex(0) }, [query])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const choose = (entry) => {
    if (!entry) return
    entry.run()
  }

  return (
    <div className="air-palette" onClick={onClose}>
      <div className="air-palette-box" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          placeholder="commands, themes, sessions"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(entries.length - 1, i + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)) }
            if (e.key === 'Enter') { e.preventDefault(); choose(entries[index]) }
            if (e.key === 'Escape') onClose()
          }}
        />
        <div className="air-palette-list" ref={listRef}>
          {entries.length === 0 && <div className="air-palette-empty">nothing matches</div>}
          {entries.map((entry, i) => (
            <button
              key={entry.key}
              data-active={i === index}
              className={`air-palette-row${i === index ? ' is-active' : ''}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(entry)}
            >
              <span className="air-palette-label">{entry.label}</span>
              <span className="air-palette-hint">{entry.hint}</span>
              <span className={`air-palette-group is-${entry.group}`}>{entry.group}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
