import React, { useState, useCallback, useEffect, useRef } from 'react'
import Terminal from './components/Terminal'
import TitleBar from './components/TitleBar'
import ProfileManager, { useProfiles } from './components/ProfileManager'
import Settings from './components/Settings'
import SessionRail from './components/SessionRail'
import HomeDashboard from './components/HomeDashboard'
import SmartCommandBar from './components/SmartCommandBar'
import StatusBar from './components/StatusBar'
import NewSessionModal from './components/NewSessionModal'
import RightPanel from './components/RightPanel'
import SeduciaOrb from './components/SeduciaOrb'
import MissionControl from './components/MissionControl'
import PlansModal from './components/PlansModal'
import CommandPalette from './components/CommandPalette'
import ShortcutsHelp from './components/ShortcutsHelp'
import HandoffModal from './components/HandoffModal'
import SushrcEditor from './components/SushrcEditor'
import QuickSwitcher from './components/QuickSwitcher'
import SplashScreen from './components/SplashScreen'
import { themes, defaultTheme } from './themes'
import { agentById } from './lib/agents'
import { accentVars, glassVars, rgba } from './lib/ui'
import { loadPlan, savePlan } from './lib/plan'
import { useAgentActivity } from './hooks/useAgentActivity'
import JsonViewer from './components/JsonViewer'

const RECENT_SESSIONS_KEY = 'sush-recent-sessions'
const OLD_COMMAND_RECENTS_KEY = 'sush-recents'
const SESSION_LAYOUT_KEY = 'sush-session-layout'
const LAST_HOME_VIEW_KEY = 'sush-last-home-view'
const MAX_RECENT_SESSIONS = 8

let nextTabId = 1
let nextSessionTag = 1
let nextGroupId = 1

function profileShell(profile) {
  if (profile?.shell) return profile.shell
  if (profile?.prompt === 'cmd') return 'cmd'
  if (profile?.prompt === 'pwsh') return 'pwsh'
  return 'powershell'
}

function pathLabel(cwd) {
  if (!cwd) return null
  const trimmed = String(cwd).replace(/[\\/]+$/, '')
  return trimmed.split(/[\\/]/).filter(Boolean).pop() || trimmed
}

function normalizePathKey(cwd) {
  return String(cwd ?? '').replace(/[\\/]+$/, '').toLowerCase()
}

function tabKey(tab) {
  if (!tab) return 'none'
  const shell = tab.shell || 'powershell'
  const profileId = tab.profileId || 'powershell'
  const cwd = normalizePathKey(tab.cwd)
  if (!cwd) {
    const unique = tab.tag || tab.startedAt || tab.id
    return `${profileId}:${shell}:new:${unique}`
  }
  const base = `${profileId}:${shell}:${cwd}`
  // Tagged sessions (agent launches / explicit swarms) stay unique so identical
  // shells in the same directory are never collapsed by dedupe.
  return tab.tag ? `${base}:${tab.tag}` : base
}

function dedupeTabs(tabs) {
  const seen = new Set()
  return tabs.filter(tab => {
    const key = tabKey(tab)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function matchesWorkspace(tab, cwd, options = {}) {
  if (!cwd || normalizePathKey(tab.cwd) !== normalizePathKey(cwd)) return false
  if (options.shell && tab.shell !== options.shell) return false
  if (options.profileId && tab.profileId !== options.profileId) return false
  return true
}

function stripAnsi(value) {
  return String(value ?? '').replace(/\x1b\[[0-9;]*m/g, '')
}

function makeTab(profile, options = {}) {
  const cwd = options.cwd ?? null
  const shell = options.shell ?? profileShell(profile)
  const profileLabel = profile?.label ?? 'PowerShell'
  const now = Date.now()

  return {
    id: options.id ?? `tab-${nextTabId++}`,
    label: options.label ?? (cwd ? pathLabel(cwd) : profileLabel),
    profileId: profile?.id ?? options.profileId ?? 'powershell',
    profileLabel: options.profileLabel ?? profileLabel,
    shell,
    shellLabel: options.shellLabel ?? null,
    cwd,
    bootCommand: options.command ?? null,
    agentId: options.agentId ?? null,
    tag: options.tag ?? null,
    groupId: options.groupId ?? null,
    groupLabel: options.groupLabel ?? null,
    status: options.status ?? 'new',
    startedAt: options.startedAt ?? now,
    lastActiveAt: options.lastActiveAt ?? now
  }
}

function loadSettings() {
  try { return JSON.parse(localStorage.getItem('sush-settings') ?? '{}') } catch { return {} }
}

function normalizeRecentSession(item) {
  if (!item || typeof item !== 'object' || !item.cwd) return null
  return {
    cwd: String(item.cwd),
    label: item.label || pathLabel(item.cwd),
    profileId: item.profileId || 'powershell',
    profileLabel: item.profileLabel || 'PowerShell',
    shell: item.shell || 'powershell',
    shellLabel: item.shellLabel || null,
    updatedAt: Number(item.updatedAt) || Date.now()
  }
}

function loadRecentSessions() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_SESSIONS_KEY) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved.map(normalizeRecentSession).filter(Boolean).slice(0, MAX_RECENT_SESSIONS)
  } catch {
    return []
  }
}

// On restart the original PTY is gone, so a restored tab must re-launch its agent.
// For agents that support resume we use `resumeCommand` (e.g. `claude --continue`)
// so the previous conversation in that directory is picked up instead of starting
// fresh; otherwise we re-launch the normal command, or fall back to the persisted
// boot command. Plain shells (no agent / no command) stay bare.
function restoreBootCommand(item) {
  const agent = item.agentId && item.agentId !== 'shell' ? agentById(item.agentId) : null
  if (agent) return agent.resumeCommand ?? agent.command ?? item.bootCommand ?? null
  return item.bootCommand ?? null
}

function loadSessionLayout(profiles) {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_LAYOUT_KEY) ?? '{}')
    if (!Array.isArray(saved.tabs) || !saved.tabs.length) throw new Error('empty layout')

    // Honour the "resume agent sessions on launch" setting (default on).
    const resumeAgents = loadSettings().resumeAgents !== false

    const tabs = dedupeTabs(saved.tabs.slice(0, 12).map(item => {
      const profile = profiles.find(p => p.id === item.profileId) ?? profiles[0]
      return makeTab(profile, {
        label: item.label,
        profileId: item.profileId,
        profileLabel: item.profileLabel,
        shell: item.shell,
        shellLabel: item.shellLabel,
        cwd: item.cwd,
        command: resumeAgents ? restoreBootCommand(item) : null,
        agentId: item.agentId,
        tag: item.tag,
        groupId: item.groupId,
        groupLabel: item.groupLabel,
        status: 'new',
        startedAt: item.startedAt,
        lastActiveAt: item.lastActiveAt
      })
    }))
    return {
      tabs,
      activeId: tabs.find(tab => tabKey(tab) === saved.activeKey)?.id ?? tabs[0].id
    }
  } catch {
    const tab = makeTab(profiles[0])
    return { tabs: [tab], activeId: tab.id }
  }
}

