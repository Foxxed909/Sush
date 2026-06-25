import React, { useState, useCallback, useEffect, useMemo, useRef, lazy, Suspense } from 'react'
import Terminal from './components/Terminal'
import TitleBar from './components/TitleBar'
import ProfileManager, { useProfiles } from './components/ProfileManager'
import SessionRail from './components/SessionRail'
import HomeDashboard from './components/HomeDashboard'
import SmartCommandBar from './components/SmartCommandBar'
import StatusBar from './components/StatusBar'
import SeduciaOrb from './components/SeduciaOrb'
import SplashScreen from './components/SplashScreen'
import LockScreen from './components/LockScreen'
// Static: LockScreen already imports ProfileViewer, so it's in the initial
// graph regardless — lazy-loading it here would only split a shared chunk.
import ProfileViewer from './components/ProfileViewer'

// Heavy, interaction-gated surfaces are code-split: they don't belong in the
// first paint, so each becomes its own chunk loaded on demand. This trims the
// initial renderer bundle (which was a single ~1.6 MB chunk) substantially.
const Settings = lazy(() => import('./components/Settings'))
const NewSessionModal = lazy(() => import('./components/NewSessionModal'))
const RightPanel = lazy(() => import('./components/RightPanel'))
const Hush = lazy(() => import('./components/Hush'))
const MissionControl = lazy(() => import('./components/MissionControl'))
const AliasNudge = lazy(() => import('./components/AliasNudge'))
const CommandPalette = lazy(() => import('./components/CommandPalette'))
const ShortcutsHelp = lazy(() => import('./components/ShortcutsHelp'))
const HandoffModal = lazy(() => import('./components/HandoffModal'))
const SushrcEditor = lazy(() => import('./components/SushrcEditor'))
const QuickSwitcher = lazy(() => import('./components/QuickSwitcher'))
const UserManager = lazy(() => import('./components/UserManager'))
import { useIdentity } from './hooks/useIdentity'
import { usePolling } from './hooks/usePolling'
import { themes, getTheme } from './themes'
import { agentById, MAX_SESSIONS, LOGIN_COMMANDS } from './lib/agents'
import { runningTargets as seduciaTargets } from './lib/seducia'
import { accentVars, glassVars, rgba } from './lib/ui'
import { useAgentActivity } from './hooks/useAgentActivity'
import { useEntitlements } from './hooks/useEntitlements'
import { useBattery } from './hooks/useBattery'
import { useOnline } from './hooks/useOnline'
import { STATES } from './lib/agentActivity'
import { useAutoAlias } from './hooks/useAutoAlias'
import { recordCommand } from './lib/commandFrequency'
import JsonViewer from './components/JsonViewer'
import Icon from './components/Icons'

const RECENT_SESSIONS_KEY = 'sush-recent-sessions'
const OLD_COMMAND_RECENTS_KEY = 'sush-recents'
const SESSION_LAYOUT_KEY = 'sush-session-layout'
const LAST_HOME_VIEW_KEY = 'sush-last-home-view'
const COMMAND_HISTORY_KEY = 'sush-command-history'
const PINNED_PROJECTS_KEY = 'sush-pinned-projects'
const MAX_RECENT_SESSIONS = 8

function loadCommandHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(COMMAND_HISTORY_KEY) ?? '[]')
    return Array.isArray(saved) ? saved.filter(x => typeof x === 'string').slice(-500) : []
  } catch {
    return []
  }
}

function loadPinnedProjects() {
  try {
    const saved = JSON.parse(localStorage.getItem(PINNED_PROJECTS_KEY) ?? '[]')
    return Array.isArray(saved) ? saved.filter(p => p && p.cwd) : []
  } catch {
    return []
  }
}

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

function minutesOfDay(value, fallback) {
  const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return fallback
  const h = Math.max(0, Math.min(23, Number(match[1]) || 0))
  const m = Math.max(0, Math.min(59, Number(match[2]) || 0))
  return h * 60 + m
}

