import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useTerminal } from '../hooks/useTerminal'
import ContextMenu from './ContextMenu'
import SearchBar from './SearchBar'

export default function Terminal({
  tabId,
  theme,
  profile,
  active,
  splitVisible,
  initialCwd,
  bootCommand,
  fontSize,
  fontFamily,
  cursorStyle,
  broadcastTabIds,
  restoreKey,
  persistScrollback,
  onNewTab,
  onCommand,
  onSessionState,
  onReady,
  onExport
}) {
  const containerRef = useRef(null)
  const copyNoticeTimerRef = useRef(null)
  const dragDepthRef = useRef(0)
  const [ctxMenu, setCtxMenu] = useState(null)
  const [showSearch, setShowSearch] = useState(false)
  const [copyNotice, setCopyNotice] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const accent = theme?.ui?.accent ?? '#ff6b9d'

  const handleAutoCopy = useCallback((text) => {
    setCopyNotice(`Copied ${text.length} chars`)
    if (copyNoticeTimerRef.current) clearTimeout(copyNoticeTimerRef.current)
    copyNoticeTimerRef.current = setTimeout(() => setCopyNotice(''), 1000)
  }, [])

  const { fit, focus, pasteText, search, searchPrev, clearSearch, getSelection, clear, startRecording, stopRecording, isRecording } = useTerminal({
    containerRef,
    tabId,
    theme,
    profile,
    initialCwd,
    bootCommand,
    fontSize,
    fontFamily,
    cursorStyle,
    broadcastTabIds,
    restoreKey,
    persistScrollback,
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

  // Drag a file/folder from Explorer onto the terminal → its path lands at the
  // cursor, quoted if it contains spaces. dragDepthRef counts enter/leave pairs
  // because dragleave also fires when crossing into child elements.
  const handleDragEnter = useCallback((e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    dragDepthRef.current += 1
    setDragOver(true)
  }, [])

  const handleDragOver = useCallback((e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDragLeave = useCallback(() => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragOver(false)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    dragDepthRef.current = 0
    setDragOver(false)
    const paths = Array.from(e.dataTransfer?.files ?? []).map(f => f.path).filter(Boolean)
    if (paths.length) {
      pasteText(paths.map(p => (/\s/.test(p) ? `"${p}"` : p)).join(' ') + ' ')
      return
    }
    const text = e.dataTransfer?.getData('text')
    if (text) pasteText(text)
  }, [pasteText])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        // Keep inactive terminals in layout (just hidden) so they retain real
        // dimensions -- avoids xterm scroll-sync errors when a swarm mounts many
        // at once, and makes switching between them instant. In split view both
        // panes stay visible (splitVisible) even though only one is keyboard-active.
        visibility: (active || splitVisible) ? 'visible' : 'hidden',
        zIndex: active ? 2 : 1,
        pointerEvents: (active || splitVisible) ? 'auto' : 'none'
      }}
      onContextMenu={handleContextMenu}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {dragOver && (
        <div
          style={{
            position: 'absolute',
            inset: 6,
            zIndex: 130,
            border: `2px dashed ${accent}`,
            borderRadius: 10,
            background: `${accent}14`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            fontSize: 12.5,
            fontWeight: 800,
            color: accent,
            letterSpacing: 0.4
          }}
        >
          Drop to paste path
        </div>
      )}

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

      {/* Session recording indicator + controls */}
      {active && (
        <div style={{ position: 'absolute', top: 8, right: 12, zIndex: 120, display: 'flex', alignItems: 'center', gap: 5 }}>
          {isRecording && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,83,112,0.15)', border: '1px solid rgba(255,83,112,0.4)', borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 800, color: '#ff5370' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff5370', animation: 'sush-blink 1s step-start infinite' }} />
              REC
            </span>
          )}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            title={isRecording ? 'Stop recording & download' : 'Start session recording'}
            style={{ width: 24, height: 24, borderRadius: 5, border: `1px solid ${isRecording ? 'rgba(255,83,112,0.4)' : 'rgba(255,255,255,0.08)'}`, background: isRecording ? 'rgba(255,83,112,0.1)' : 'rgba(0,0,0,0.4)', color: isRecording ? '#ff5370' : '#4a5560', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900 }}
          >
            ●
          </button>
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
          onExport={onExport}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