export default function App() {
  const { profiles, addProfile, updateProfile, deleteProfile } = useProfiles()
  const initialLayout = useRef(loadSessionLayout(profiles))
  const [tabs, setTabs] = useState(initialLayout.current.tabs)
  const [activeId, setActiveId] = useState(initialLayout.current.activeId)
  const [view, setView] = useState('home')
  const [homeView, setHomeView] = useState(() => localStorage.getItem(LAST_HOME_VIEW_KEY) || 'dashboard')
  const [showProfiles, setShowProfiles] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showLauncher, setShowLauncher] = useState(false)
  const [showPlans, setShowPlans] = useState(false)
  const [planId, setPlanId] = useState(loadPlan)
  const [rightOpen, setRightOpen] = useState(() => localStorage.getItem('sush-right-open') === '1')
  const [seduciaOpen, setSeduciaOpen] = useState(false)
  const [rightTab, setRightTab] = useState(() => localStorage.getItem('sush-right-tab') || 'agent')
  const [settings, setSettings] = useState(loadSettings)
  const [recentSessions, setRecentSessions] = useState(loadRecentSessions)
  const [smartBusy, setSmartBusy] = useState(false)
  const [smartResult, setSmartResult] = useState(null)
  const [zenMode, setZenMode] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showMission, setShowMission] = useState(false)
  const [commandHistory, setCommandHistory] = useState([])
  const [broadcastMode, setBroadcastMode] = useState(false)
  const [splitMode, setSplitMode] = useState(false)
  const [splitTabId, setSplitTabId] = useState(null)
  const [splitRatio, setSplitRatio] = useState(0.5)   // left-pane fraction (0.2–0.8)
  const [focusedPane, setFocusedPane] = useState('left')  // 'left' | 'right'
  const [rightWidth, setRightWidth] = useState(() => parseInt(localStorage.getItem('sush-right-width') || '360', 10))
  const [renamingId, setRenamingId] = useState(null)
  const [handoffSource, setHandoffSource] = useState(null)
  const [showSushrc, setShowSushrc] = useState(false)
  const [switcher, setSwitcher] = useState(null)  // { order:[ids], index } when open
  const [splash, setSplash] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [zoomIndicator, setZoomIndicator] = useState(null)  // transient font-size overlay
  const smartDismissRef = useRef(null)
  const pendingPtyRef = useRef(new Map())
  const tabsRef = useRef(tabs)
  const activeIdRef = useRef(activeId)
  const closeTabRef = useRef(null)
  const rightDragRef = useRef(null)
  const mruRef = useRef([])          // tab ids, most-recently-active first
  const switcherRef = useRef(null)
  const lastClosedRef = useRef([])   // stack of recently closed sessions (for reopen)
  const splitContainerRef = useRef(null)  // the split flex row, for divider drag math

  useEffect(() => { tabsRef.current = tabs }, [tabs])
  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { switcherRef.current = switcher }, [switcher])
  useEffect(() => { requestAnimationFrame(() => setMounted(true)) }, [])

  // Maintain a most-recently-used order of session ids for the Ctrl+Tab switcher.
  useEffect(() => {
    if (!activeId) return
    mruRef.current = [activeId, ...mruRef.current.filter(id => id !== activeId)]
  }, [activeId])

  // Drop closed tabs out of the MRU list.
  useEffect(() => {
    const live = new Set(tabs.map(t => t.id))
    mruRef.current = mruRef.current.filter(id => live.has(id))
  }, [tabs])

  // Apply the corner-style design token to the whole UI.
  useEffect(() => {
    document.body.dataset.corners = settings.cornerStyle ?? 'rounded'
  }, [settings.cornerStyle])

  useEffect(() => {
    const compactTabs = dedupeTabs(tabs)
    if (compactTabs.length === tabs.length) return

    const keptIds = new Set(compactTabs.map(tab => tab.id))
    tabs
      .filter(tab => !keptIds.has(tab.id))
      .forEach(tab => window.sush.closeTab({ tabId: tab.id }))

    setTabs(compactTabs)
    if (!keptIds.has(activeId)) setActiveId(compactTabs[0]?.id)
  }, [activeId, tabs])

  const saveSettings = (next) => {
    setSettings(next)
    localStorage.setItem('sush-settings', JSON.stringify(next))
  }

  const rememberSession = useCallback((session) => {
    if (!session?.cwd) return

    const record = normalizeRecentSession({
      cwd: session.cwd,
      label: pathLabel(session.cwd),
      profileId: session.profileId,
      profileLabel: session.profileLabel,
      shell: session.shell,
      shellLabel: session.shellLabel,
      updatedAt: Date.now()
    })
    if (!record) return

    setRecentSessions(prev => {
      const next = [
        record,
        ...prev.filter(item => !(
          item.cwd === record.cwd &&
          item.profileId === record.profileId &&
          item.shell === record.shell
        ))
      ].slice(0, MAX_RECENT_SESSIONS)

      localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(next))
      localStorage.removeItem(OLD_COMMAND_RECENTS_KEY)
      return next
    })
  }, [])

  const activeTab = tabs.find(t => t.id === activeId) ?? tabs[0] ?? { id: '', label: 'Shell', profileId: 'powershell' }
  const activeProfile = profiles.find(p => p.id === activeTab?.profileId) ?? profiles[0]
  const runningSessionCount = tabs.filter(t => t.status === 'running').length

  // Mission Control: live per-session state inferred from the PTY stream.
  const { states: agentStates, summary: agentSummary } = useAgentActivity(tabs)

  // Auto-dismiss smart result after 8 seconds of inactivity.
  useEffect(() => {
    if (!smartResult) return
    clearTimeout(smartDismissRef.current)
    smartDismissRef.current = setTimeout(() => setSmartResult(null), 8000)
    return () => clearTimeout(smartDismissRef.current)
  }, [smartResult])

  const themeId = settings.themeId ?? activeProfile?.themeId ?? 'pink'
  const theme = themes[themeId] ?? defaultTheme
  const accent = theme.ui.accent
  const fontSize = settings.fontSize ?? 14
  const fontFamily = settings.fontFamily ?? "'Cascadia Code'"
  const cursorStyle = settings.cursorStyle ?? 'block'

  useEffect(() => {
    const handler = (e) => {
      if (!e.ctrlKey) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        const next = Math.min((settings.fontSize ?? 14) + 1, 28)
        saveSettings({ ...settings, fontSize: next })
        setZoomIndicator(next); clearTimeout(window.__zoomTimer); window.__zoomTimer = setTimeout(() => setZoomIndicator(null), 1200)
      }
      if (e.key === '-') {
        e.preventDefault()
        const next = Math.max((settings.fontSize ?? 14) - 1, 8)
        saveSettings({ ...settings, fontSize: next })
        setZoomIndicator(next); clearTimeout(window.__zoomTimer); window.__zoomTimer = setTimeout(() => setZoomIndicator(null), 1200)
      }
      if (e.key === '0') {
        e.preventDefault()
        saveSettings({ ...settings, fontSize: 14 })
        setZoomIndicator(14); clearTimeout(window.__zoomTimer); window.__zoomTimer = setTimeout(() => setZoomIndicator(null), 1200)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [settings])

  const openRight = useCallback((tab) => {
    setRightTab(tab)
    setRightOpen(true)
  }, [])

  // Esc closes Mission Control (the board has no focused input to catch it).
  useEffect(() => {
    if (!showMission) return
    const onEsc = (e) => { if (e.key === 'Escape') { e.preventDefault(); setShowMission(false) } }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [showMission])

  useEffect(() => {
    const handler = (e) => {
      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      // Ctrl/Cmd+K → summon Seducia. Ctrl/Cmd+B → toggle panel.
      // (Guard with !shift so Ctrl+Shift+B doesn't also fire the panel toggle.)
      if (ctrl && key === 'k' && !e.shiftKey) { e.preventDefault(); setSeduciaOpen(prev => !prev) }
      if (ctrl && key === 'b' && !e.shiftKey) { e.preventDefault(); setRightOpen(prev => !prev) }
      // Ctrl+P → command palette
      if (ctrl && key === 'p' && !e.shiftKey) { e.preventDefault(); setShowPalette(prev => !prev) }
      // Ctrl+? or Ctrl+Shift+/ → shortcuts
      if (ctrl && (key === '?' || (e.shiftKey && key === '/'))) { e.preventDefault(); setShowShortcuts(prev => !prev) }
      // Ctrl+Shift+Z → zen mode
      if (ctrl && e.shiftKey && key === 'z') { e.preventDefault(); setZenMode(prev => !prev) }
      // Ctrl+Shift+H → split pane
      if (ctrl && e.shiftKey && key === 'h') {
        e.preventDefault()
        setSplitMode(prev => {
          if (!prev) {
            const others = tabsRef.current.filter(t => t.id !== activeIdRef.current)
            if (others.length) setSplitTabId(others[0].id)
            setFocusedPane('left')
          }
          return !prev
        })
      }
      // Ctrl+Shift+B → broadcast mode
      if (ctrl && e.shiftKey && key === 'b') { e.preventDefault(); setBroadcastMode(prev => !prev) }
      // Ctrl+Shift+M → Mission Control (Ctrl+M alone is Enter in a terminal)
      if (ctrl && e.shiftKey && key === 'm') { e.preventDefault(); setShowMission(prev => !prev) }
      // Ctrl+Shift+D → duplicate active tab
      if (ctrl && e.shiftKey && key === 'd') { e.preventDefault(); if (activeIdRef.current) duplicateTab(activeIdRef.current) }
      // Ctrl+T → new tab (Shift variant = reopen-closed, handled separately)
      if (ctrl && key === 't' && !e.shiftKey) { e.preventDefault(); openTab(profiles[0]) }
      // Ctrl+W → close active tab
      if (ctrl && key === 'w' && !e.shiftKey) { e.preventDefault(); if (activeIdRef.current) closeTabRef.current?.(activeIdRef.current) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [rightTab, profiles])

  // F2 → rename active session. Ctrl+Tab → MRU quick switcher (hold Ctrl, tap Tab).
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'F2') {
        e.preventDefault()
        if (activeIdRef.current) { setView('terminal'); setRenamingId(activeIdRef.current) }
        return
      }
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        const order = mruRef.current.length >= 2 ? [...mruRef.current] : tabsRef.current.map(t => t.id)
        if (order.length < 2) return
        setSwitcher(prev => {
          if (!prev) return { order, index: e.shiftKey ? order.length - 1 : 1 }
          const len = prev.order.length
          const delta = e.shiftKey ? -1 : 1
          return { ...prev, index: ((prev.index + delta) % len + len) % len }
        })
      }
    }
    const onKeyUp = (e) => {
      if ((e.key === 'Control' || e.key === 'Meta') && switcherRef.current) {
        const s = switcherRef.current
        const id = s.order[s.index]
        setSwitcher(null)
        if (id) { setActiveId(id); setView('terminal') }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  }, [])

  useEffect(() => { localStorage.setItem('sush-right-open', rightOpen ? '1' : '0') }, [rightOpen])
  useEffect(() => { localStorage.setItem('sush-right-tab', rightTab) }, [rightTab])
  useEffect(() => { localStorage.setItem('sush-right-width', String(rightWidth)) }, [rightWidth])

  const startRightDrag = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = rightWidth
    const onMove = (ev) => {
      const delta = startX - ev.clientX
      setRightWidth(Math.max(280, Math.min(700, startWidth + delta)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [rightWidth])

  // Drag the split divider to re-balance the two panes.
  const startSplitDrag = useCallback((e) => {
    e.preventDefault()
    const container = splitContainerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const onMove = (ev) => {
      const ratio = (ev.clientX - rect.left) / rect.width
      setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // Alt+Left / Alt+Right moves keyboard focus between split panes.
  useEffect(() => {
    if (!splitMode) return
    const handler = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); setFocusedPane('left') }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setFocusedPane('right') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [splitMode])

  useEffect(() => {
    const compactTabs = dedupeTabs(tabs)
    localStorage.setItem(SESSION_LAYOUT_KEY, JSON.stringify({
      activeKey: tabKey(tabs.find(tab => tab.id === activeId) ?? compactTabs[0]),
      tabs: compactTabs.map(tab => ({
        label: tab.label,
        profileId: tab.profileId,
        profileLabel: tab.profileLabel,
        shell: tab.shell,
        shellLabel: tab.shellLabel,
        cwd: tab.cwd,
        bootCommand: tab.bootCommand,
        agentId: tab.agentId,
        tag: tab.tag,
        groupId: tab.groupId,
        groupLabel: tab.groupLabel,
        startedAt: tab.startedAt,
        lastActiveAt: tab.lastActiveAt
      }))
    }))
  }, [activeId, tabs])

  useEffect(() => {
    localStorage.setItem(LAST_HOME_VIEW_KEY, homeView)
  }, [homeView])

  useEffect(() => {
    const current = tabs.find(t => t.id === activeId)
    if (current?.cwd) rememberSession(current)
  }, [activeId, rememberSession, tabs])

  const selectTab = useCallback((id) => {
    setActiveId(id)
    setView('terminal')
  }, [])

  const openTab = useCallback((profile, options = {}) => {
    const prof = profile ?? profiles[0]
    // Tagged launches (agents / explicit swarms) always open a fresh session.
    if (options.cwd && !options.tag) {
      const existing = tabsRef.current.find(tab => matchesWorkspace(tab, options.cwd, {
        profileId: options.profileId ?? prof.id,
        shell: options.shell
      }))
      if (existing) {
        setActiveId(existing.id)
        setView('terminal')
        return existing
      }
    }

    const tab = makeTab(prof, options)
    setTabs(prev => [...prev, tab])
    setActiveId(tab.id)
    setView('terminal')
    if (tab.cwd) rememberSession(tab)
    window.sush.newTab({ tabId: tab.id, cwd: tab.cwd }).catch((error) => {
      console.error('Failed to initialize tab context', error)
    })
    return tab
  }, [profiles, rememberSession])

  const launchSessions = useCallback(({ cwd, agents, groupLabel }) => {
    const prof = profiles[0]
    const targetCwd = cwd || null
    const total = agents.reduce((sum, agent) => sum + Math.max(1, agent.count || 1), 0)
    // A launch of two or more sessions becomes a group (a "workspace").
    const grouped = total >= 2
    const groupId = grouped ? `grp-${nextGroupId++}` : null
    const label = grouped
      ? (groupLabel || `${targetCwd ? pathLabel(targetCwd) : 'Swarm'} · ${total}`)
      : null

    agents.forEach(agent => {
      const count = Math.max(1, agent.count || 1)
      for (let i = 0; i < count; i++) {
        const base = agent.id === 'shell'
          ? (targetCwd ? pathLabel(targetCwd) : prof?.label ?? 'Shell')
          : agent.label
        openTab(prof, {
          cwd: targetCwd,
          command: agent.command || undefined,
          agentId: agent.id,
          tag: `sess-${nextSessionTag++}`,
          groupId,
          groupLabel: label,
          label: count > 1 ? `${base} ${i + 1}` : base
        })
      }
    })
    setShowLauncher(false)
    // Seducia stays open so you can keep orchestrating after a launch.
  }, [openTab, profiles])

  // Seducia awareness: which live sessions match a target ('all' or an agent id).
  const liveTargets = useCallback((target) => {
    return tabsRef.current.filter(tab =>
      tab.status !== 'exited' && (target === 'all' || (tab.agentId || 'shell') === target)
    )
  }, [])

  // Seducia "tell claude ..." -- type a prompt into every matching live agent.
  const sendAgentPrompt = useCallback(({ target, text }) => {
    const body = String(text ?? '').trim()
    if (!body) return
    const matches = liveTargets(target)
    if (!matches.length) return
    matches.forEach(tab => {
      if (tab.status === 'running') {
        window.sush.ptyInput({ tabId: tab.id, data: `${body}\r` })
      } else {
        // Not booted yet -- queue so it fires when the shell signals ready.
        pendingPtyRef.current.set(tab.id, body)
      }
    })
    // Jump to the (first) agent we just prompted so you see the reply.
    setActiveId(matches[0].id)
    setView('terminal')
  }, [liveTargets])

  // Seducia "focus codex" -- bring the matching live agent to the foreground.
  const focusAgent = useCallback((target) => {
    const match = liveTargets(target)[0]
    if (!match) return
    setActiveId(match.id)
    setView('terminal')
  }, [liveTargets])

  // Mission Control: send raw input to one specific session (e.g. answering a
  // blocked agent with "y" + Enter). Queues if the PTY hasn't booted yet.
  const promptSession = useCallback((tabId, data) => {
    const tab = tabsRef.current.find(t => t.id === tabId)
    if (!tab) return
    if (tab.status === 'running') window.sush.ptyInput({ tabId, data })
    else pendingPtyRef.current.set(tabId, String(data).replace(/\r$/, ''))
  }, [])

  const closeGroup = useCallback((groupId) => {
    if (!groupId) return
    const ids = tabsRef.current.filter(tab => tab.groupId === groupId).map(tab => tab.id)
    ids.forEach(id => closeTabRef.current?.(id))
  }, [])

  const reorderTabs = useCallback((from, to) => {
    setTabs(prev => {
      const fromIdx = prev.findIndex(t => t.id === from)
      const toIdx = prev.findIndex(t => t.id === to)
      if (fromIdx < 0 || toIdx < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }, [])

  const closeTab = useCallback((id) => {
    const closing = tabsRef.current.find(t => t.id === id)
    if (closing?.cwd) rememberSession(closing)
    // Remember enough to reopen this session with Ctrl+Shift+T.
    if (closing) {
      lastClosedRef.current.push({
        cwd: closing.cwd,
        profileId: closing.profileId,
        shell: closing.shell,
        shellLabel: closing.shellLabel,
        label: closing.label
      })
      if (lastClosedRef.current.length > 10) lastClosedRef.current.shift()
    }

    // Use the ref instead of the closed-over activeId so rapid closes (e.g.
    // closeGroup) always read the most recent value, not a stale snapshot.
    const wasActive = id === activeIdRef.current

    window.sush.closeTab({ tabId: id })
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      if (!next.length) {
        // Last session closed: don't eagerly spawn a replacement terminal.
        // Leave the workspace empty and let the user re-open from Home.
        setActiveId(null)
        return next
      }
      // Keep a sensible session selected for when the user returns, but we drop
      // to Home below rather than throwing them into it.
      if (wasActive) setActiveId(next[next.length - 1].id)
      return next
    })

    // Closing the active session (or the last one) returns to the Home screen
    // instead of auto-opening / switching into another terminal.
    if (wasActive) { setHomeView('dashboard'); setView('home') }
  }, [rememberSession])

  useEffect(() => {
    closeTabRef.current = closeTab
  }, [closeTab])

  const handleSessionState = useCallback((tabId, state) => {
    setTabs(prev => prev.map(tab => {
      if (tab.id !== tabId) return tab
      const cwd = state.cwd ?? tab.cwd
      const shell = state.shellId ?? tab.shell
      const shellLabel = state.shellLabel ?? tab.shellLabel
      const oldPathLabel = pathLabel(tab.cwd)
      const shouldRename = cwd && (!tab.cwd || tab.label === tab.profileLabel || tab.label === oldPathLabel)

      return {
        ...tab,
        cwd,
        shell,
        shellLabel,
        status: state.status ?? tab.status,
        label: state.label && shouldRename ? state.label : shouldRename ? pathLabel(cwd) : tab.label,
        lastActiveAt: state.lastActiveAt ?? Date.now()
      }
    }))
  }, [])

  const flushPendingPty = useCallback((tabId) => {
    const input = pendingPtyRef.current.get(tabId)
    if (!input) return
    pendingPtyRef.current.delete(tabId)
    window.sush.ptyInput({ tabId, data: `${input}\r` })
  }, [])

  const handleTerminalReady = useCallback((tabId, state) => {
    handleSessionState(tabId, state)
    flushPendingPty(tabId)
  }, [flushPendingPty, handleSessionState])

  const findOrOpenCwd = useCallback((cwd, options = {}) => {
    const matches = tabsRef.current.filter(tab => matchesWorkspace(tab, cwd, options))
    if (matches.length) {
      const existing = matches[0]
      const duplicates = matches.slice(1)
      if (duplicates.length) {
        duplicates.forEach(tab => window.sush.closeTab({ tabId: tab.id }))
        setTabs(prev => prev.filter(tab => !duplicates.some(duplicate => duplicate.id === tab.id)))
      }
      setActiveId(existing.id)
      setView('terminal')
      return existing
    }
    const prof = profiles.find(p => p.id === options.profileId) ?? profiles[0]
    return openTab(prof, { ...options, cwd, label: options.label ?? pathLabel(cwd) })
  }, [openTab, profiles])

  const openRecentSession = useCallback((session) => {
    return findOrOpenCwd(session.cwd, {
      label: session.label,
      profileId: session.profileId,
      shell: session.shell,
      shellLabel: session.shellLabel
    })
  }, [findOrOpenCwd])

  // Reopen the most recently closed session (Ctrl+Shift+T).
  const reopenLastClosed = useCallback(() => {
    const last = lastClosedRef.current.pop()
    if (!last) { openTab(profiles[0]); return }
    if (last.cwd) {
      findOrOpenCwd(last.cwd, { label: last.label, profileId: last.profileId, shell: last.shell, shellLabel: last.shellLabel })
    } else {
      const prof = profiles.find(p => p.id === last.profileId) ?? profiles[0]
      openTab(prof, { shell: last.shell, label: last.label })
    }
  }, [findOrOpenCwd, openTab, profiles])

  const queuePtyCommand = useCallback((input, cwd) => {
    const target = cwd ? findOrOpenCwd(cwd) : (tabsRef.current.find(tab => tab.id === activeId) ?? tabsRef.current[0])
    if (!target) return
    setActiveId(target.id)
    setView('terminal')
    const current = tabsRef.current.find(tab => tab.id === target.id)
    if (current?.status === 'running') {
      window.sush.ptyInput({ tabId: target.id, data: `${input}\r` })
      return
    }
    pendingPtyRef.current.set(target.id, input)
  }, [activeId, findOrOpenCwd])

  const renameTab = useCallback((id, label) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, label } : t))
  }, [])

  const duplicateTab = useCallback((id) => {
    const tab = tabsRef.current.find(t => t.id === id)
    if (!tab) return
    const prof = profiles.find(p => p.id === tab.profileId) ?? profiles[0]
    openTab(prof, { cwd: tab.cwd, shell: tab.shell, label: `${tab.label} (copy)`, tag: `copy-${Date.now()}` })
  }, [profiles, openTab])

  // Gather a portable context card for a session: cwd, branch, recent commands,
  // and a tail of its output. Used by the handoff flow.
  const buildHandoffCard = useCallback(async (sourceId) => {
    const tab = tabsRef.current.find(t => t.id === sourceId)
    if (!tab) return null
    let branch = null, dirty = 0
    if (tab.cwd) {
      try {
        const g = await window.sush.gitStatus({ cwd: tab.cwd })
        if (g?.repo) { branch = g.branch; dirty = (g.files || []).length }
      } catch {}
    }
    let scroll = ''
    try { scroll = (await window.sush.getScrollback({ tabId: sourceId, chars: 1800 }))?.text || '' } catch {}
    return { tab, branch, dirty, scroll, recent: commandHistory.slice(-6) }
  }, [commandHistory])

  // Deliver a handoff: copy the full card to the clipboard (rich paste) and paste
  // a single safe line at the target session's prompt for the user to review/submit.
  const performHandoff = useCallback(({ targetId, fullText, injectText, openNew, sourceCwd }) => {
    window.sush.copyText(String(fullText || '')).catch(() => {})
    const oneLine = String(injectText || '').replace(/\r?\n+/g, ' | ').trim()
    if (openNew) {
      const target = openTab(profiles[0], { cwd: sourceCwd || null, label: 'handoff', tag: `handoff-${Date.now()}` })
      if (oneLine) setTimeout(() => window.sush.ptyInput({ tabId: target.id, data: oneLine }), 1200)
    } else {
      const target = tabsRef.current.find(t => t.id === targetId)
      if (target) {
        setActiveId(target.id)
        setView('terminal')
        if (oneLine) window.sush.ptyInput({ tabId: target.id, data: oneLine })
      }
    }
    setHandoffSource(null)
  }, [openTab, profiles])

  const cycleCorners = useCallback(() => {
    const order = ['rounded', 'sharp', 'pill']
    const cur = settings.cornerStyle ?? 'rounded'
    saveSettings({ ...settings, cornerStyle: order[(order.indexOf(cur) + 1) % order.length] })
  }, [settings])

  const applySmartAction = useCallback((action, result) => {
    if (!action) return
    if (action.name === 'open-home') {
      setSmartResult(null)
      setHomeView('dashboard')
      setView('home')
    } else if (action.name === 'show-recents') {
      setHomeView('recent')
      setView('home')
      const output = recentSessions.length
        ? recentSessions.map((item, idx) => `${idx + 1}. ${item.label}  ${item.cwd}`).join('\r\n')
        : 'No recent sessions'
      setSmartResult(prev => ({ ...(prev ?? result), output }))
    } else if (action.name === 'open-workspace') {
      setSmartResult(null)
      findOrOpenCwd(action.cwd, { label: action.label })
    } else if (action.name === 'passthrough') {
      setSmartResult(null)
      queuePtyCommand(action.input, action.cwd)
    } else if (action.name === 'open-seducia') {
      setRightTab('agent')
      setRightOpen(true)
    } else if (action.name === 'toggle-zen') {
      setZenMode(prev => !prev)
    } else if (action.name === 'open-palette') {
      setShowPalette(true)
    } else if (action.name === 'open-shortcuts') {
      setShowShortcuts(true)
    } else if (action.name === 'reload-app') {
      window.location.reload()
    } else if (action.name === 'duplicate-tab') {
      const active = tabsRef.current.find(t => t.id === activeIdRef.current)
      if (active) duplicateTab(active.id)
    } else if (action.name === 'open-sushrc') {
      setSmartResult(null)
      setShowSushrc(true)
    } else if (action.name === 'handoff') {
      setSmartResult(null)
      if (activeIdRef.current) setHandoffSource(activeIdRef.current)
    } else if (action.name === 'corners') {
      cycleCorners()
    }
  }, [findOrOpenCwd, queuePtyCommand, recentSessions, duplicateTab, cycleCorners])

  const runSmartInput = useCallback(async (input) => {
    const command = input.trim()
    if (!command) return
    setSmartBusy(true)
    try {
      const target = tabsRef.current.find(tab => tab.id === activeId) ?? tabsRef.current[0]
      const result = await window.sush.runSmartInput({ tabId: target?.id, input: command })
      const nextResult = { input: command, type: result?.type ?? 'success', output: result?.output ?? '', action: result?.action }
      setSmartResult(nextResult)
      applySmartAction(result?.action, nextResult)
    } catch (error) {
      setSmartResult({ input: command, type: 'error', output: error.message })
    } finally {
      setSmartBusy(false)
    }
  }, [activeId, applySmartAction])

  const visibleSmartOutput = view === 'terminal' && smartResult?.output && smartResult.type !== 'passthrough'

  const handlePaletteAction = useCallback((action) => {
    if (action === 'new-session') setShowLauncher(true)
    else if (action === 'open-seducia') { setSeduciaOpen(true) }
    else if (action === 'settings') setShowSettings(true)
    else if (action === 'plans') setShowPlans(true)
    else if (action === 'toggle-panel') setRightOpen(prev => !prev)
    else if (action === 'zen') setZenMode(prev => !prev)
    else if (action === 'mission') setShowMission(true)
    else if (action === 'shortcuts') setShowShortcuts(true)
    else if (action === 'home') { setHomeView('dashboard'); setView('home') }
    else if (action === 'handoff') { if (activeIdRef.current) setHandoffSource(activeIdRef.current) }
    else if (action === 'rename') { if (activeIdRef.current) { setView('terminal'); setRenamingId(activeIdRef.current) } }
    else if (action === 'corners') cycleCorners()
    else if (action === 'sushrc') setShowSushrc(true)
    else if (action === 'broadcast') setBroadcastMode(prev => !prev)
    else if (action === 'split') {
      setSplitMode(prev => {
        if (!prev) {
          const others = tabsRef.current.filter(t => t.id !== activeIdRef.current)
          if (others.length) setSplitTabId(others[0].id)
          setFocusedPane('left')
        }
        return !prev
      })
    }
    else if (action?.startsWith?.('session:')) {
      const id = action.slice('session:'.length)
      setActiveId(id); setView('terminal')
    }
    else if (action?.startsWith?.('theme:')) {
      const id = action.slice('theme:'.length)
      saveSettings({ ...settings, themeId: id })
    }
    else if (action?.startsWith?.('recent:')) {
      const cwd = action.slice('recent:'.length)
      const s = recentSessions.find(r => r.cwd === cwd)
      if (s) openRecentSession(s)
    }
  }, [cycleCorners, settings, recentSessions, openRecentSession])

  // Dynamic palette entries: new actions + a jump-to-session for every open tab.
  const paletteActions = useCallback(() => {
    const base = [
      { id: 'act-mission', label: 'Mission Control', description: 'Live board of every agent session (Ctrl+Shift+M)', icon: 'activity', action: 'mission' },
      { id: 'act-handoff', label: 'Hand Off Session', description: 'Pass this session\'s context to another (Ctrl+P)', icon: 'send', action: 'handoff' },
      { id: 'act-rename', label: 'Rename Session', description: 'Rename the active session (F2)', icon: 'edit', action: 'rename' },
      { id: 'act-corners', label: 'Cycle Corner Style', description: 'Sharp → Rounded → Pill', icon: 'layout', action: 'corners' },
      { id: 'act-sushrc', label: 'Edit .sushrc Profile', description: 'Your shell-agnostic Sush profile', icon: 'fileText', action: 'sushrc' },
    ]
    base.push(
      { id: 'act-split', label: 'Toggle Split Pane', description: 'Side-by-side terminals (Ctrl+Shift+H)', icon: 'layout', action: 'split' },
      { id: 'act-broadcast', label: 'Toggle Broadcast', description: 'Type into all sessions at once (Ctrl+Shift+B)', icon: 'terminal', action: 'broadcast' },
    )
    const sessions = tabs.map(t => ({
      id: `sess-${t.id}`,
      label: `Go to: ${t.label}`,
      description: t.cwd || t.profileLabel || t.shell,
      icon: 'terminal',
      action: `session:${t.id}`
    }))
    const themeEntries = Object.values(themes).map(th => ({
      id: `theme-${th.id}`,
      label: `Theme: ${th.label}`,
      description: th.id === themeId ? 'Active theme' : 'Switch color theme',
      icon: 'layout',
      action: `theme:${th.id}`
    }))
    const recents = recentSessions.map(r => ({
      id: `recent-${r.cwd}`,
      label: `Recent: ${r.label}`,
      description: r.cwd,
      icon: 'folder',
      action: `recent:${r.cwd}`
    }))
    return [...base, ...sessions, ...recents, ...themeEntries]
  }, [tabs, themeId, recentSessions])

  // Power-user session shortcuts (v3.1):
  //   Ctrl+1..8  jump to session N      Ctrl+9            jump to last session
  //   Ctrl+PageDown / PageUp  next / previous session (sequential)
  //   Ctrl+,     open Settings          Ctrl+Shift+N      new session launcher
  //   Ctrl+Shift+T  reopen last closed  Ctrl+Shift+Home   go to Home screen
  useEffect(() => {
    const handler = (e) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      const list = tabsRef.current

      // Ctrl+1..9 → jump to session (9 = last). Plain Ctrl+digit only.
      if (!e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        const n = Number(e.key)
        const target = n === 9 ? list[list.length - 1] : list[n - 1]
        if (target) { e.preventDefault(); selectTab(target.id) }
        return
      }

      if (e.key === ',') { e.preventDefault(); setShowSettings(true); return }

      if (e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); setShowLauncher(true); return }

      if (e.shiftKey && e.key.toLowerCase() === 't') { e.preventDefault(); reopenLastClosed(); return }

      if (e.key === 'PageDown' || e.key === 'PageUp') {
        if (list.length < 2) return
        e.preventDefault()
        const idx = list.findIndex(t => t.id === activeIdRef.current)
        const base = idx < 0 ? 0 : idx
        const delta = e.key === 'PageDown' ? 1 : -1
        const next = list[(base + delta + list.length) % list.length]
        if (next) selectTab(next.id)
        return
      }

      if (e.shiftKey && e.key === 'Home') { e.preventDefault(); setHomeView('dashboard'); setView('home') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectTab, reopenLastClosed])

  return (
    <div className={`flex flex-col h-screen${theme.ui.glass ? ' sush-glass-ui' : ''}`} style={{ ...accentVars(accent), ...(theme.ui.glass ? glassVars(theme.ui) : {}), background: theme.xterm.background, opacity: (settings.opacity ?? 100) / 100 }}>
      {!zenMode && (
        <TitleBar
          accent={accent}
          onSettings={() => setShowSettings(true)}
          sessionCount={runningSessionCount}
          themeId={themeId}
          onThemeChange={(id) => saveSettings({ ...settings, themeId: id })}
        />
      )}

      <div className="flex flex-1 min-h-0">
        {!zenMode && (
        <div data-glass className={!mounted ? 'sush-slide-right' : undefined} style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <SessionRail
          tabs={tabs}
          activeId={activeId}
          view={view}
          accent={accent}
          profiles={profiles}
          onHome={() => { setHomeView('dashboard'); setView('home') }}
          onSelect={selectTab}
          onNew={({ profile }) => openTab(profile)}
          onNewSession={() => setShowLauncher(true)}
          onClose={closeTab}
          onCloseGroup={closeGroup}
          onReorder={reorderTabs}
          onProfiles={() => setShowProfiles(true)}
          onRename={renameTab}
          onDuplicate={duplicateTab}
          renamingId={renamingId}
          onRenameStart={setRenamingId}
          onRenameEnd={() => setRenamingId(null)}
          onHandoff={(id) => setHandoffSource(id)}
        />
        </div>
        )}

        <div className="flex flex-col flex-1 min-w-0">
          {!zenMode && (
          <div data-glass className={!mounted ? 'sush-slide-down' : undefined}>
          <SmartCommandBar
            activeTab={activeTab}
            accent={accent}
            onRun={runSmartInput}
            onSeducia={() => setSeduciaOpen(true)}
            onTogglePanel={() => setRightOpen(prev => !prev)}
            rightOpen={rightOpen}
            busy={smartBusy}
            broadcastMode={broadcastMode}
            onToggleBroadcast={() => setBroadcastMode(prev => !prev)}
            splitMode={splitMode}
            onToggleSplit={() => {
              setSplitMode(prev => {
                if (!prev) {
                  const others = tabsRef.current.filter(t => t.id !== activeIdRef.current)
                  if (others.length) setSplitTabId(others[0].id)
                  setFocusedPane('left')
                }
                return !prev
              })
            }}
            settings={settings}
          />
          </div>
          )}

          <div className="flex-1 relative overflow-hidden">
            {splitMode ? (
              <div ref={splitContainerRef} style={{ display: 'flex', height: '100%' }}>
                <div
                  onMouseDown={() => setFocusedPane('left')}
                  style={{
                    flex: `${splitRatio} 1 0%`, position: 'relative', overflow: 'hidden',
                    filter: focusedPane === 'left' ? 'none' : 'grayscale(0.35) brightness(0.62)',
                    opacity: focusedPane === 'left' ? 1 : 0.62,
                    transition: 'opacity .15s ease, filter .15s ease'
                  }}
                >
                  {tabs.filter(tab => tab.id === activeId).map(tab => {
                    const baseProfile = profiles.find(p => p.id === tab.profileId) ?? profiles[0]
                    const prof = { ...baseProfile, shell: tab.shell ?? profileShell(baseProfile) }
                    const t = themes[settings.themeId ?? prof?.themeId] ?? defaultTheme
                    return (
                      <Terminal key={tab.id} tabId={tab.id} theme={t} profile={prof} active={focusedPane === 'left'} splitVisible
                        initialCwd={tab.cwd} fontSize={fontSize} fontFamily={fontFamily} cursorStyle={cursorStyle}
                        bootCommand={tab.bootCommand}
                        broadcastTabIds={broadcastMode ? tabs.map(t => t.id) : null}
                        restoreKey={tab.cwd ? tabKey(tab) : null}
                        persistScrollback={settings.persistScrollback !== false}
                        onSessionState={(state) => handleSessionState(tab.id, state)}
                        onReady={(state) => handleTerminalReady(tab.id, state)}
                        onNewTab={() => openTab(prof, { cwd: tab.cwd, shell: tab.shell })}
                        onCommand={(cmd) => { if (cmd) setCommandHistory(prev => prev.includes(cmd) ? prev : [...prev.slice(-499), cmd]) }}
                      />
                    )
                  })}
                  {focusedPane === 'left' && (
                    <div style={{ position: 'absolute', inset: 0, border: `2px solid ${rgba(accent, 0.55)}`, pointerEvents: 'none', zIndex: 60 }} />
                  )}
                </div>
                <div
                  onMouseDown={startSplitDrag}
                  title="Drag to resize"
                  style={{ width: 6, background: rgba(accent, 0.18), flexShrink: 0, cursor: 'col-resize' }}
                />
                <div
                  onMouseDown={() => setFocusedPane('right')}
                  style={{
                    flex: `${1 - splitRatio} 1 0%`, position: 'relative', overflow: 'hidden',
                    filter: focusedPane === 'right' ? 'none' : 'grayscale(0.35) brightness(0.62)',
                    opacity: focusedPane === 'right' ? 1 : 0.62,
                    transition: 'opacity .15s ease, filter .15s ease'
                  }}
                >
                  {tabs.filter(tab => tab.id === (splitTabId || tabs.find(t => t.id !== activeId)?.id)).map(tab => {
                    const baseProfile = profiles.find(p => p.id === tab.profileId) ?? profiles[0]
                    const prof = { ...baseProfile, shell: tab.shell ?? profileShell(baseProfile) }
                    const t = themes[settings.themeId ?? prof?.themeId] ?? defaultTheme
                    return (
                      <Terminal key={tab.id} tabId={tab.id} theme={t} profile={prof} active={focusedPane === 'right'} splitVisible
                        initialCwd={tab.cwd} fontSize={fontSize} fontFamily={fontFamily} cursorStyle={cursorStyle}
                        bootCommand={tab.bootCommand}
                        broadcastTabIds={broadcastMode ? tabs.map(t => t.id) : null}
                        restoreKey={tab.cwd ? tabKey(tab) : null}
                        persistScrollback={settings.persistScrollback !== false}
                        onSessionState={(state) => handleSessionState(tab.id, state)}
                        onReady={(state) => handleTerminalReady(tab.id, state)}
                        onNewTab={() => openTab(prof, { cwd: tab.cwd, shell: tab.shell })}
                        onCommand={(cmd) => { if (cmd) setCommandHistory(prev => prev.includes(cmd) ? prev : [...prev.slice(-499), cmd]) }}
                      />
                    )
                  })}
                  {focusedPane === 'right' && (
                    <div style={{ position: 'absolute', inset: 0, border: `2px solid ${rgba(accent, 0.55)}`, pointerEvents: 'none', zIndex: 60 }} />
                  )}
                </div>
              </div>
            ) : (
              tabs.map(tab => {
                const baseProfile = profiles.find(p => p.id === tab.profileId) ?? profiles[0]
                const prof = { ...baseProfile, shell: tab.shell ?? profileShell(baseProfile) }
                const t = themes[settings.themeId ?? prof?.themeId] ?? defaultTheme
                return (
                  <Terminal
                    key={tab.id}
                    tabId={tab.id}
                    theme={t}
                    profile={prof}
                    active={tab.id === activeId}
                    initialCwd={tab.cwd}
                    bootCommand={tab.bootCommand}
                    fontSize={fontSize}
                    fontFamily={fontFamily}
                    cursorStyle={cursorStyle}
                    broadcastTabIds={broadcastMode ? tabs.map(t => t.id) : null}
                    restoreKey={tab.cwd ? tabKey(tab) : null}
                    persistScrollback={settings.persistScrollback !== false}
                    onSessionState={(state) => handleSessionState(tab.id, state)}
                    onReady={(state) => handleTerminalReady(tab.id, state)}
                    onNewTab={() => openTab(prof, { cwd: tab.cwd, shell: tab.shell })}
                    onCommand={(cmd) => { if (cmd) setCommandHistory(prev => prev.includes(cmd) ? prev : [...prev.slice(-499), cmd]) }}
                  />
                )
              })
            )}

            {view === 'home' && (
              <div key="home-view" className="sush-reveal" style={{ position: 'absolute', inset: 0 }}>
              <HomeDashboard
                tabs={tabs}
                recentSessions={recentSessions}
                smartResult={smartResult}
                accent={accent}
                homeView={homeView}
                onRun={runSmartInput}
                onOpenRecent={openRecentSession}
                onOpenTab={() => openTab(profiles[0])}
                onNewSession={() => setShowLauncher(true)}
                onSeducia={() => setSeduciaOpen(true)}
              />
              </div>
            )}

            {visibleSmartOutput && (
              <div
                className="sush-fade-up sush-scroll"
                style={{
                  position: 'absolute',
                  left: 16,
                  right: 16,
                  bottom: 16,
                  zIndex: 130,
                  background: '#080a0c',
                  border: `1px solid ${smartResult.type === 'error' ? 'rgba(255,83,112,0.45)' : `${accent}55`}`,
                  borderRadius: 12,
                  boxShadow: '0 16px 44px rgba(0,0,0,0.6)',
                  maxHeight: 240,
                  overflow: 'auto'
                }}
              >
                <div className="flex items-center justify-between" style={{ padding: '9px 12px', borderBottom: '1px solid #1b2127', position: 'sticky', top: 0, background: '#080a0c' }}>
                  <span className="flex items-center" style={{ gap: 7, color: '#9aa3ab', fontSize: 11, fontWeight: 800 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: smartResult.type === 'error' ? '#ff5370' : accent }} />
                    {smartResult.input}
                  </span>
                  <button
                    onClick={() => setSmartResult(null)}
                    title="Dismiss"
                    style={{ background: 'none', border: 'none', color: '#7a838b', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
                  >
                    ×
                  </button>
                </div>
                {(() => {
                  const raw = stripAnsi(smartResult.output).trim()
                  const jsonView = smartResult.type !== 'error' && <JsonViewer content={raw} accent={accent} />
                  return jsonView || (
                    <pre style={{ margin: 0, padding: 12, color: '#d4dbe1', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.5 }}>
                      {raw}
                    </pre>
                  )
                })()}
              </div>
            )}
          </div>
        </div>

        {rightOpen && !zenMode && (
          <div data-glass className={!mounted ? 'sush-slide-left' : undefined} style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
            {/* Drag handle */}
            <div
              onMouseDown={startRightDrag}
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 10 }}
            />
            <RightPanel
              accent={accent}
              tab={rightTab}
              onTab={setRightTab}
              activeCwd={activeTab?.cwd}
              tabs={tabs}
              recentSessions={recentSessions}
              onLaunch={launchSessions}
              onRun={runSmartInput}
              onPrompt={sendAgentPrompt}
              onFocus={focusAgent}
              onOpenLauncher={() => setShowLauncher(true)}
              onClose={() => setRightOpen(false)}
              onNewTab={(options) => openTab(profiles[0], options)}
              settings={settings}
              planId={planId}
              commandHistory={commandHistory}
              style={{ width: rightWidth }}
            />
          </div>
        )}
      </div>

      {!zenMode && (
        <StatusBar
          accent={accent}
          activeTab={view === 'home' ? null : activeTab}
          view={view}
          sessionCount={tabs.length}
          broadcastMode={broadcastMode}
          splitMode={splitMode}
          agentSummary={agentSummary}
          onOpenMission={() => setShowMission(true)}
        />
      )}

      {!zenMode && (
        <SeduciaOrb
          accent={accent}
          open={seduciaOpen}
          onOpenChange={setSeduciaOpen}
          tabs={tabs}
          recentSessions={recentSessions}
          activeCwd={activeTab?.cwd}
          onLaunch={launchSessions}
          onRun={runSmartInput}
          onPrompt={sendAgentPrompt}
          onFocus={focusAgent}
          onOpenLauncher={() => setShowLauncher(true)}
          settings={settings}
          planId={planId}
        />
      )}

      {zenMode && (
        <button
          onClick={() => setZenMode(false)}
          title="Exit Zen Mode (Ctrl+Shift+Z)"
          style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 200, padding: '6px 14px', background: 'rgba(0,0,0,0.7)', border: `1px solid ${rgba(accent, 0.4)}`, borderRadius: 8, color: accent, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
        >
          Exit Zen
        </button>
      )}

      {showProfiles && (
        <ProfileManager
          profiles={profiles}
          onAdd={addProfile}
          onUpdate={updateProfile}
          onDelete={deleteProfile}
          onClose={() => setShowProfiles(false)}
          accent={accent}
        />
      )}

      {showSettings && (
        <Settings
          settings={settings}
          onChange={saveSettings}
          onClose={() => setShowSettings(false)}
          accent={accent}
          onUpgrade={() => { setShowSettings(false); setShowPlans(true) }}
          onEditSushrc={() => { setShowSettings(false); setShowSushrc(true) }}
        />
      )}

      {showPlans && (
        <PlansModal
          accent={accent}
          currentPlan={planId}
          onSelect={(id) => { setPlanId(id); savePlan(id) }}
          onClose={() => setShowPlans(false)}
        />
      )}

      {showLauncher && (
        <NewSessionModal
          accent={accent}
          activeCwd={activeTab?.cwd}
          recentSessions={recentSessions}
          onLaunch={launchSessions}
          onClose={() => setShowLauncher(false)}
        />
      )}

      {showPalette && (
        <CommandPalette
          accent={accent}
          dynamicActions={paletteActions()}
          onClose={() => setShowPalette(false)}
          onAction={handlePaletteAction}
          onRun={runSmartInput}
        />
      )}

      {showShortcuts && (
        <ShortcutsHelp
          accent={accent}
          onClose={() => setShowShortcuts(false)}
        />
      )}

      {showMission && (
        <MissionControl
          accent={accent}
          tabs={tabs}
          states={agentStates}
          summary={agentSummary}
          onFocus={(id) => { setActiveId(id); setView('terminal'); setShowMission(false) }}
          onClose={closeTab}
          onCloseGroup={closeGroup}
          onPrompt={promptSession}
          onDismiss={() => setShowMission(false)}
        />
      )}

      {handoffSource && (
        <HandoffModal
          accent={accent}
          sourceId={handoffSource}
          tabs={tabs}
          build={buildHandoffCard}
          onSubmit={performHandoff}
          onClose={() => setHandoffSource(null)}
        />
      )}

      {showSushrc && (
        <SushrcEditor
          accent={accent}
          onClose={() => setShowSushrc(false)}
        />
      )}

      {switcher && (
        <QuickSwitcher
          accent={accent}
          tabs={tabs}
          order={switcher.order}
          index={switcher.index}
        />
      )}

      {splash && (
        <SplashScreen accent={accent} onDone={() => setSplash(false)} />
      )}

      {/* Zoom size indicator — shows briefly when font size changes via Ctrl+/- */}
      {zoomIndicator !== null && (
        <div
          className="sush-fade-up"
          style={{
            position: 'fixed',
            bottom: 60,
            right: 20,
            zIndex: 500,
            background: 'rgba(0,0,0,0.75)',
            border: `1px solid ${rgba(accent, 0.35)}`,
            borderRadius: 10,
            padding: '8px 16px',
            color: accent,
            fontSize: 13,
            fontWeight: 800,
            pointerEvents: 'none',
            backdropFilter: 'blur(8px)'
          }}
        >
          {zoomIndicator}px
        </div>
      )}

    </div>
  )
}
