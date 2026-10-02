import { useCallback, useEffect, useState } from 'react'
import { setShellChords } from '../lib/keymap'
import { canHandleGlobalShortcut } from '../lib/shortcutGuard'
import {
  activeShellMode, modeFromShortcut, normalizeChannel, normalizeShellMode, terminalPlacement, threadCentered
} from '../lib/shellModes'

const SHELL_MODE_KEY = 'sush-shell-mode'
const SHELL_DRAWER_KEY = 'sush-shell-drawer'

// The Nightly shell's own state: channel, mode (Chat · Code · Thread · Agents
// · Office), the terminal drawer, and the Office monitor zoom — plus the
// rules for where the never-remounted terminal layer sits. Agents IS the
// Overview view; the other modes are layouts around the same terminals.
export function useNightlyShell({ settings, setSettings, view, setView, tabs, tabsRef, activeTab, shortcutsReady, blockingShortcutSurface }) {
  const uiChannel = normalizeChannel(settings.uiChannel)
  const nightlyShell = uiChannel === 'nightly'
  const [shellMode, setShellModeState] = useState(() => {
    try { return normalizeShellMode(localStorage.getItem(SHELL_MODE_KEY)) } catch { return normalizeShellMode(null) }
  })
  const [drawerOpen, setDrawerOpen] = useState(() => {
    try { return localStorage.getItem(SHELL_DRAWER_KEY) !== '0' } catch { return true }
  })
  const [drawerHeight, setDrawerHeight] = useState(260)
  // Office: the desk whose monitor you zoomed into (its real terminal shows there).
  const [officeFocus, setOfficeFocus] = useState(null)

  const currentShellMode = activeShellMode(view, shellMode)
  const setShellMode = useCallback((mode) => {
    if (mode === 'agents') { setView('overview'); return }
    const next = normalizeShellMode(mode)
    setShellModeState(next)
    try { localStorage.setItem(SHELL_MODE_KEY, next) } catch {}
    setView(prev => (prev === 'overview' || (prev === 'home' && tabsRef.current.length && next !== 'chat' && next !== 'office')) ? 'terminal' : prev)
  }, [setView, tabsRef])
  const toggleDrawer = useCallback(() => {
    setDrawerOpen(prev => {
      const next = !prev
      try { localStorage.setItem(SHELL_DRAWER_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }, [])
  const setUiChannel = useCallback((channel) => {
    setSettings(prev => {
      const next = { ...prev, uiChannel: normalizeChannel(channel) }
      try { localStorage.setItem('sush-settings', JSON.stringify(next)) } catch {}
      return next
    })
  }, [setSettings])

  const placement = terminalPlacement({
    channel: uiChannel,
    mode: currentShellMode,
    view,
    activeTab: tabs.length ? activeTab : null,
    drawerOpen,
    officeFocus
  })

  // Leaving the Office, or closing that session, ends the zoom.
  useEffect(() => {
    if (!officeFocus) return
    if (currentShellMode !== 'office' || !tabs.some(t => t.id === officeFocus)) setOfficeFocus(null)
  }, [officeFocus, currentShellMode, tabs])

  const threadInCenter = nightlyShell && view === 'terminal' && currentShellMode === 'thread' && threadCentered(activeTab)
  const coverSurface = nightlyShell && view !== 'overview' && (currentShellMode === 'chat' || currentShellMode === 'office')
    ? currentShellMode : null

  // Alt+1..5 switch modes, Ctrl+` toggles the drawer (Nightly only; the
  // chords are claimed from xterm so they reach the app).
  useEffect(() => { setShellChords(nightlyShell) }, [nightlyShell])
  useEffect(() => {
    if (!nightlyShell) return undefined
    const handler = (e) => {
      if (!canHandleGlobalShortcut(shortcutsReady, blockingShortcutSurface)) return
      const mode = modeFromShortcut(e)
      if (mode) { e.preventDefault(); setShellMode(mode); return }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === '`') { e.preventDefault(); toggleDrawer() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [nightlyShell, shortcutsReady, blockingShortcutSurface, setShellMode, toggleDrawer])

  const startDrawerDrag = useCallback((e) => {
    e.preventDefault()
    const startY = e.clientY
    const start = drawerHeight
    const move = (ev) => setDrawerHeight(Math.max(140, Math.min(window.innerHeight * 0.7, start + (startY - ev.clientY))))
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [drawerHeight])

  return {
    uiChannel, nightlyShell, shellMode, currentShellMode, setShellMode, setUiChannel,
    drawerOpen, toggleDrawer, drawerHeight, startDrawerDrag,
    officeFocus, setOfficeFocus, placement, threadInCenter, coverSurface
  }
}
