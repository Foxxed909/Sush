import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useTerminal } from '../hooks/useTerminal'
import ContextMenu from './ContextMenu'
import SearchBar from './SearchBar'

export default function Terminal({
  tabId,
  theme,
  profile,
  active,
  initialCwd,
  fontSize,
  fontFamily,
  cursorStyle,
  onNewTab,
  onCommand,
  onSessionState,
  onReady
}) {
  const containerRef = useRef(null)
  const copyNoticeTimerRef = useRef(null)
  const [ctxMenu, setCtxMenu] = useState(null)
  const [showSearch, setShowSearch] = useState(false)
  const [copyNotice, setCopyNotice] = useState('')
  const accent = theme?.ui?.accent ?? '#ff6b9d'

  const handleAutoCopy = useCallback((text) => {
    setCopyNotice(`Copied ${text.length} chars`)
    if (copyNoticeTimerRef.current) clearTimeout(copyNoticeTimerRef.current)
    copyNoticeTimerRef.current = setTimeout(() => setCopyNotice(''), 1000)
  }, [])

  const { fit, focus, pasteText, search, searchPrev, clearSearch, getSelection, clear } = useTerminal({
    containerRef,
    tabId,
    theme,
    profile,
    initialCwd,
    fontSize,
    fontFamily,
    cursorStyle,
    onAutoCopy: handleAutoCopy,
    onCommand,
    onSessionState,
    onReady
  })

  useEffect(() => {
    return () => {
      if (copyNoticeTimerRef.current) clearTimeout(copyNoticeTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (active) setTimeout(() => { fit(); focus() }, 10)
  }, [active, fit, focus])

  // Ctrl+F to open search
  useEffect(() => {
    if (!active) return
    const handler = (e) => {
      if (e.ctrlKey && e.key === 'f') { e.preventDefault(); setShowSearch(s => !s) }
      if (e.key === 'Escape' && showSearch) { clearSearch(); setShowSearch(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, showSearch, clearSearch])

  const handleContextMenu = useCallback((e) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleCopy = useCallback(() => {
    const sel = getSelection()
    if (sel) window.sush.copyText(sel)
  }, [getSelection])

  const handlePaste = useCallback(async () => {
    const text = await window.sush.readClipboard()
    pasteText(text)
  }, [pasteText])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        // Keep inactive terminals in layout (just hidden) so they retain real
        // dimensions — avoids xterm scroll-sync errors when a swarm mounts many
        // at once, and makes switching between them instant.
        visibility: active ? 'visible' : 'hidden',
        zIndex: active ? 2 : 1,
        pointerEvents: active ? 'auto' : 'none'
      }}
      onContextMenu={handleContextMenu}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {copyNotice && (
        <div
          style={{
            position: 'absolute',
            right: 14,
            bottom: 12,
            zIndex: 120,
            color: '#050505',
            background: accent,
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: 12,
            fontWeight: 700,
            boxShadow: '0 4px 16px #0008',
            pointerEvents: 'none'
          }}
        >
          {copyNotice}
        </div>
      )}

      {showSearch && (
        <SearchBar
          accent={accent}
          onSearch={search}
          onSearchPrev={searchPrev}
          onClear={clearSearch}
          onClose={() => { clearSearch(); setShowSearch(false) }}
        />
      )}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          accent={accent}
          hasSelection={!!getSelection()}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onClear={clear}
          onNewTab={onNewTab}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
