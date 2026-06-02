import React, { useRef, useState } from 'react'

export default function TabBar({ tabs, activeId, onSelect, onNew, onClose, accent, profiles }) {
  const dragId = useRef(null)
  const [dragOver, setDragOver] = useState(null)

  const handleDragStart = (id) => { dragId.current = id }
  const handleDragOver = (e, id) => { e.preventDefault(); setDragOver(id) }
  const handleDrop = (e, targetId) => {
    e.preventDefault()
    setDragOver(null)
    if (!dragId.current || dragId.current === targetId) return
    onNew({ reorder: true, from: dragId.current, to: targetId })
    dragId.current = null
  }
  const handleDragEnd = () => { setDragOver(null); dragId.current = null }

  return (
    <div
      className="flex items-center gap-1 px-2 shrink-0 overflow-x-auto flex-1"
      style={{ background: '#111', borderBottom: `1px solid ${accent}22`, height: 36 }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId
        const isDragTarget = dragOver === tab.id
        return (
          <div
            key={tab.id}
            draggable
            onDragStart={() => handleDragStart(tab.id)}
            onDragOver={(e) => handleDragOver(e, tab.id)}
            onDrop={(e) => handleDrop(e, tab.id)}
            onDragEnd={handleDragEnd}
            className="flex items-center gap-2 px-3 rounded-t cursor-pointer select-none shrink-0 group"
            style={{
              background: isActive ? '#1f1f1f' : isDragTarget ? `${accent}11` : 'transparent',
              color: isActive ? accent : '#888',
              borderBottom: isActive ? `2px solid ${accent}` : isDragTarget ? `2px solid ${accent}44` : '2px solid transparent',
              height: 34, fontSize: 13, transition: 'all 0.1s',
              outline: isDragTarget ? `1px dashed ${accent}44` : 'none'
            }}
            onClick={() => onSelect(tab.id)}
          >
            <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tab.label}
            </span>
            <button
              className="opacity-0 group-hover:opacity-100 hover:text-white transition-opacity ml-1"
              style={{ fontSize: 11, lineHeight: 1, padding: '1px 3px', borderRadius: 3, background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onClose(tab.id) }}
            >
              x
            </button>
          </div>
        )
      })}

      <div className="relative">
        <button
          className="flex items-center justify-center shrink-0 rounded hover:bg-white/10 transition-colors"
          style={{ width: 26, height: 26, color: '#666', fontSize: 18, background: 'transparent', border: 'none', cursor: 'pointer' }}
          onClick={() => onNew({ profile: profiles?.[0] })}
          title="New tab"
        >
          +
        </button>
      </div>
    </div>
  )
}
