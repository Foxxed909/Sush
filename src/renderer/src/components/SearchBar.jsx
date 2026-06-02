import React, { useRef, useEffect, useState } from 'react'

export default function SearchBar({ onSearch, onSearchPrev, onClear, onClose, accent }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    const handler = (e) => {
      if (e.key === 'Escape') { onClear(); onClose() }
      if (e.key === 'Enter') { e.shiftKey ? onSearchPrev(query) : onSearch(query) }
      if (e.key === 'F3') { e.shiftKey ? onSearchPrev(query) : onSearch(query); e.preventDefault() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [query, onSearch, onSearchPrev, onClose, onClear])

  const handleChange = (e) => {
    setQuery(e.target.value)
    if (e.target.value) onSearch(e.target.value)
    else onClear()
  }

  return (
    <div
      style={{
        position: 'absolute', top: 8, right: 12, zIndex: 100,
        display: 'flex', alignItems: 'center', gap: 4,
        background: '#1a1a1a', border: `1px solid ${accent}55`,
        borderRadius: 6, padding: '4px 6px',
        boxShadow: '0 4px 16px #0006'
      }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={handleChange}
        placeholder="Search..."
        style={{
          background: 'none', border: 'none', outline: 'none',
          color: '#eee', fontSize: 13, width: 180
        }}
      />
      {['↑', '↓'].map((arrow, i) => (
        <button key={arrow} onClick={() => i === 0 ? onSearchPrev(query) : onSearch(query)}
          style={{ background: 'none', border: 'none', color: accent, cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>
          {arrow}
        </button>
      ))}
      <button onClick={() => { onClear(); onClose() }}
        style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16, padding: '0 2px', marginLeft: 2 }}>
        ×
      </button>
    </div>
  )
}
