import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

// Split "C:\a\b\partial" → { parent: "C:\a\b", partial: "partial", sep: "\\" }.
// A trailing separator means we're listing the directory itself (partial = '').
function splitPath(value) {
  const v = String(value || '')
  const lastSlash = Math.max(v.lastIndexOf('\\'), v.lastIndexOf('/'))
  if (lastSlash < 0) return { parent: '', partial: v, sep: '\\' }
  const sep = v[lastSlash]
  return { parent: v.slice(0, lastSlash) || sep, partial: v.slice(lastSlash + 1), sep }
}

// "C:" on its own is the drive's current dir, not its root — normalise so the
// listing is predictable.
function lookupPath(parent) {
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent
}

// A directory input that suggests the children of the path being typed. Backed by
// the main-process listDir IPC, so it reflects the real filesystem. Tab / Enter
// completes the highlighted entry; Enter on a complete path submits.
export default function PathField({
  value,
  onChange,
  onEnter,
  onValidChange,
  accent = '#ff6b9d',
  placeholder,
  autoFocus,
  dirsOnly = true
}) {
  const [entries, setEntries] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [valid, setValid] = useState(null) // null = unknown/empty, true/false = real dir or not
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const blurTimer = useRef(null)
  const reqId = useRef(0)
  const validReqId = useRef(0)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
    return () => { if (blurTimer.current) clearTimeout(blurTimer.current) }
  }, [autoFocus])

  const { parent, partial, sep } = splitPath(value)

  // Live "is this a real directory?" check on the full value, so the field can
  // tell you the path actually exists before you launch (it no longer silently
  // falls back to home). Guarded against out-of-order async with validReqId.
  useEffect(() => {
    const v = String(value || '').trim()
    if (!v) { setValid(null); onValidChange?.(null); return }
    const id = ++validReqId.current
    window.sush?.dirExists?.({ path: lookupPath(v) })
      .then(res => { if (id === validReqId.current) { setValid(!!res?.exists); onValidChange?.(!!res?.exists) } })
      .catch(() => { if (id === validReqId.current) { setValid(false); onValidChange?.(false) } })
  }, [value, onValidChange])

  // Re-list whenever the parent directory changes (not on every keystroke of the
  // leaf name). reqId guards against out-of-order async responses.
  useEffect(() => {
    if (!parent) { setEntries([]); return }
    const id = ++reqId.current
    window.sush?.listDir?.({ path: lookupPath(parent) })
      .then(res => { if (id === reqId.current) setEntries(res?.entries || []) })
      .catch(() => { if (id === reqId.current) setEntries([]) })
  }, [parent])

  const lower = partial.toLowerCase()
  const suggestions = entries
    .filter(e => (dirsOnly ? e.dir : true))
    .filter(e => e.name.toLowerCase().startsWith(lower))
    .slice(0, 60)

  useEffect(() => { setActive(0) }, [parent, partial])
  useEffect(() => {
    listRef.current?.children?.[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const complete = (entry) => {
    if (!entry) return
    const base = parent.endsWith(sep) ? parent : `${parent}${sep}`
    onChange(`${base}${entry.name}${entry.dir ? sep : ''}`)
    setOpen(true) // keep open so you can drill straight into the next level
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    const visible = open && suggestions.length > 0
    if (visible && e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => Math.min(a + 1, suggestions.length - 1))
      return
    }
    if (visible && e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, 0))
      return
    }
    if (visible && e.key === 'Tab') {
      e.preventDefault()
      complete(suggestions[active])
      return
    }
    if (e.key === 'Enter') {
      const exact = suggestions.find(s => s.name.toLowerCase() === lower)
      if (visible && !exact && suggestions[active]) {
        e.preventDefault()
        complete(suggestions[active])
        return
      }
      setOpen(false)
      onEnter?.()
      return
    }
    if (e.key === 'Escape' && open) {
      // Close just the dropdown, not the surrounding modal.
      e.preventDefault()
      e.nativeEvent?.stopImmediatePropagation?.()
      setOpen(false)
    }
  }

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <div
        className="sush-omni flex items-center"
        style={{
          height: 42,
          gap: 10,
          borderColor: valid === false ? 'rgba(255,83,112,0.55)' : undefined
        }}
      >
        <Icon name="folder" size={16} color={valid === false ? '#ff5370' : accent} />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true) }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 140) }}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          style={{ flex: 1, minWidth: 0, height: '100%', background: 'transparent', border: 'none', color: '#f1f4f6', outline: 'none', fontSize: 13 }}
        />
        {suggestions.length > 0 && (
          <span style={{ flexShrink: 0, color: '#5a646d', fontSize: 10, fontWeight: 700, userSelect: 'none' }}>
            Tab ↹
          </span>
        )}
        {valid === true && (
          <Icon name="check" size={15} color="#7ee787" strokeWidth={2.6} style={{ flexShrink: 0 }} />
        )}
        {valid === false && (
          <span title="No such directory" style={{ flexShrink: 0, color: '#ff5370', fontSize: 10.5, fontWeight: 800, userSelect: 'none' }}>
            not found
          </span>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div
          ref={listRef}
          className="sush-scroll sush-fade-up"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 60,
            maxHeight: 240,
            overflowY: 'auto',
            background: '#0b0e11',
            border: `1px solid ${rgba(accent, 0.3)}`,
            borderRadius: 10,
            boxShadow: '0 18px 44px rgba(0,0,0,0.6)',
            padding: 5
          }}
        >
          {suggestions.map((entry, i) => {
            const on = i === active
            return (
              <button
                key={entry.name}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); complete(entry) }}
                onMouseEnter={() => setActive(i)}
                className="flex items-center"
                style={{
                  gap: 9,
                  width: '100%',
                  textAlign: 'left',
                  border: '1px solid transparent',
                  borderRadius: 7,
                  background: on ? rgba(accent, 0.14) : 'transparent',
                  color: on ? '#f1f4f6' : '#c2cad1',
                  padding: '7px 9px',
                  cursor: 'pointer'
                }}
              >
                <Icon name={entry.dir ? 'folder' : 'file'} size={14} color={entry.dir ? accent : '#69737d'} strokeWidth={2} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5 }}>{entry.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
