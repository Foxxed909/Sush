import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useTerminal } from '../hooks/useTerminal'
import ContextMenu from './ContextMenu'
import SearchBar from './SearchBar'
import { quoteShellPath } from '../lib/shellQuote'

export default function Terminal({
  tabId,
  theme,
  profile,
  shellId,
  active,
  splitVisible,
  initialCwd,
  bootCommand,
  fontSize,
  fontFamily,
  lineHeight,
  cursorStyle,
  broadcastTabIds,
  restoreKey,
  persistScrollback,
  transparentBg,
  powerSaver,
  inputLocked,
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

  const { fit, focus, pasteText, search, searchPrev, clearSearch, getSelection, clear } = useTerminal({
    containerRef,
    tabId,
    theme,
    profile,
    initialCwd,
    bootCommand,
    fontSize,
    fontFamily,
    lineHeight,
    cursorStyle,
    broadcastTabIds,
    restoreKey,
    persistScrollback,
    transparentBg,
    powerSaver,
    inputLocked,
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
    if (!active) return
    const t = setTimeout(() => { fit(); focus() }, 10)
    return () => clearTimeout(t)
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

  // Drag a file/folder onto the terminal → its path lands at the cursor using
  // literal quoting for the live shell. dragDepthRef counts enter/leave pairs
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
    const paths = Array.from(e.dataTransfer?.files ?? [])
      .map(file => {
        try { return window.sush?.pathForFile?.(file) || '' } catch { return '' }
      })
      .filter(Boolean)
    if (paths.length) {
      pasteText(paths.map(path => quoteShellPath(path, {
        platform: window.sush?.platform,
        shellId: shellId || profile?.shell
      })).join(' ') + ' ')
      return
    }
    const text = e.dataTransfer?.getData('text')
    if (text) pasteText(text)
  }, [pasteText, profile?.shell, shellId])

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
