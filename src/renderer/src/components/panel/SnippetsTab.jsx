import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { PanelEmpty, TabHeader, copyToClipboard } from './shared'

// ---------- Command Snippets ----------
const SNIPPETS_KEY = 'sush-snippets'

function loadSnippets() {
  try { return JSON.parse(localStorage.getItem(SNIPPETS_KEY) ?? '[]') } catch { return [] }
}

function SnippetsTab({ accent, onRun }) {
  const [snippets, setSnippets] = useState(loadSnippets)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCmd, setNewCmd] = useState('')
  const nameRef = useRef(null)
  const cmdRef = useRef(null)

  useEffect(() => { if (creating) nameRef.current?.focus() }, [creating])

  const persist = (next) => {
    setSnippets(next)
    localStorage.setItem(SNIPPETS_KEY, JSON.stringify(next))
  }

  const addSnippet = () => {
    const name = newName.trim()
    const command = newCmd.trim()
    if (!name || !command) return
    persist([...snippets, { id: `snip-${Date.now()}`, name, command }])
    setCreating(false)
    setNewName('')
    setNewCmd('')
  }

  const deleteSnippet = (id) => persist(snippets.filter(s => s.id !== id))

  const cancel = () => { setCreating(false); setNewName(''); setNewCmd('') }

  const displayed = snippets.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.command.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="layers"
        title="Snippets"
        sub={`${snippets.length} saved command${snippets.length !== 1 ? 's' : ''}`}
        right={
          <button
            onClick={() => setCreating(true)}
            title="New snippet"
            className="sush-icon-btn flex items-center justify-center"
            style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${rgba(accent, 0.35)}`, background: rgba(accent, 0.1), color: accent, cursor: 'pointer' }}
          >
            <Icon name="plus" size={14} strokeWidth={2.4} />
          </button>
        }
      />

      {creating && (
        <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--border-1)', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <input
            ref={nameRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); cmdRef.current?.focus() } if (e.key === 'Escape') cancel() }}
            placeholder="Name (e.g. Start dev server)..."
            spellCheck={false}
            style={{ padding: '6px 9px', background: 'var(--surface-2)', border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 7, color: 'var(--text-1)', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' }}
          />
          <input
            ref={cmdRef}
            value={newCmd}
            onChange={e => setNewCmd(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addSnippet(); if (e.key === 'Escape') cancel() }}
            placeholder="Command (e.g. npm run dev)..."
            spellCheck={false}
            style={{ padding: '6px 9px', background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 7, color: 'var(--text-2)', fontSize: 11.5, fontFamily: 'monospace', outline: 'none', width: '100%', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={cancel} style={{ padding: '4px 11px', borderRadius: 6, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
            <button onClick={addSnippet} disabled={!newName.trim() || !newCmd.trim()} style={{ padding: '4px 11px', borderRadius: 6, border: `1px solid ${rgba(accent, 0.4)}`, background: rgba(accent, 0.12), color: accent, fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: (!newName.trim() || !newCmd.trim()) ? 0.5 : 1 }}>Save</button>
          </div>
        </div>
      )}

      <div style={{ padding: '8px 10px 0' }}>
        <div className="sush-omni flex items-center" style={{ height: 34, gap: 8 }}>
          <Icon name="search" size={13} color="var(--text-4)" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search snippets..."
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-1)', outline: 'none', fontSize: 12 }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        {!displayed.length ? (
          <PanelEmpty
            icon="layers"
            accent={accent}
            hint={snippets.length ? 'No snippets match your search.' : 'Save frequently-used commands for quick access. Press + to create one.'}
          >
            {snippets.length ? 'No matches' : 'No snippets yet'}
          </PanelEmpty>
        ) : displayed.map(s => (
          <div
            key={s.id}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 6, border: '1px solid var(--border-1)', borderRadius: 9, background: 'var(--surface-2)' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'monospace', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.command}</div>
            </div>
            <button
              onClick={() => copyToClipboard(s.command)}
              title="Copy command"
              style={{ width: 27, height: 27, flexShrink: 0, borderRadius: 7, border: '1px solid var(--border-1)', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="copy" size={12} />
            </button>
            <button
              onClick={() => onRun?.(s.command)}
              title="Run"
              style={{ width: 27, height: 27, flexShrink: 0, borderRadius: 7, border: `1px solid ${rgba(accent, 0.3)}`, background: rgba(accent, 0.08), color: accent, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="arrowRight" size={13} />
            </button>
            <button
              onClick={() => deleteSnippet(s.id)}
              title="Delete"
              style={{ width: 27, height: 27, flexShrink: 0, borderRadius: 7, border: '1px solid var(--border-1)', background: 'transparent', color: 'var(--text-5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="trash" size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SnippetsTab
