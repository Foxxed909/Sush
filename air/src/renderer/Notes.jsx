import React, { useState } from 'react'

// The notes panel. `:note fix the retry loop` drops a line here, tagged with
// the session it came from and the time.
//
// This is the one feature Air has that the main app does not, and it exists
// because of what a terminal actually gets used for: you notice something
// mid-run, and the alternative is a scratch file you never open again. Notes
// live in localStorage, they are never uploaded anywhere, and Air has no
// network code to upload them with.

function when(ts) {
  const d = new Date(ts)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function Notes({ notes, onClose, onAdd, onRemove }) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const text = draft.trim()
    if (!text) return
    onAdd(text)
    setDraft('')
  }

  return (
    <aside className="air-notes">
      <header>
        <h2>Notes</h2>
        <button onClick={onClose} aria-label="Close notes">×</button>
      </header>

      <div className="air-notes-list">
        {notes.length === 0 && (
          <p className="air-notes-empty">
            Nothing yet. Type <code>:note something</code> without leaving the keyboard.
          </p>
        )}
        {[...notes].reverse().map(note => (
          <div className="air-note" key={note.at}>
            <div className="air-note-meta">
              <span>{when(note.at)}</span>
              {note.session && <span className="air-note-session">{note.session}</span>}
              <button onClick={() => onRemove(note.at)} aria-label="Delete note">×</button>
            </div>
            <div className="air-note-text">{note.text}</div>
          </div>
        ))}
      </div>

      <div className="air-notes-add">
        <input
          value={draft}
          placeholder="add a note"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
            if (e.key === 'Escape') onClose()
          }}
        />
        <button onClick={add}>add</button>
      </div>
    </aside>
  )
}