function quietHoursNow(settings, now = new Date()) {
  if (settings.quietHoursEnabled !== true) return false
  const start = minutesOfDay(settings.quietHoursStart, 22 * 60)
  const end = minutesOfDay(settings.quietHoursEnd, 7 * 60)
  if (start === end) return false
  const current = now.getHours() * 60 + now.getMinutes()
  return start < end
    ? current >= start && current < end
    : current >= start || current < end
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

    // Cap matches MAX_SESSIONS (was 12 — silently dropped tabs of a full swarm).
    const tabs = dedupeTabs(saved.tabs.slice(0, 16).map(item => {
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
  const identity = useIdentity()
  const { profiles, addProfile, updateProfile, deleteProfile } = useProfiles()
  const initialLayout = useRef(loadSessionLayout(profiles))
  const [tabs, setTabs] = useState(initialLayout.current.tabs)
  const [activeId, setActiveId] = useState(initialLayout.current.activeId)
  const [view, setView] = useState('home')
  const [homeView, setHomeView] = useState(() => localStorage.getItem(LAST_HOME_VIEW_KEY) || 'dashboard')
  const [showProfiles, setShowProfiles] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showLauncher, setShowLauncher] = useState(false)
  const [rightOpen, setRightOpen] = useState(() => localStorage.getItem('sush-right-open') === '1')
  const [seduciaOpen, setSeduciaOpen] = useState(false)
  const [rightTab, setRightTab] = useState(() => localStorage.getItem('sush-right-tab') || 'agent')
  const [settings, setSettings] = useState(loadSettings)
  const entitlements = useEntitlements()
  const online = useOnline()
  // Auto power-saver: when running on battery below the threshold, conserve even
  // if the user never flipped the manual toggle. Charging or above threshold,
  // we respect only the manual setting. On by default — this user has no grid.
  const battery = useBattery({ saver: !!settings.powerSaver })
  const AUTO_SAVER_AT = 20
  const autoSaverActive = settings.autoPowerSaver !== false && battery.hasBattery && !battery.charging && battery.percent <= AUTO_SAVER_AT
  const [quietHoursActive, setQuietHoursActive] = useState(() => quietHoursNow(loadSettings()))
  const effectiveSaver = !!settings.powerSaver || autoSaverActive || quietHoursActive
  const [recentSessions, setRecentSessions] = useState(loadRecentSessions)
  const [smartBusy, setSmartBusy] = useState(false)
  const [smartResult, setSmartResult] = useState(null)
  const [zenMode, setZenMode] = useState(false)
  const terminalSaver = effectiveSaver || zenMode
  const [showPalette, setShowPalette] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showMission, setShowMission] = useState(false)
  const [showUserManager, setShowUserManager] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  // Command history persists per user (scoped storage) so it survives restarts.
  const [commandHistory, setCommandHistory] = useState(loadCommandHistory)
  const [pinnedProjects, setPinnedProjects] = useState(loadPinnedProjects)
  const [broadcastMode, setBroadcastMode] = useState(false)
  const [gridMode, setGridMode] = useState(false)   // all booted sessions tiled
  const [rightWidth, setRightWidth] = useState(() => parseInt(localStorage.getItem('sush-right-width') || '360', 10))
  const [renamingId, setRenamingId] = useState(null)
  const [handoffSource, setHandoffSource] = useState(null)
  const [showSushrc, setShowSushrc] = useState(false)
  const [switcher, setSwitcher] = useState(null)  // { order:[ids], index } when open
  const [splash, setSplash] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [sleeping, setSleeping] = useState(false)
  // Lazy boot: restored tabs are rail entries only until first viewed — their
  // PTY (and agent resume command) spawns on demand. Opening the app no
  // longer ignites the whole saved swarm at once (CPU killer on weak boxes),
  // and you land on a calm Home screen. Once booted, a tab stays mounted.
  const [bootedIds, setBootedIds] = useState(() => new Set())
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

  useEffect(() => { tabsRef.current = tabs }, [tabs])
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  useEffect(() => {
    const sync = () => {
      const active = quietHoursNow(settings)
      setQuietHoursActive(active)
      if (active) setSleeping(true)
    }
    sync()
    const id = setInterval(sync, 60_000)
    return () => clearInterval(id)
  }, [settings.quietHoursEnabled, settings.quietHoursStart, settings.quietHoursEnd])

  // Boot a tab's terminal the first time it's actually shown. New tabs created
  // at runtime boot via the same path because openTab/selectTab set view +
  // activeId. (Grid mode boots its tiles on click, via setBootedIds inline.)
  useEffect(() => {
    if (view !== 'terminal') return
    if (bootedIds.has(activeId)) return
    setBootedIds(prev => new Set(prev).add(activeId))
  }, [view, activeId, bootedIds])

  // ── Idle sleep ─────────────────────────────────────────────────────────────
  // No input for idleSleepMinutes → dim the app, freeze animations, and gate
  // every poll (usePolling checks body[data-sleeping]). PTYs and agents keep
  // running untouched — sleep is a renderer/GPU/battery measure, never a
  // process one. Any key, click, or mouse move wakes it.
  const lastActivityRef = useRef(Date.now())
  useEffect(() => {
    const mins = Number(settings.idleSleepMinutes ?? 10)
    if (!mins) return
    const bump = () => { lastActivityRef.current = Date.now() }
    let lastMove = 0
    const onMove = () => { const now = Date.now(); if (now - lastMove > 1000) { lastMove = now; bump() } }
    window.addEventListener('keydown', bump, { passive: true, capture: true })
    window.addEventListener('pointerdown', bump, { passive: true, capture: true })
    window.addEventListener('wheel', bump, { passive: true, capture: true })
    window.addEventListener('pointermove', onMove, { passive: true, capture: true })
    const timer = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= mins * 60000) setSleeping(true)
    }, 15000)
    return () => {
      window.removeEventListener('keydown', bump, { capture: true })
      window.removeEventListener('pointerdown', bump, { capture: true })
      window.removeEventListener('wheel', bump, { capture: true })
      window.removeEventListener('pointermove', onMove, { capture: true })
      clearInterval(timer)
    }
  }, [settings.idleSleepMinutes])

  useEffect(() => {
    if (!sleeping) {
      delete document.body.dataset.sleeping
      return
    }
    document.body.dataset.sleeping = '1'
    // Swallow the waking keypress/click so it doesn't land in a terminal.
    const wake = (e) => { e.preventDefault(); e.stopPropagation(); lastActivityRef.current = Date.now(); setSleeping(false) }
    const wakeSoft = () => { lastActivityRef.current = Date.now(); setSleeping(false) }
    window.addEventListener('keydown', wake, { capture: true })
    window.addEventListener('pointerdown', wake, { capture: true })
    window.addEventListener('pointermove', wakeSoft, { capture: true })
    return () => {
      delete document.body.dataset.sleeping
      window.removeEventListener('keydown', wake, { capture: true })
      window.removeEventListener('pointerdown', wake, { capture: true })
      window.removeEventListener('pointermove', wakeSoft, { capture: true })
    }
  }, [sleeping])
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

  // One-time migration from the old global CLI limit policy into the current
  // per-provider account setting. Keeping it here lets renderer-owned
  // localStorage hand the value to main, where accounts.json lives.
  useEffect(() => {
    const legacy = settings.cliLimitPolicy
    if (!identity.ready || !['never', 'ask', 'auto'].includes(legacy)) return
    let cancelled = false
    ;(async () => {
      await Promise.allSettled([
        window.sush.accountsSetPolicy?.({ provider: 'claude', policy: legacy }),
        window.sush.accountsSetPolicy?.({ provider: 'codex', policy: legacy })
      ])
      if (cancelled) return
      setSettings(prev => {
        if (prev.cliLimitPolicy !== legacy) return prev
        const { cliLimitPolicy, ...rest } = prev
        try { localStorage.setItem('sush-settings', JSON.stringify(rest)) } catch {}
        return rest
      })
    })()
    return () => { cancelled = true }
  }, [identity.ready, settings.cliLimitPolicy])

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

  // One Seducia, two scopes: on Home she's Main (whole-app control); inside a
  // workspace she's that workspace's Project Seducia — own chat history,
  // actions fenced to its sessions, launches grow the workspace.
  const seduciaScope = useMemo(() => {
    // She also gets the focused session's label so "this error you're
    // seeing" resolves to the terminal currently on screen.
    const focusedLabel = view === 'terminal' ? (activeTab?.label || null) : null
    if (view === 'terminal' && activeTab?.groupId) {
      return {
        kind: 'project',
        groupId: activeTab.groupId,
        label: activeTab.groupLabel || pathLabel(activeTab.cwd || '') || 'Workspace',
        cwd: activeTab.cwd || null,
        focusedLabel
      }
    }
    return { kind: 'main', focusedLabel }
  }, [view, activeTab?.groupId, activeTab?.groupLabel, activeTab?.cwd, activeTab?.label])

  // Mission Control: live per-session state inferred from the PTY stream.
  const { states: agentStates, limits: agentLimits, summary: agentSummary } = useAgentActivity(tabs, { notify: settings.agentNotifications !== false, powerSaver: terminalSaver })
  // Ref mirror so long-lived closures (launchSessions' brief waiter) can read
  // the latest classification without re-subscribing.
  const agentStatesRef = useRef(agentStates)
  useEffect(() => { agentStatesRef.current = agentStates }, [agentStates])

  // Never strand the user on a black screen: terminal view with zero sessions
  // renders nothing, so fall back to Home and drop grid when the last session
  // goes away.
  useEffect(() => {
    if (tabs.length === 0) {
      if (gridMode) setGridMode(false)
      if (view === 'terminal') setView('home')
    }
  }, [tabs.length, view, gridMode])

  // GitHub notifications badge. Lives here (not in the tab) so the count
  // shows with the panel closed. Main answers instantly with 0 when the
  // identity has no GitHub connection, and ETag caching makes the poll
  // nearly free; focus-gating comes from usePolling itself.
  const [ghNotifCount, setGhNotifCount] = useState(0)
  const pollGhNotifs = useCallback(async () => {
    if (!online) return
    try {
      const res = await window.sush.githubNotifications({})
      setGhNotifCount(res?.ok ? (res.unreadCount || 0) : 0)
    } catch {
      setGhNotifCount(0)
    }
  }, [online])
  usePolling(pollGhNotifs, 120000, identity.ready && online)
  useEffect(() => { if (!online) setGhNotifCount(0) }, [online])

  const [sessionMetrics, setSessionMetrics] = useState({})
  const pollSessionMetrics = useCallback(async () => {
    if (!settings.sessionResourceMeter || terminalSaver) return
    try {
      const stats = await window.sush.getSystemStats?.()
      if (!stats?.error) setSessionMetrics(stats?.sessions || {})
    } catch {}
  }, [settings.sessionResourceMeter, terminalSaver])
  usePolling(pollSessionMetrics, 5000, showMission && settings.sessionResourceMeter === true && !terminalSaver)
  useEffect(() => {
    if (!settings.sessionResourceMeter || terminalSaver || !showMission) setSessionMetrics({})
  }, [settings.sessionResourceMeter, terminalSaver, showMission])

  // Auto-alias miner: tally omnibar commands; suggest a .sushrc alias once one
  // is run often enough. `cmdTick` bumps on each run to re-evaluate the table.
  const [cmdTick, setCmdTick] = useState(0)
  const [nudgeHidden, setNudgeHidden] = useState(false)
  const { suggestion: aliasSuggestion, accept: acceptAlias, dismiss: dismissAlias } =
    useAutoAlias(cmdTick, settings.autoAlias !== false)

  // Auto-dismiss smart result after 8 seconds of inactivity.
  useEffect(() => {
    if (!smartResult) return
    clearTimeout(smartDismissRef.current)
    smartDismissRef.current = setTimeout(() => setSmartResult(null), 8000)
    return () => clearTimeout(smartDismissRef.current)
  }, [smartResult])

  const theme = getTheme(settings.themeId ?? activeProfile?.themeId)
  const themeId = theme.id
  const accent = theme.ui.accent
  const fontSize = settings.fontSize ?? 14
  const fontFamily = settings.fontFamily ?? "'Cascadia Code'"
  const cursorStyle = settings.cursorStyle ?? 'block'

  // "Show wallpaper through terminals": when a wallpaper is set and the user
  // opts in, hand xterm a transparent background so the (already dimmed)
  // wallpaper shows behind the text — allowTransparency is always on in
  // useTerminal, so this is just a theme override. Terminal container tiles go
  // transparent too (see grid render). Off → terminals keep their solid theme bg.
  const wallpaperOnTerminals = !!settings.bgImage && settings.terminalWallpaper === true
  const termTheme = useCallback((base) => {
    if (!wallpaperOnTerminals || !base?.xterm) return base
    return { ...base, xterm: { ...base.xterm, background: 'rgba(0,0,0,0)' } }
  }, [wallpaperOnTerminals])

  const zoomTimerRef = useRef(null)
  useEffect(() => {
    const flash = (size) => {
      setZoomIndicator(size)
      clearTimeout(zoomTimerRef.current)
      zoomTimerRef.current = setTimeout(() => setZoomIndicator(null), 1200)
    }
    const handler = (e) => {
      if (!e.ctrlKey) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        const next = Math.min((settings.fontSize ?? 14) + 1, 28)
        saveSettings({ ...settings, fontSize: next })
        flash(next)
      }
      if (e.key === '-') {
        e.preventDefault()
        const next = Math.max((settings.fontSize ?? 14) - 1, 8)
        saveSettings({ ...settings, fontSize: next })
        flash(next)
      }
      if (e.key === '0') {
        e.preventDefault()
        saveSettings({ ...settings, fontSize: 14 })
        flash(14)
      }
    }
    window.addEventListener('keydown', handler)
    return () => { window.removeEventListener('keydown', handler); clearTimeout(zoomTimerRef.current) }
  }, [settings])

  // Window opacity is an OS-level window property (main calls setOpacity), not
  // a CSS opacity on the root — the latter faded the terminal text itself.
  useEffect(() => {
    window.sush.setOpacity?.((settings.opacity ?? 100) / 100)
  }, [settings.opacity])

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
      // Ctrl+Shift+Z -> focus mode: one terminal, no chrome, saver rendering.
      if (ctrl && e.shiftKey && key === 'z') {
        e.preventDefault()
        setZenMode(prev => {
          const next = !prev
          if (next && tabsRef.current.length) setView('terminal')
          return next
        })
      }
      // Ctrl+Shift+B → broadcast mode
      if (ctrl && e.shiftKey && key === 'b') { e.preventDefault(); setBroadcastMode(prev => !prev) }
      // Ctrl+Shift+M → Mission Control (Ctrl+M alone is Enter in a terminal)
      if (ctrl && e.shiftKey && key === 'm') { e.preventDefault(); setShowMission(prev => !prev) }
      // Ctrl+Shift+S → Hush dictation toggle
      if (ctrl && e.shiftKey && key === 's') { e.preventDefault(); window.dispatchEvent(new CustomEvent('sush:hush-toggle')) }
      // Ctrl+Shift+E → power saver (energy) toggle. Persist inline (setSettings
      // alone is lost on restart — same pattern as the lite-mode toggle below).
      if (ctrl && e.shiftKey && key === 'e') {
        e.preventDefault()
        setSettings(prev => { const next = { ...prev, powerSaver: !prev.powerSaver }; try { localStorage.setItem('sush-settings', JSON.stringify(next)) } catch {} ; return next })
      }
      // Ctrl+Shift+G → grid layout (all sessions tiled)
      if (ctrl && e.shiftKey && key === 'g') {
        e.preventDefault()
        setGridMode(prev => {
          if (!prev && tabsRef.current.length < 2) return prev
          if (!prev) setView('terminal')
          return !prev
        })
      }
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
    localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(commandHistory.slice(-500)))
  }, [commandHistory])

  useEffect(() => {
    localStorage.setItem(PINNED_PROJECTS_KEY, JSON.stringify(pinnedProjects.slice(0, 12)))
  }, [pinnedProjects])

  // Pin/unpin a project directory on the Home dashboard.
  const togglePinnedProject = useCallback((item) => {
    if (!item?.cwd) return
    setPinnedProjects(prev => {
      const key = normalizePathKey(item.cwd)
      const exists = prev.some(p => normalizePathKey(p.cwd) === key)
      if (exists) return prev.filter(p => normalizePathKey(p.cwd) !== key)
      return [{ cwd: item.cwd, label: item.label || pathLabel(item.cwd) }, ...prev].slice(0, 12)
    })
  }, [])

  // Download the active session's recent output as a text file.
  const exportSessionOutput = useCallback(async (tabId) => {
    const id = tabId ?? activeIdRef.current
    const tab = tabsRef.current.find(t => t.id === id)
    if (!tab) return
    try {
      const res = await window.sush.getScrollback({ tabId: id, chars: 60000 })
      const text = res?.text || ''
      const blob = new Blob([text || '(no captured output)'], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sush-${(tab.label || 'session').replace(/[^\w.-]+/g, '_')}-${Date.now()}.txt`
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }, [])

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
    // Tabs created at runtime boot immediately (lazy boot is only for tabs
    // RESTORED at startup) — swarm launches type briefs into PTYs that must
    // exist even while a sibling tab holds focus.
    setBootedIds(prev => new Set(prev).add(tab.id))
    setActiveId(tab.id)
    setView('terminal')
    if (tab.cwd) rememberSession(tab)
    window.sush.newTab({ tabId: tab.id, cwd: tab.cwd }).catch((error) => {
      console.error('Failed to initialize tab context', error)
    })
    return tab
  }, [profiles, rememberSession])

  const launchSessions = useCallback(({ cwd, agents, groupLabel, prompt, groupId: intoGroupId }) => {
    const prof = profiles[0]
    const targetCwd = cwd || null
    // Seducia's AI may emit bare agents ({id, count}) — fill command/label
    // from the catalog or the launch silently opens dead, unlabeled shells.
    const normalized = (agents || [])
      .map(a => {
        const known = agentById(a?.id)
        if (!known && !a?.id) return null
        return { ...(known || {}), ...a, command: a?.command ?? known?.command ?? null, label: a?.label || known?.label || a.id }
      })
      .filter(Boolean)
    if (!normalized.length) return
    // Cap the swarm — an AI-misread count must not spawn an unbounded grid.
    const liveCount = tabsRef.current.filter(t => t.status !== 'exited').length
    const room = Math.max(0, MAX_SESSIONS - liveCount)
    let budget = room
    agents = normalized
      .map(a => {
        const want = Math.max(1, a.count || 1)
        const take = Math.min(want, budget)
        budget -= take
        return take > 0 ? { ...a, count: take } : null
      })
      .filter(Boolean)
    if (!agents.length) return
    const total = agents.reduce((sum, agent) => sum + Math.max(1, agent.count || 1), 0)
    // Every launch is a Workspace — a folder plus the crew inside it. A solo
    // launch is simply a workspace of one; sessions always live inside.
    // Project Seducia passes groupId to grow an existing workspace instead.
    const existing = intoGroupId ? tabsRef.current.find(t => t.groupId === intoGroupId) : null
    const groupId = existing ? intoGroupId : `grp-${nextGroupId++}`
    const label = existing
      ? (existing.groupLabel || groupLabel || (targetCwd ? pathLabel(targetCwd) : 'Workspace'))
      : (groupLabel || `${targetCwd ? pathLabel(targetCwd) : 'Workspace'}${total >= 2 ? ` · ${total}` : ''}`)

    const spawned = []
    agents.forEach(agent => {
      const count = Math.max(1, agent.count || 1)
      for (let i = 0; i < count; i++) {
        const base = agent.id === 'shell'
          ? (targetCwd ? pathLabel(targetCwd) : prof?.label ?? 'Shell')
          : agent.label
        const tab = openTab(prof, {
          cwd: targetCwd,
          command: agent.command || undefined,
          agentId: agent.id,
          tag: `sess-${nextSessionTag++}`,
          groupId,
          groupLabel: label,
          // The custom name lives on the workspace; sessions keep agent names.
          label: count > 1 ? `${base} ${i + 1}` : base
        })
        if (tab) spawned.push(tab)
      }
    })

    // Seducia "launch and brief them": type the prompt into each spawned
    // session once its agent TUI has had a beat to boot (the bootCommand
    // lands first; agent CLIs need a couple seconds before they accept
    // input). Flattened to one line — TUIs treat Enter as submit.
    const brief = String(prompt ?? '').trim().replace(/\s*\n+\s*/g, ' ')
    if (brief) {
      // Type the brief when each agent's TUI actually settles (the activity
      // classifier reports waiting/idle after boot) instead of the old blind
      // 4.5s timer — slow machines missed the window, fast ones sat around.
      // Hard fallback at 12s so a brief is never silently dropped.
      spawned.forEach((tab, i) => {
        const startedAt = Date.now()
        const timer = setInterval(() => {
          const live = tabsRef.current.find(t => t.id === tab.id)
          if (!live || live.status === 'exited') { clearInterval(timer); return }
          const elapsed = Date.now() - startedAt
          const state = agentStatesRef.current[tab.id]
          const settled = elapsed >= 2500 + i * 300 && (state === 'waiting' || state === 'idle')
          if (settled || elapsed >= 12000) {
            clearInterval(timer)
            if (live.status === 'running') window.sush.ptyInput({ tabId: tab.id, data: `${brief}\r` })
          }
        }, 500)
      })
    }
    setShowLauncher(false)
    // Seducia stays open so you can keep orchestrating after a launch.
  }, [openTab, profiles])

  // Settings "Add account" / "Sign in" hands off here: open a session running
  // the CLI's own login so its browser OAuth (Google where supported) starts.
  // The freshly activated account slot captures the provider's CLI state.
  useEffect(() => {
    const handler = (e) => {
      const provider = e.detail?.provider
      const spec = LOGIN_COMMANDS[provider]
      if (!spec) return
      setShowSettings(false)
      openTab(profiles[0], {
        command: spec.command,
        agentId: provider,
        tag: `sess-${nextSessionTag++}`,
        label: spec.label
      })
    }
    window.addEventListener('sush:open-login-session', handler)
    return () => window.removeEventListener('sush:open-login-session', handler)
  }, [openTab, profiles])

  // Seducia awareness: which live sessions match a target ('all', an agent
  // id, or a session label like "Claude Code 2"), optionally fenced to one
  // workspace (Project Seducia's scope).
  const liveTargets = useCallback((target, groupId) => {
    const pool = groupId ? tabsRef.current.filter(t => t.groupId === groupId) : tabsRef.current
    return seduciaTargets(pool, target)
  }, [])

  // Seducia "tell claude ..." -- type a prompt into every matching live agent.
  const sendAgentPrompt = useCallback(({ target, text, groupId }) => {
    const body = String(text ?? '').trim()
    if (!body) return
    const matches = liveTargets(target, groupId)
    if (!matches.length) return
    // Restored-but-unbooted targets must spawn for the queued prompt to land.
    setBootedIds(prev => {
      if (matches.every(t => prev.has(t.id))) return prev
      const next = new Set(prev)
      matches.forEach(t => next.add(t.id))
      return next
    })
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
  const focusAgent = useCallback((target, groupId) => {
    const match = liveTargets(target, groupId)[0]
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

  const renameGroup = useCallback((groupId, label) => {
    if (!groupId) return
    const next = String(label ?? '').trim().slice(0, 40)
    if (!next) return
    setTabs(prev => prev.map(t => t.groupId === groupId ? { ...t, groupLabel: next } : t))
  }, [])

  // Close every session that has already exited — a one-click tidy for the rail
  // after a swarm finishes, instead of dismissing each dead tab by hand.
  const clearExitedSessions = useCallback(() => {
    tabsRef.current.filter(t => t.status === 'exited').forEach(t => closeTabRef.current?.(t.id))
  }, [])

  // Grow an existing workspace: open a fresh shell inside the same group, in the
  // group's working directory. `tag` forces a new session even when the cwd
  // matches an existing one (openTab otherwise dedupes by cwd).
  const addToGroup = useCallback((block) => {
    if (!block?.id) return
    const cwd = block.tabs?.find(t => t.cwd)?.cwd ?? null
    openTab(profiles[0], {
      cwd,
      groupId: block.id,
      groupLabel: block.label,
      tag: 'group-add'
    })
  }, [openTab, profiles])

  // ── Seducia control surface ────────────────────────────────────────────────
  // Everything the UI buttons can do, exposed as callable actions so Seducia
  // can run the place. Workspace lookups accept a label or "this"/"current"
  // (the active tab's workspace).
  const findGroupByName = useCallback((name) => {
    const q = String(name ?? '').trim().toLowerCase()
    const all = tabsRef.current
    if (!q || q === 'this' || q === 'current') {
      return all.find(t => t.id === activeIdRef.current)?.groupId || null
    }
    const hit = all.find(t => (t.groupLabel || '').toLowerCase() === q)
      || all.find(t => (t.groupLabel || '').toLowerCase().includes(q))
    return hit?.groupId || null
  }, [])

  const seduciaControls = useMemo(() => ({
    closeSessions: (target, groupId) => {
      const matches = liveTargets(target, groupId)
      matches.forEach(t => closeTabRef.current?.(t.id))
      return matches.length
    },
    closeWorkspace: (name) => {
      const gid = findGroupByName(name)
      if (!gid) return false
      closeGroup(gid)
      return true
    },
    renameWorkspace: (name, to) => {
      const gid = findGroupByName(name)
      if (!gid || !String(to ?? '').trim()) return false
      renameGroup(gid, to)
      return true
    },
    setTheme: (name) => {
      const q = String(name ?? '').trim().toLowerCase()
      if (!q) return false
      const entry = Object.values(themes).find(t => t.id === q || (t.label || '').toLowerCase() === q)
        || Object.values(themes).find(t => (t.label || '').toLowerCase().includes(q))
      if (!entry) return false
      // Persist like Settings does — setSettings alone is lost on restart.
      setSettings(s => {
        const next = { ...s, themeId: entry.id }
        try { localStorage.setItem('sush-settings', JSON.stringify(next)) } catch {}
        return next
      })
      return entry.label || entry.id
    },
    // Tail the scrollback of matching sessions so Seducia can review what her
    // agents actually produced (capped: 6 sessions, ~4k chars each).
    readOutput: async (target, groupId) => {
      const matches = liveTargets(target, groupId).slice(0, 6)
      const reads = await Promise.all(matches.map(async (t) => {
        try {
          const r = await window.sush.getScrollback({ tabId: t.id, chars: 4000 })
          return { label: t.label, agentId: t.agentId || 'shell', text: stripAnsi(String(r?.text ?? '')).slice(-4000) }
        } catch {
          return null
        }
      }))
      return reads.filter(Boolean)
    }
  }), [liveTargets, findGroupByName, closeGroup, renameGroup])

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

    // A queued prompt for a closing tab would otherwise leak forever.
    pendingPtyRef.current.delete(id)

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

  // Limit-hit recovery for INTERACTIVE agent sessions (the case the Seducia
  // cascade can't reach): switch this CLI to the account that's rested longest
  // and relaunch the session in resume mode, so the conversation continues on
  // the fresh account (claude --continue, codex resume --last). Explicit, one
  // click from Mission Control — never automatic, so a live session is never
  // yanked out from under you.
  const switchAndResume = useCallback(async (tabId) => {
    const tab = tabsRef.current.find(t => t.id === tabId)
    const provider = tab?.agentId
    if (!tab || (provider !== 'claude' && provider !== 'codex')) return
    try {
      const list = await window.sush.accountsList?.()
      const st = list?.providers?.[provider]
      if (!st || (st.slots?.length || 0) < 2) return
      const alt = st.slots
        .filter(s => s.id !== st.active)
        .sort((a, b) => (a.lastLimitAt || 0) - (b.lastLimitAt || 0))[0]
      if (!alt) return
      const sw = await window.sush.accountsSwitch({ provider, slotId: alt.id })
      if (!sw?.ok) return
      const agent = agentById(provider)
      const { cwd, label } = tab
      closeTab(tabId)
      openTab(profiles[0], {
        cwd,
        agentId: provider,
        command: agent?.resumeCommand ?? agent?.command,
        label,
        tag: `sess-${nextSessionTag++}`
      })
    } catch {}
  }, [closeTab, openTab, profiles])

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
    // 4k chars: enough tail for the AI summarizer to reconstruct the work.
    try { scroll = (await window.sush.getScrollback({ tabId: sourceId, chars: 4000 }))?.text || '' } catch {}
    return { tab, branch, dirty, scroll, recent: commandHistory.slice(-6) }
  }, [commandHistory])

  // Deliver a handoff: copy the full card to the clipboard (rich paste), then
  // either boot a fresh AGENT session that gets the brief typed in and
  // submitted once its TUI is up (launchSessions owns that timing), or paste
  // a single safe line at an existing session's prompt for the user to send.
  const performHandoff = useCallback(({ targetId, fullText, injectText, openNew, agentId, sourceCwd }) => {
    window.sush.copyText(String(fullText || '')).catch(() => {})
    const oneLine = String(injectText || '').replace(/\r?\n+/g, ' | ').trim()
    if (openNew) {
      if (agentId && agentId !== 'shell') {
        launchSessions({
          cwd: sourceCwd || null,
          agents: [{ id: agentId, count: 1 }],
          groupLabel: 'Handoff',
          prompt: oneLine || undefined
        })
      } else {
        const target = openTab(profiles[0], { cwd: sourceCwd || null, label: 'handoff', tag: `handoff-${Date.now()}` })
        if (oneLine) setTimeout(() => window.sush.ptyInput({ tabId: target.id, data: oneLine }), 1200)
      }
    } else {
      const target = tabsRef.current.find(t => t.id === targetId)
      if (target) {
        setActiveId(target.id)
        setView('terminal')
        if (oneLine) window.sush.ptyInput({ tabId: target.id, data: oneLine })
      }
    }
    setHandoffSource(null)
  }, [openTab, profiles, launchSessions])

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
    }
  }, [findOrOpenCwd, queuePtyCommand, recentSessions, duplicateTab])

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
      // Feed the alias miner real commands only (skip failures/typos).
      if (nextResult.type !== 'error') { recordCommand(command); setNudgeHidden(false); setCmdTick(t => t + 1) }
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
    else if (action === 'toggle-panel') setRightOpen(prev => !prev)
    else if (action === 'zen') setZenMode(prev => !prev)
    else if (action === 'mission') setShowMission(true)
    else if (action === 'shortcuts') setShowShortcuts(true)
    else if (action === 'home') { setHomeView('dashboard'); setView('home') }
    else if (action === 'handoff') { if (activeIdRef.current) setHandoffSource(activeIdRef.current) }
    else if (action === 'rename') { if (activeIdRef.current) { setView('terminal'); setRenamingId(activeIdRef.current) } }
    else if (action === 'sushrc') setShowSushrc(true)
    else if (action === 'export-output') exportSessionOutput()
    else if (action === 'lock') identity.lock()
    else if (action === 'switch-user') identity.signOut()
    else if (action === 'manage-users') setShowUserManager(true)
    else if (action === 'broadcast') setBroadcastMode(prev => !prev)
    else if (action === 'grid') {
      setGridMode(prev => {
        if (!prev && tabsRef.current.length < 2) return prev
        if (!prev) setView('terminal')
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
  }, [settings, recentSessions, openRecentSession, identity, exportSessionOutput])

  // Dynamic palette entries: new actions + a jump-to-session for every open tab.
  const paletteActions = useCallback(() => {
    const base = [
      { id: 'act-mission', label: 'Mission Control', description: 'Live board of every agent session (Ctrl+Shift+M)', icon: 'activity', action: 'mission' },
      { id: 'act-handoff', label: 'Hand Off Session', description: 'Pass this session\'s context to another', icon: 'send', action: 'handoff' },
      { id: 'act-rename', label: 'Rename Session', description: 'Rename the active session (F2)', icon: 'edit', action: 'rename' },
      { id: 'act-sushrc', label: 'Edit .sushrc Profile', description: 'Your shell-agnostic Sush profile', icon: 'fileText', action: 'sushrc' },
      { id: 'act-export', label: 'Export Session Output', description: 'Save this session\'s recent output as .txt', icon: 'fileText', action: 'export-output' },
      { id: 'act-lock', label: 'Lock Sush', description: 'Lock the app — sessions keep running', icon: 'lock', action: 'lock' },
      { id: 'act-switch-user', label: 'Switch User / Sign Out', description: 'Closes your sessions and opens the user picker', icon: 'users', action: 'switch-user' },
      { id: 'act-users', label: 'Manage Users', description: 'Identities, PINs, isolation level', icon: 'users', action: 'manage-users' },
    ]
    base.push(
      { id: 'act-grid', label: 'Toggle Grid Layout', description: 'Tile every session in an auto-sized grid (Ctrl+Shift+G)', icon: 'grid', action: 'grid' },
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

  // ── Identity gate ─────────────────────────────────────────────────────
  // Nothing below may render until main knows whose session this is — a
  // Terminal mounted early would spawn its PTY with the host environment and
  // leak the real ~/.claude into the session. (All hooks above already ran,
  // so these early returns are safe.)
  if (identity.loading) {
    return <div style={{ height: '100vh', background: '#07090c' }} />
  }
  if (identity.locked) {
    return (
      <LockScreen
        users={identity.users}
        lastUserId={identity.lastUserId}
        lockedUser={identity.currentUser}
        onUnlock={identity.unlock}
        onCreate={identity.create}
        onSwitchRequest={identity.signOut}
        onProviderSignedIn={identity.providerSignIn}
      />
    )
  }

  return (
    <Suspense fallback={null}>
    <div
      className={`flex flex-col h-screen${theme.ui.glass ? ' sush-glass-ui' : ''}${(settings.lite || terminalSaver) ? ' sush-lite' : ''}${terminalSaver ? ' sush-saver' : ''}${zenMode ? ' sush-focus-mode' : ''}${settings.compactDensity ? ' sush-compact' : ''}`}
      style={{
        ...accentVars(accent),
        ...(theme.ui.glass ? glassVars(theme.ui) : {}),
        // Custom wallpaper sits under everything; bgDim is a dark veil baked
        // into the same background stack so terminal text stays readable.
        background: settings.bgImage
          ? `linear-gradient(rgba(2,3,5,${(settings.bgDim ?? 62) / 100}), rgba(2,3,5,${(settings.bgDim ?? 62) / 100})), url(${JSON.stringify(settings.bgImage)}) center / cover no-repeat fixed, ${theme.xterm.background}`
          : theme.xterm.background
      }}
    >
      {!zenMode && (
        <TitleBar
          accent={accent}
          onSettings={() => setShowSettings(true)}
          sessionCount={runningSessionCount}
          themeId={themeId}
          onThemeChange={(id) => saveSettings({ ...settings, themeId: id })}
          user={identity.currentUser}
          onLock={identity.lock}
          onSignOut={identity.signOut}
          onManageUsers={() => setShowUserManager(true)}
          onViewProfile={() => setShowProfile(true)}
          minimizeToTray={settings.minimizeToTray === true}
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
          onAddToGroup={addToGroup}
          onClearExited={clearExitedSessions}
          onRenameGroup={renameGroup}
          onReorder={reorderTabs}
          onProfiles={() => setShowProfiles(true)}
          onRename={renameTab}
          onDuplicate={duplicateTab}
          renamingId={renamingId}
          onRenameStart={setRenamingId}
          onRenameEnd={() => setRenamingId(null)}
          onHandoff={(id) => setHandoffSource(id)}
          activity={agentStates}
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
            gridMode={gridMode}
            onToggleGrid={() => {
              setGridMode(prev => {
                if (!prev && tabsRef.current.length < 2) return prev
                if (!prev) setView('terminal')
                return !prev
              })
            }}
            settings={settings}
          />
          </div>
          )}

          <div className="flex-1 relative overflow-hidden">
            {(
              // One container for both layouts. Grid mode is a STYLE switch on
              // the same keyed wrappers — terminals never remount on toggle, so
              // xterm buffers survive. Unbooted tabs tile as wake-on-click
              // placeholders (the lazy-boot CPU guard extends into the grid).
              (() => {
                // Grid auto-sizes to the session count: a near-square layout
                // (2 sessions → 1×2, 3-4 → 2×2, 5-9 → 3×3, 10-16 → 4×4). The live
                // tile count is capped by the plan tier (Free 4 / Plus 9 / Pro 16)
                // — also the lazy-boot CPU guard, honest about it via the
                // "showing X of N" note below — so a weak machine isn't asked to
                // paint a wall of WebGL terminals at once.
                const layoutGridMode = gridMode && !zenMode
                const GRID_CAP = entitlements.limit('gridCap') || 4
                const gridTabs = layoutGridMode ? tabs.slice(0, GRID_CAP) : tabs.filter(tab => bootedIds.has(tab.id))
                const n = gridTabs.length
                const cols = layoutGridMode ? Math.max(1, Math.ceil(Math.sqrt(n))) : 1
                return (
                  <div style={layoutGridMode
                    ? { position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: '1fr', gap: 7, padding: 8 }
                    : { position: 'absolute', inset: 0 }}>
                    {gridTabs.map(tab => {
                      const booted = bootedIds.has(tab.id)
                      const baseProfile = profiles.find(p => p.id === tab.profileId) ?? profiles[0]
                      const prof = { ...baseProfile, shell: tab.shell ?? profileShell(baseProfile) }
                      const t = termTheme(getTheme(settings.themeId ?? prof?.themeId))
                      const focused = tab.id === activeId
                      return (
                        <div
                          key={tab.id}
                          onMouseDown={layoutGridMode ? () => {
                            if (!booted) setBootedIds(prev => new Set(prev).add(tab.id))
                            setActiveId(tab.id)
                          } : undefined}
                          style={layoutGridMode
                            ? { position: 'relative', overflow: 'hidden', borderRadius: 10, border: `1px solid ${focused ? rgba(accent, 0.6) : 'rgba(255,255,255,0.08)'}`, boxShadow: focused ? `0 0 0 1px ${rgba(accent, 0.35)}` : 'none', background: wallpaperOnTerminals ? 'transparent' : '#07090b' }
                            : { position: 'absolute', inset: 0 }}
                        >
                          {booted ? (
                            <Terminal
                              tabId={tab.id}
                              theme={t}
                              profile={prof}
                              active={focused}
                              splitVisible={layoutGridMode}
                              initialCwd={tab.cwd}
                              bootCommand={tab.bootCommand}
                              fontSize={layoutGridMode ? Math.max(10, fontSize - 2) : fontSize}
                              fontFamily={fontFamily}
                              cursorStyle={cursorStyle}
                              broadcastTabIds={broadcastMode ? tabs.map(t => t.id) : null}
                              restoreKey={tab.cwd ? `u:${identity.currentUser?.id ?? 'solo'}:${tabKey(tab)}` : null}
                              persistScrollback={settings.persistScrollback !== false}
                              transparentBg={wallpaperOnTerminals}
                              powerSaver={terminalSaver}
                              onSessionState={(state) => handleSessionState(tab.id, state)}
                              onReady={(state) => handleTerminalReady(tab.id, state)}
                              onNewTab={() => openTab(prof, { cwd: tab.cwd, shell: tab.shell })}
                              onCommand={(cmd) => { if (cmd) setCommandHistory(prev => prev.includes(cmd) ? prev : [...prev.slice(-499), cmd]) }}
                              onExport={() => exportSessionOutput(tab.id)}
                            />
                          ) : (
                            <div className="flex items-center justify-center" style={{ position: 'absolute', inset: 0, cursor: 'pointer' }}>
                              <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 12.5, fontWeight: 800, color: '#8a939c' }}>{tab.label}</div>
                                <div style={{ fontSize: 10.5, color: '#5a646d', marginTop: 4 }}>sleeping - click to wake</div>
                              </div>
                            </div>
                          )}
                          {layoutGridMode && (() => {
                            // Live state dot, same classifier the rail uses, so a
                            // tile that needs you (amber) or errored (red) stands
                            // out in the grid without opening Mission Control.
                            const st = tab.status === 'exited' ? null : (booted ? STATES[agentStates[tab.id]] : null)
                            const dot = tab.status === 'exited' ? '#ff5370' : (st?.dot ?? '#42d392')
                            const pulse = st && (agentStates[tab.id] === 'working' || agentStates[tab.id] === 'waiting')
                            return (
                            <div className="flex items-center" style={{ position: 'absolute', top: 6, left: 8, right: 8, zIndex: 60, gap: 7, pointerEvents: 'none' }}>
                              <span className="flex items-center" style={{ gap: 6, padding: '2px 9px', borderRadius: 999, background: 'rgba(5,7,10,0.78)', border: `1px solid ${focused ? rgba(accent, 0.5) : 'rgba(255,255,255,0.1)'}` }}>
                                <span className={pulse ? 'sush-pulse-dot' : undefined} title={st?.label} style={{ width: 6, height: 6, borderRadius: '50%', background: dot, '--pulse': rgba(dot, 0.6) }} />
                                <span style={{ fontSize: 10, fontWeight: 800, color: focused ? accent : '#aab3bb', whiteSpace: 'nowrap' }}>{tab.label}</span>
                              </span>
                              <span style={{ flex: 1 }} />
                              <button
                                onClick={(e) => { e.stopPropagation(); setActiveId(tab.id); setGridMode(false) }}
                                title="Maximize"
                                className="flex items-center justify-center"
                                style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(5,7,10,0.78)', color: '#aab3bb', cursor: 'pointer', pointerEvents: 'auto' }}
                              >
                                <Icon name="maximize" size={11} strokeWidth={2.2} />
                              </button>
                            </div>
                            )
                          })()}
                        </div>
                      )
                    })}
                    {layoutGridMode && tabs.length > GRID_CAP && (
                      <div style={{ position: 'absolute', bottom: 10, right: 14, zIndex: 70, fontSize: 10.5, fontWeight: 700, color: '#8a939c', background: 'rgba(5,7,10,0.85)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, padding: '4px 12px' }}>
                        showing {GRID_CAP} of {tabs.length} (CPU guard)
                      </div>
                    )}
                  </div>
                )
              })()
            )}

            {view === 'home' && (
              <div key="home-view" className="sush-reveal" style={{ position: 'absolute', inset: 0 }}>
              <HomeDashboard
                tabs={tabs}
                recentSessions={recentSessions}
                smartResult={smartResult}
                accent={accent}
                homeView={homeView}
                userName={identity.currentUser?.name}
                pinnedProjects={pinnedProjects}
                onTogglePin={togglePinnedProject}
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
              seduciaScope={seduciaScope}
              seduciaControls={seduciaControls}
              onLaunch={launchSessions}
              onRun={runSmartInput}
              onPrompt={sendAgentPrompt}
              onFocus={focusAgent}
              onOpenLauncher={() => setShowLauncher(true)}
              onClose={() => setRightOpen(false)}
              onNewTab={(options) => openTab(profiles[0], options)}
              settings={settings}
              commandHistory={commandHistory}
              ghNotifCount={ghNotifCount}
              onManageUsers={() => setShowUserManager(true)}
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
          workspaceCount={new Set(tabs.map(t => t.groupId).filter(Boolean)).size}
          broadcastMode={broadcastMode}
          gridMode={gridMode}
          agentSummary={agentSummary}
          onOpenMission={() => setShowMission(true)}
          battery={battery}
          saverActive={terminalSaver}
          saverAuto={autoSaverActive || quietHoursActive}
          saverReason={quietHoursActive ? 'quiet' : autoSaverActive ? 'battery' : settings.powerSaver ? 'manual' : zenMode ? 'focus' : ''}
          online={online}
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
          scope={seduciaScope}
          controls={seduciaControls}
          onLaunch={launchSessions}
          onRun={runSmartInput}
          onPrompt={sendAgentPrompt}
          onFocus={focusAgent}
          onOpenLauncher={() => setShowLauncher(true)}
          settings={settings}
          working={agentSummary?.working || 0}
        />
      )}

      {/* Hush — dictation into the focused terminal (Ctrl+Shift+S) */}
      {identity.ready && settings.hushEnabled !== false && (
        <Hush
          accent={accent}
          autoSend={settings.hushAutoSend !== false}
          onInsert={(text) => {
            const id = activeIdRef.current
            const tab = tabsRef.current.find(t => t.id === id)
            if (view === 'terminal' && tab && tab.status !== 'exited') {
              const send = settings.hushAutoSend !== false
              window.sush.ptyInput({ tabId: id, data: send ? `${text}\r` : text })
            } else {
              window.sush.copyText?.(text)
            }
          }}
        />
      )}

      {zenMode && (
        <button
          onClick={() => setZenMode(false)}
          title="Exit Focus Mode (Ctrl+Shift+Z)"
          style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 200, padding: '6px 14px', background: 'rgba(0,0,0,0.7)', border: `1px solid ${rgba(accent, 0.4)}`, borderRadius: 8, color: accent, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
        >
          Exit Focus
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
          onEditSushrc={() => { setShowSettings(false); setShowSushrc(true) }}
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
          limits={agentLimits}
          summary={agentSummary}
          metrics={sessionMetrics}
          onFocus={(id) => { setActiveId(id); setView('terminal'); setShowMission(false) }}
          onClose={closeTab}
          onCloseGroup={closeGroup}
          onPrompt={promptSession}
          onSwitchResume={switchAndResume}
          onDismiss={() => setShowMission(false)}
        />
      )}

      {aliasSuggestion && !nudgeHidden && !zenMode && view === 'terminal' && (
        <AliasNudge
          suggestion={aliasSuggestion}
          accent={accent}
          onAccept={acceptAlias}
          onDismiss={dismissAlias}
          onClose={() => setNudgeHidden(true)}
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

      {showUserManager && (
        <UserManager
          users={identity.users}
          currentUser={identity.currentUser}
          accent={accent}
          onClose={() => setShowUserManager(false)}
          onChanged={identity.refresh}
          onRemove={identity.removeUser}
        />
      )}

      {showProfile && (
        <ProfileViewer
          user={identity.currentUser}
          accent={accent}
          onClose={() => setShowProfile(false)}
          onChanged={identity.refresh}
          onLock={identity.lock}
          onSignOut={identity.signOut}
          onManageUsers={() => { setShowProfile(false); setShowUserManager(true) }}
          onDeleteAccount={async (id) => {
            // Deleting the signed-in account: remove it, then sign out to the
            // picker (the session belonged to an identity that no longer exists).
            await identity.removeUser(id, false)
            identity.signOut()
          }}
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

      {/* Idle sleep — solid cover so the GPU can skip everything beneath */}
      {sleeping && (
        <div className="flex items-center justify-center" style={{ position: 'fixed', inset: 0, zIndex: 6000, background: '#020305', cursor: 'pointer' }}>
          <div style={{ textAlign: 'center', userSelect: 'none' }}>
            <div className="sush-sleep-breathe" style={{ width: 46, height: 46, margin: '0 auto 14px', borderRadius: '50%', background: `radial-gradient(circle at 32% 28%, ${rgba(accent, 0.55)}, ${rgba(accent, 0.12)})`, border: `1px solid ${rgba(accent, 0.3)}` }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: '#aab3bb' }}>Sush is resting</div>
            <div style={{ fontSize: 11, color: '#5a646d', marginTop: 5 }}>Sessions keep running - press any key to wake</div>
          </div>
        </div>
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
    </Suspense>
  )
}
