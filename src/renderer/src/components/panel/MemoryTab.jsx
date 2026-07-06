import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { PanelEmpty, TabHeader } from './shared'

// ---------- Memory (BridgeMemory-style) ----------
function renderWithLinks(content, accent, onLink) {
  const parts = String(content || '').split(/(\[\[[^\]]+\]\])/g)
  return parts.map((part, i) => {
    const m = part.match(/^\[\[([^\]]+)\]\]$/)
    if (!m) return <span key={i}>{part}</span>
    const name = m[1].trim()
    return (
      <button
        key={i}
        onClick={() => onLink(name)}
        style={{ color: accent, background: rgba(accent, 0.12), border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 6, padding: '0 5px', margin: '0 1px', cursor: 'pointer', fontWeight: 700, fontSize: 'inherit', fontFamily: 'inherit' }}
      >
        {name}
      </button>
    )
  })
}

function MemoryTab({ accent, cwd }) {
  const [notes, setNotes] = useState(null)
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const createRef = useRef(null)

  const refresh = () => {
    if (!cwd) { setNotes([]); return }
    window.sush?.memoryList?.({ cwd }).then(res => setNotes(res.notes || [])).catch(() => setNotes([]))
  }
  useEffect(() => { refresh(); setSelected(null) }, [cwd]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (creating) createRef.current?.focus() }, [creating])

  const openNote = (name) => {
    window.sush?.memoryRead?.({ cwd, name }).then(res => setSelected(res)).catch(() => {})
  }
  const createNote = (name) => {
    const safe = String(name || '').trim()
    if (!safe) return
    const content = `# ${safe}\n\nLink notes with [[wikilinks]].\n`
    window.sush?.memoryWrite?.({ cwd, name: safe, content }).then(() => {
      setCreating(false); setNewName(''); refresh(); openNote(safe)
    })
  }

  if (selected) {
    return (
      <div className="flex flex-col" style={{ height: '100%' }}>
        <TabHeader
          accent={accent}
          icon="book"
          title={selected.name}
          sub=".sushmemory"
          right={
            <button onClick={() => setSelected(null)} title="Back" className="sush-icon-btn flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border-2)', background: 'var(--surface-1)', color: 'var(--text-3)', cursor: 'pointer' }}>
              <Icon name="chevronRight" size={13} style={{ transform: 'rotate(180deg)' }} />
            </button>
          }
        />
        <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 14 }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12.5, lineHeight: 1.65, color: 'var(--text-2)', fontFamily: 'inherit' }}>
            {renderWithLinks(selected.content, accent, (name) => {
              const exists = (notes || []).some(n => n.name.toLowerCase() === name.toLowerCase())
              exists ? openNote(name) : createNote(name)
            })}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="book"
        title="Memory"
        sub={notes ? `${notes.length} note${notes.length === 1 ? '' : 's'} · .sushmemory` : 'BridgeMemory'}
        right={
          <button onClick={() => setCreating(true)} title="New note" className="sush-icon-btn flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${rgba(accent, 0.35)}`, background: rgba(accent, 0.1), color: accent, cursor: 'pointer' }}>
            <Icon name="plus" size={14} strokeWidth={2.4} />
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        {creating && (
          <div className="sush-omni flex items-center" style={{ height: 38, gap: 8, marginBottom: 10 }}>
            <Icon name="book" size={14} color={accent} />
            <input
              ref={createRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createNote(newName); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
              placeholder="note name..."
              spellCheck={false}
              style={{ flex: 1, minWidth: 0, height: '100%', background: 'transparent', border: 'none', color: 'var(--text-1)', outline: 'none', fontSize: 12.5 }}
            />
          </div>
        )}
        {notes === null ? (
          <PanelEmpty icon="book" accent={accent}>Loading...</PanelEmpty>
        ) : notes.length ? notes.map(note => (
          <button
            key={note.name}
            onClick={() => openNote(note.name)}
            className="sush-row flex items-center"
            style={{ gap: 10, width: '100%', textAlign: 'left', border: '1px solid var(--border-1)', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--text-2)', padding: '9px 11px', marginBottom: 8, cursor: 'pointer' }}
          >
            <Icon name="book" size={15} color={accent} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</span>
              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                {note.links?.length ? `${note.links.length} link${note.links.length === 1 ? '' : 's'} → ${note.links.slice(0, 3).join(', ')}` : (note.excerpt || 'empty note')}
              </span>
            </span>
            <Icon name="network" size={13} color={note.links?.length ? accent : 'var(--text-5)'} />
          </button>
        )) : (
          <PanelEmpty icon="book" accent={accent} hint="A local-first knowledge graph for this directory. Notes are markdown in .sushmemory, linked with [[wikilinks]].">No notes yet</PanelEmpty>
        )}
      </div>
    </div>
  )
}

export default MemoryTab
