import React, { Suspense, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import ProfileManager, { useProfiles } from './components/ProfileManager'
import Settings from './components/Settings'
import HomeDashboard from './components/HomeDashboard'
import NewSessionModal from './components/NewSessionModal'
import RightPanel from './components/RightPanel'
import SeduciaOrb from './components/SeduciaOrb'
import Hush from './components/Hush'
import AliasNudge from './components/AliasNudge'
import CommandPalette from './components/CommandPalette'
import ShortcutsHelp from './components/ShortcutsHelp'
import HandoffModal from './components/HandoffModal'
import HuntOverlay from './components/HuntOverlay'
import SushrcEditor from './components/SushrcEditor'
import QuickSwitcher from './components/QuickSwitcher'
import SplashScreen from './components/SplashScreen'
import LockScreen from './components/LockScreen'
import UserManager from './components/UserManager'
import ProfileViewer from './components/ProfileViewer'
import PlansPage from './components/PlansPage'
import ChangelogPage from './components/ChangelogPage'
import { LATEST_VERSION } from './lib/changelog'
import { useIdentity } from './hooks/useIdentity'
import { usePolling } from './hooks/usePolling'
import { allThemes, getTheme } from './themes'
import { parseStoredObject } from './lib/storage'
import { agentById, MAX_SESSIONS, LOGIN_COMMANDS } from './lib/agents'
import { loadCrews, crewToAgents } from './lib/crews'
import { runningTargets as seduciaTargets } from './lib/seducia'
import { accentVars, glassVars, rgba } from './lib/ui'
import { useAgentActivity } from './hooks/useAgentActivity'
import { useEntitlements } from './hooks/useEntitlements'
import { useBattery } from './hooks/useBattery'
import { useOnline } from './hooks/useOnline'
import { STATES, stripAnsi } from './lib/agentActivity'
import { useAutoAlias } from './hooks/useAutoAlias'
import { useSplitView } from './hooks/useSplitView'
import { useUsageGuard } from './hooks/useUsageGuard'
import { recordCommand } from './lib/commandFrequency'
import { perfModeOf, withPerfMode, isFeather, withFeather } from './lib/power'
import { cliComplete } from './lib/ai'
import { buildDigestMarkdown, digestSummaryPrompt } from './lib/digest'
import { countersAfterTabs } from './lib/sessionIds'
import { canHandleGlobalShortcut } from './lib/shortcutGuard'
import { isSensitiveCommand } from './lib/commandPrivacy'
import { downloadText, stampedFileName } from './lib/download'
import JsonViewer from './components/JsonViewer'
import Icon from './components/Icons'
import NightlyWorkspaceRail from './components/NightlyWorkspaceRail'
import NightlyTopbar from './components/NightlyTopbar'
import NightlyComposer from './components/NightlyComposer'
import NightlyOverview from './components/NightlyOverview'
import { buildAgentCommand, normalizeEffort, normalizeModel } from './lib/nightlyModels'
import { useNightlyProviderMeta } from './hooks/useNightlyProviderMeta'

// xterm (and its GPU renderer) is by far the heaviest part of Sush. The app
// opens on Home and restores terminals only on demand, so keep that code out
// of the first renderer payload until a terminal is actually shown.
const Terminal = React.lazy(() => import('./components/Terminal'))

const RECENT_SESSIONS_KEY = 'sush-recent-sessions'
const OLD_COMMAND_RECENTS_KEY = 'sush-recents'
const SESSION_LAYOUT_KEY = 'sush-session-layout'
const LAST_HOME_VIEW_KEY = 'sush-last-home-view'
const COMMAND_HISTORY_KEY = 'sush-command-history'
const PINNED_PROJECTS_KEY = 'sush-pinned-projects'
const NIGHTLY_WORKSPACE_UI_KEY = 'sush-nightly-workspace-ui'
const MAX_RECENT_SESSIONS = 8

function loadCommandHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(COMMAND_HISTORY_KEY) ?? '[]')
    return Array.isArray(saved)
      ? saved.filter(x => typeof x === 'string' && !isSensitiveCommand(x)).slice(-500)
      : []
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

function loadNightlyWorkspaceUi() {
  try {
    const saved = JSON.parse(localStorage.getItem(NIGHTLY_WORKSPACE_UI_KEY) ?? '{}')
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
  } catch {
    return {}
  }
}

function saveNightlyWorkspaceUi(map) {
  try { localStorage.setItem(NIGHTLY_WORKSPACE_UI_KEY, JSON.stringify(map || {})) } catch {}
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

function nightlyWorkspaceKey(tab) {
  if (!tab) return null
  const cwd = normalizePathKey(tab.workspaceCwd || tab.cwd)
  if (cwd) return `cwd:${cwd}`
  if (tab.groupId) return `group:${tab.groupId}`
  return tab.id ? `tab:${tab.id}` : null
}

function nightlySessionKey(tab) {
  if (!tab) return null
  if (tab.tag) return `tag:${tab.tag}`
  if (tab.startedAt) return `started:${tab.startedAt}`
  return tabKey(tab)
}

function tabKey(tab) {
  if (!tab) return 'none'
  const shell = tab.shell || 'powershell'
  const profileId = tab.profileId || 'powershell'
  const cwd = normalizePathKey(tab.sessionRootCwd || tab.cwd)
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
    workspaceCwd: options.workspaceCwd ?? cwd,
    sessionRootCwd: options.sessionRootCwd ?? cwd,
    bootCommand: options.command ?? null,
    agentId: options.agentId ?? null,
    model: options.model ?? null,
    effort: options.effort ?? null,
    tag: options.tag ?? null,
    groupId: options.groupId ?? null,
    groupLabel: options.groupLabel ?? null,
    status: options.status ?? 'new',
    startedAt: options.startedAt ?? now,
    lastActiveAt: options.lastActiveAt ?? now
  }
}

function loadSettings() {
  return parseStoredObject(localStorage.getItem('sush-settings'))
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
  if (agent) return buildAgentCommand(agent, { model: item.model, effort: item.effort, resume: true }) ?? item.bootCommand ?? null
  return item.bootCommand ?? null
}

function loadSessionLayout(profiles) {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_LAYOUT_KEY) ?? '{}')
    if (!Array.isArray(saved.tabs) || !saved.tabs.length) throw new Error('empty layout')

    // Honour the "resume agent sessions on launch" setting (default on).
    const resumeAgents = loadSettings().resumeAgents !== false

    // Cap matches MAX_SESSIONS — a lower literal here silently dropped tabs
    // of a full swarm on restart (first at 12, then again at 16 once Max sold
    // a 25-session grid). Restored tabs are lazy-booted, so a big layout is
    // cheap until tiles are actually viewed.
    const tabs = dedupeTabs(saved.tabs.slice(0, MAX_SESSIONS).map(item => {
      const profile = profiles.find(p => p.id === item.profileId) ?? profiles[0]
      return makeTab(profile, {
        label: item.label,
        profileId: item.profileId,
        profileLabel: item.profileLabel,
        shell: item.shell,
        shellLabel: item.shellLabel,
        cwd: item.sessionRootCwd ?? item.cwd,
        workspaceCwd: item.workspaceCwd ?? item.sessionRootCwd ?? item.cwd,
        sessionRootCwd: item.sessionRootCwd ?? item.cwd,
        command: resumeAgents ? restoreBootCommand(item) : null,
        agentId: item.agentId,
        model: item.model,
        effort: item.effort,
        tag: item.tag,
        groupId: item.groupId,
        groupLabel: item.groupLabel,
        status: 'new',
        startedAt: item.startedAt,
        lastActiveAt: item.lastActiveAt
      })
    }))
    const counters = countersAfterTabs(tabs)
    nextTabId = Math.max(nextTabId, counters.tab)
    nextSessionTag = Math.max(nextSessionTag, counters.sessionTag)
    nextGroupId = Math.max(nextGroupId, counters.group)
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
  const initialLayout = useRef(null)
  if (initialLayout.current === null) initialLayout.current = loadSessionLayout(profiles)
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
  // Performance ladder (lib/power): full < reduced < saver < eco, each rung
  // including the ones below. Legacy boolean settings map through perfModeOf,
  // so pre-ladder installs keep their behavior with no migration step.
  const perfMode = perfModeOf(settings)
  const ecoMode = perfMode === 'eco'
  const manualSaver = perfMode === 'saver' || ecoMode
  const reducedFx = perfMode !== 'full'
  // Auto power-saver: when running on battery below the threshold, conserve even
  // if the user never raised the ladder. Charging or above threshold, only the
  // user's chosen rung applies. On by default — this user has no grid.
  const battery = useBattery({ saver: manualSaver })
  const AUTO_SAVER_AT = 20
  const autoSaverActive = settings.autoPowerSaver !== false && battery.hasBattery && !battery.charging && battery.percent <= AUTO_SAVER_AT
  const [quietHoursActive, setQuietHoursActive] = useState(() => quietHoursNow(loadSettings()))
  const effectiveSaver = manualSaver || autoSaverActive || quietHoursActive
  const [recentSessions, setRecentSessions] = useState(loadRecentSessions)
  const [smartBusy, setSmartBusy] = useState(false)
  const [smartResult, setSmartResult] = useState(null)
  const [zenMode, setZenMode] = useState(false)
  const terminalSaver = effectiveSaver || zenMode
  const [showPalette, setShowPalette] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showUserManager, setShowUserManager] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showPlans, setShowPlans] = useState(false)   // standalone pricing page
  const [showChangelog, setShowChangelog] = useState(false)

  // Any surface can open the Plans / Changelog pages (Settings, palette, hints).
  useEffect(() => {
    const openPlans = () => setShowPlans(true)
    const openChangelog = () => setShowChangelog(true)
    window.addEventListener('sush:open-plans', openPlans)
    window.addEventListener('sush:open-changelog', openChangelog)
    return () => {
      window.removeEventListener('sush:open-plans', openPlans)
      window.removeEventListener('sush:open-changelog', openChangelog)
    }
  }, [])

  // "What's New" once after an update: if the last version this user saw
  // differs from the current one (and it isn't their first ever launch),
  // open the changelog a single time, then remember the version. First run
  // just records the version silently — no release notes for a fresh install.
  useEffect(() => {
    if (!identity.ready) return
    let seen
    try { seen = localStorage.getItem('sush-last-seen-version') } catch {}
    if (seen && seen !== LATEST_VERSION) setShowChangelog(true)
    try { localStorage.setItem('sush-last-seen-version', LATEST_VERSION) } catch {}
  }, [identity.ready])

  // Command history persists per user (scoped storage) so it survives restarts.
  const [commandHistory, setCommandHistory] = useState(loadCommandHistory)
  const [pinnedProjects, setPinnedProjects] = useState(loadPinnedProjects)
  // Saved snippets surface in the command palette (they moved out of the
  // sidebar); loaded from the shared ~/.sush/snippets.json store, refreshed
  // whenever the palette opens so a just-saved snippet appears.
  const [snippets, setSnippets] = useState([])
  useEffect(() => {
    if (!showPalette) return
    window.sush?.snippetsList?.().then(r => { if (r?.ok) setSnippets(r.snippets || []) }).catch(() => {})
  }, [showPalette])
  const [broadcastMode, setBroadcastMode] = useState(false)
  // Broadcast scope: 'all' types into every session; 'workspace' fences it to
  // the active session's workspace (its groupId) so briefing one crew can't
  // leak keystrokes into another.
  const [broadcastScope, setBroadcastScope] = useState('all')
  const [showHunt, setShowHunt] = useState(false)
  const [gridMode, setGridMode] = useState(false)   // all booted sessions tiled
  const [rightWidth, setRightWidth] = useState(() => parseInt(localStorage.getItem('sush-right-width') || '360', 10))
  const [paneDock, setPaneDock] = useState('right')
  const [bottomPaneHeight, setBottomPaneHeight] = useState(() => parseInt(localStorage.getItem('sush-bottom-pane-height') || '300', 10))
  const [renamingId, setRenamingId] = useState(null)
  const [handoffSource, setHandoffSource] = useState(null)
  const [showSushrc, setShowSushrc] = useState(false)
  const [switcher, setSwitcher] = useState(null)  // { order:[ids], index } when open
  // Skip the splash on unlock/user-switch reloads — the user just watched the
  // lock screen's exit animation; replaying the boot splash on top of it made
  // unlocking feel like a cold start. (sessionStorage survives reloads.)
  const [splash, setSplash] = useState(() => {
    try {
      if (sessionStorage.getItem('sush-skip-splash')) {
        sessionStorage.removeItem('sush-skip-splash')
        return false
      }
    } catch {}
    return true
  })
  const [mounted, setMounted] = useState(false)
  const [sleeping, setSleeping] = useState(false)
  const blockingShortcutSurface = Boolean(
    showProfiles || showSettings || showLauncher || showPalette || showShortcuts ||
    showUserManager || showProfile || showPlans || showChangelog ||
    showHunt || handoffSource || showSushrc || splash || sleeping
  )
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

  // Shared activity clock: when the user last touched the app. Tracked
  // unconditionally (the listeners are passive and cheap) because BOTH idle
  // sleep and quiet hours consult it — quiet hours must not force sleep while
  // someone is deliberately working at night.
  const lastActivityRef = useRef(Date.now())
  useEffect(() => {
    const bump = () => { lastActivityRef.current = Date.now() }
    let lastMove = 0
    const onMove = () => { const now = Date.now(); if (now - lastMove > 1000) { lastMove = now; bump() } }
    window.addEventListener('keydown', bump, { passive: true, capture: true })
    window.addEventListener('pointerdown', bump, { passive: true, capture: true })
    window.addEventListener('wheel', bump, { passive: true, capture: true })
    window.addEventListener('pointermove', onMove, { passive: true, capture: true })
    return () => {
      window.removeEventListener('keydown', bump, { capture: true })
      window.removeEventListener('pointerdown', bump, { capture: true })
      window.removeEventListener('wheel', bump, { capture: true })
      window.removeEventListener('pointermove', onMove, { capture: true })
    }
  }, [])

  useEffect(() => {
    // Quiet hours only force sleep once the user has actually gone idle —
    // the previous unconditional setSleeping(true) re-slept the app every
    // 60s tick, fighting anyone typing mid-quiet-hours.
    const QUIET_IDLE_MS = 2 * 60_000
    const sync = () => {
      const active = quietHoursNow(settings)
      setQuietHoursActive(active)
      if (active && Date.now() - lastActivityRef.current >= QUIET_IDLE_MS) setSleeping(true)
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
  // process one. Any key, click, or mouse move wakes it. (Activity itself is
  // tracked by the shared clock above.)
  useEffect(() => {
    const mins = Number(settings.idleSleepMinutes ?? 10)
    if (!mins) return
    const timer = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= mins * 60000) setSleeping(true)
    }, 15000)
    return () => clearInterval(timer)
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
    const rootCwd = session?.workspaceCwd || session?.cwd
    if (!rootCwd) return

    const record = normalizeRecentSession({
      cwd: rootCwd,
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

  // Nightly workspace UI is keyed by the stable project root. Hydration lives
  // beside the layout hooks below so pane + snap-layout state move together.
  const activeNightlyWorkspaceKey = nightlyWorkspaceKey(activeTab)
  const activeWorkspaceTabs = activeNightlyWorkspaceKey
    ? tabs.filter(t => nightlyWorkspaceKey(t) === activeNightlyWorkspaceKey)
    : []

  const nightlyProviderMeta = useNightlyProviderMeta(view === 'terminal' ? activeTab : null, !zenMode)
  const activeProfile = profiles.find(p => p.id === activeTab?.profileId) ?? profiles[0]
  const runningSessionCount = tabs.filter(t => t.status === 'running').length

  // Broadcast targets, honouring the scope. Workspace scope with no workspace
  // on the active session falls back to all (a solo session has no fence).
  const broadcastTargets = broadcastMode
    ? (broadcastScope === 'workspace' && activeTab?.groupId
        ? tabs.filter(t => t.groupId === activeTab.groupId)
        : tabs).map(t => t.id)
    : null

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
        cwd: activeTab.workspaceCwd || activeTab.cwd || null,
        focusedLabel
      }
    }
    return { kind: 'main', focusedLabel }
  }, [view, activeTab?.groupId, activeTab?.groupLabel, activeTab?.cwd, activeTab?.label])

  // Nightly workspace activity: live per-session state inferred from the PTY stream.
  const { states: agentStates, limits: agentLimits, summary: agentSummary } = useAgentActivity(tabs, { notify: settings.agentNotifications !== false && !ecoMode, powerSaver: terminalSaver })
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
  usePolling(pollSessionMetrics, 5000, view === 'overview' && settings.sessionResourceMeter === true && !terminalSaver)
  useEffect(() => {
    if (!settings.sessionResourceMeter || terminalSaver || view !== 'overview') setSessionMetrics({})
  }, [settings.sessionResourceMeter, terminalSaver, view])

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
  const wallpaperOnTerminals = !!settings.bgImage && settings.terminalWallpaper === true && !ecoMode
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
      if (!canHandleGlobalShortcut(identity.ready, blockingShortcutSurface)) return
      // Cmd on macOS too — lib/keymap already swallows Ctrl/Cmd +/-/0 from the
      // terminal, so a ctrlKey-only check left Cmd+= a dead chord on Mac.
      if (!e.ctrlKey && !e.metaKey) return
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
  }, [settings, identity.ready, blockingShortcutSurface])

  // Window opacity is an OS-level window property (main calls setOpacity), not
  // a CSS opacity on the root — the latter faded the terminal text itself.
  useEffect(() => {
    window.sush.setOpacity?.((settings.opacity ?? 100) / 100)
  }, [settings.opacity])

  // Windows 11 window material (Mica/Acrylic): when on with no wallpaper, the
  // base canvas goes translucent (via the .sush-material rule) so the OS
  // material shows through. Off (default) or with a wallpaper set, the canvas
  // stays fully painted. Must live with the other hooks — above the identity
  // gate's early returns — so hook order never changes between renders.
  const materialActive = window.sush?.platform === 'win32' &&
    ['mica', 'acrylic'].includes(settings.windowMaterial) && !settings.bgImage
  useEffect(() => {
    document.documentElement.classList.toggle('sush-material', !!materialActive)
    window.sush?.setWindowMaterial?.(materialActive ? settings.windowMaterial : 'none')
  }, [materialActive, settings.windowMaterial])

  const openRight = useCallback((tab) => {
    setRightTab(tab)
    setRightOpen(true)
  }, [])

  // NOTE: every chord handled below (and in the session-shortcut effect
  // further down) must be registered in lib/keymap.js — that's the one list
  // useTerminal consults to keep these keys out of the PTY.
  useEffect(() => {
    const handler = (e) => {
      if (!canHandleGlobalShortcut(identity.ready, blockingShortcutSurface)) return
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
      // Ctrl+Shift+M → Nightly Overview (Ctrl+M alone is Enter in a terminal)
      if (ctrl && e.shiftKey && key === 'm') {
        e.preventDefault()
        setView(prev => prev === 'overview' ? 'terminal' : 'overview')
      }
      // Ctrl+Shift+S → Hush dictation toggle
      if (ctrl && e.shiftKey && key === 's') { e.preventDefault(); window.dispatchEvent(new CustomEvent('sush:hush-toggle')) }
      // Ctrl+Shift+F → Hunt overlay (cross-session output search)
      if (ctrl && e.shiftKey && key === 'f') { e.preventDefault(); setShowHunt(prev => !prev) }
      // Ctrl+Shift+E → power saver (energy) toggle: hops the perf ladder
      // between Saver and Full. Persist inline (setSettings alone is lost on
      // restart).
      if (ctrl && e.shiftKey && key === 'e') {
        e.preventDefault()
        setSettings(prev => {
          const cur = perfModeOf(prev)
          const next = withPerfMode(prev, (cur === 'saver' || cur === 'eco') ? 'full' : 'saver')
          try { localStorage.setItem('sush-settings', JSON.stringify(next)) } catch {}
          return next
        })
      }
      // Ctrl+Shift+G → grid layout (all sessions tiled)
      if (ctrl && e.shiftKey && key === 'g') {
        e.preventDefault()
        toggleWorkspaceGrid()
      }
      // Ctrl+Shift+D → duplicate active tab
      if (ctrl && e.shiftKey && key === 'd') { e.preventDefault(); if (activeIdRef.current) duplicateTab(activeIdRef.current) }
      // Ctrl+\ → toggle 2-up split (active + most recent other session)
      if (ctrl && e.key === '\\') { e.preventDefault(); toggleWorkspaceSplit() }
      // Ctrl+T → new tab (Shift variant = reopen-closed, handled separately)
      if (ctrl && key === 't' && !e.shiftKey) { e.preventDefault(); openTab(profiles[0]) }
      // Ctrl+W → close active tab
      if (ctrl && key === 'w' && !e.shiftKey) { e.preventDefault(); if (activeIdRef.current) closeTabRef.current?.(activeIdRef.current) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [rightTab, profiles, identity.ready, blockingShortcutSurface])

  // F2 → rename active session. Ctrl+Tab → MRU quick switcher (hold Ctrl, tap Tab).
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!canHandleGlobalShortcut(identity.ready, blockingShortcutSurface)) return
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
      if (!canHandleGlobalShortcut(identity.ready, blockingShortcutSurface)) return
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
  }, [identity.ready, blockingShortcutSurface])

  useEffect(() => { localStorage.setItem('sush-right-open', rightOpen ? '1' : '0') }, [rightOpen])
  useEffect(() => { localStorage.setItem('sush-right-tab', rightTab) }, [rightTab])
  useEffect(() => { localStorage.setItem('sush-right-width', String(rightWidth)) }, [rightWidth])
  useEffect(() => { localStorage.setItem('sush-bottom-pane-height', String(bottomPaneHeight)) }, [bottomPaneHeight])

  // Panel resize. The teardown is kept in a ref and also run on unmount: a drag
  // that was still in progress when the panel closed (or the app hot-reloaded)
  // left a mousemove handler bound to `window` forever, calling setState on an
  // unmounted tree and re-widening the panel on the next unrelated drag.
  const rightDragCleanup = useRef(null)
  useEffect(() => () => { rightDragCleanup.current?.() }, [])

  const startRightDrag = useCallback((e) => {
    e.preventDefault()
    rightDragCleanup.current?.()
    const startX = e.clientX
    const startWidth = rightWidth
    const onMove = (ev) => {
      const delta = startX - ev.clientX
      setRightWidth(Math.max(280, Math.min(700, startWidth + delta)))
    }
    const stop = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('blur', stop)
      rightDragCleanup.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', stop)
    // Alt-tabbing mid-drag never delivers a mouseup — without this the panel
    // kept resizing when you came back and moved the mouse.
    window.addEventListener('blur', stop)
    rightDragCleanup.current = stop
  }, [rightWidth])

  const startBottomPaneDrag = useCallback((e) => {
    e.preventDefault()
    rightDragCleanup.current?.()
    const startY = e.clientY
    const startHeight = bottomPaneHeight
    const onMove = (ev) => {
      const delta = startY - ev.clientY
      const max = Math.max(220, Math.round(window.innerHeight * 0.58))
      setBottomPaneHeight(Math.max(180, Math.min(max, startHeight + delta)))
    }
    const stop = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('blur', stop)
      rightDragCleanup.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', stop)
    window.addEventListener('blur', stop)
    rightDragCleanup.current = stop
  }, [bottomPaneHeight])

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
        workspaceCwd: tab.workspaceCwd || tab.cwd,
        sessionRootCwd: tab.sessionRootCwd || tab.cwd,
        bootCommand: tab.bootCommand,
        agentId: tab.agentId,
        model: tab.model,
        effort: tab.effort,
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

  // Download the active session's recent output — plain text, or a Markdown
  // transcript (metadata header + fenced output) ready to paste into an issue,
  // PR, or note.
  const exportSessionOutput = useCallback(async (tabId, format = 'txt') => {
    const id = tabId ?? activeIdRef.current
    const tab = tabsRef.current.find(t => t.id === id)
    if (!tab) return
    try {
      const res = await window.sush.getScrollback({ tabId: id, chars: 60000 })
      const text = res?.text || ''
      const md = format === 'md'
      const body = md
        ? [
            `# Sush session — ${tab.label || 'session'}`,
            '',
            `| | |`,
            `|---|---|`,
            `| Directory | \`${tab.cwd || 'unknown'}\` |`,
            `| Agent | ${tab.agentId || 'shell'} |`,
            `| Exported | ${new Date().toLocaleString()} |`,
            '',
            '```text',
            (text || '(no captured output)').replace(/```/g, '``​`'),
            '```',
            ''
          ].join('\n')
        : (text || '(no captured output)')
      downloadText(
        body,
        stampedFileName(tab.label, md ? 'md' : 'txt'),
        md ? 'text/markdown' : 'text/plain'
      )
    } catch {}
  }, [])

  // Copy the active session's recent output straight to the clipboard.
  const copySessionOutput = useCallback(async (tabId) => {
    const id = tabId ?? activeIdRef.current
    if (!id) return
    try {
      const res = await window.sush.getScrollback({ tabId: id, chars: 20000 })
      await window.sush.copyText(res?.text || '')
    } catch {}
  }, [])

  // ── Workspace digest ───────────────────────────────────────────────────────
  // One action: read every session in a workspace (or the solo sessions when
  // groupId is null), have the logged-in CLI summarize the crew's state, and
  // save a markdown "crew report" — reuses the scrollback tails and the same
  // download path as the session export. The AI summary is best-effort; the
  // report still ships with verbatim tails when no CLI is available.
  const [digestBusy, setDigestBusy] = useState(false)
  const buildWorkspaceDigest = useCallback(async (groupId) => {
    if (digestBusy) return
    const pool = groupId
      ? tabsRef.current.filter(t => t.groupId === groupId)
      : tabsRef.current.filter(t => !t.groupId)
    const members = pool.slice(0, 8)
    if (!members.length) return
    setDigestBusy(true)
    try {
      const sessions = await Promise.all(members.map(async (t) => {
        let text = ''
        try { text = (await window.sush.getScrollback({ tabId: t.id, chars: 4000 }))?.text || '' } catch {}
        return { label: t.label, agentId: t.agentId || 'shell', text: stripAnsi(text) }
      }))
      const label = members[0].groupLabel || (groupId ? 'Workspace' : 'Solo sessions')
      const anchor = members.find(t => t.workspaceCwd || t.sessionRootCwd || t.cwd)
      const cwd = anchor?.workspaceCwd || anchor?.sessionRootCwd || anchor?.cwd || null
      let summary = null
      try { summary = await cliComplete(digestSummaryPrompt(label, sessions), { cwd: cwd || undefined }) } catch {}
      const md = buildDigestMarkdown({ label, cwd, sessions, summary })
      downloadText(md, stampedFileName(label, 'md', 'sush-digest'), 'text/markdown')
      window.sush.copyText?.(md).catch(() => {})
    } finally {
      setDigestBusy(false)
    }
  }, [digestBusy])

  // 2-up split (Ctrl+\): state + toggle live in useSplitView.
  const { splitId, setSplitId } = useSplitView({ tabs, tabsRef, mruRef, activeIdRef, setBootedIds, setView })

  const currentWorkspaceTabs = useCallback(() => {
    const anchor = tabsRef.current.find(t => t.id === activeIdRef.current)
    const key = nightlyWorkspaceKey(anchor)
    return key ? tabsRef.current.filter(t => nightlyWorkspaceKey(t) === key) : []
  }, [])

  const toggleWorkspaceSplit = useCallback(() => {
    setSplitId(prev => {
      if (prev) return null
      const activeNow = activeIdRef.current
      const eligible = currentWorkspaceTabs().filter(t => t.id !== activeNow)
      const partnerId = mruRef.current.find(id => eligible.some(t => t.id === id)) || eligible[0]?.id
      if (!partnerId) return null
      setBootedIds(prevBooted => prevBooted.has(partnerId) ? prevBooted : new Set(prevBooted).add(partnerId))
      setView('terminal')
      return partnerId
    })
  }, [currentWorkspaceTabs, setSplitId])

  const toggleWorkspaceGrid = useCallback(() => {
    setSplitId(null)
    setGridMode(prev => {
      if (!prev && currentWorkspaceTabs().length < 2) return prev
      setView('terminal')
      return !prev
    })
  }, [currentWorkspaceTabs, setSplitId])


  // Pane + snap-layout state is remembered per project. Split stores a stable
  // tabKey rather than a runtime tab id so a restored workspace can reconstruct
  // the same pair after session ids are regenerated.
  const nightlyWorkspaceUiRef = useRef(null)
  const nightlyWorkspaceUiHydratingRef = useRef(false)

  useEffect(() => {
    const key = activeNightlyWorkspaceKey
    if (!key) return

    const map = loadNightlyWorkspaceUi()
    const previousKey = nightlyWorkspaceUiRef.current

    if (previousKey && previousKey !== key) {
      const previousTabs = tabsRef.current.filter(t => nightlyWorkspaceKey(t) === previousKey)
      const previousPartner = splitId
        ? previousTabs.find(t => t.id === splitId)
        : null
      map[previousKey] = {
        ...(map[previousKey] || {}),
        tab: rightTab,
        open: rightOpen,
        dock: paneDock,
        layout: gridMode && previousTabs.length > 1
          ? 'grid'
          : previousPartner
            ? 'split'
            : 'focus',
        splitKey: previousPartner ? nightlySessionKey(previousPartner) : null
      }
    }

    nightlyWorkspaceUiRef.current = key
    nightlyWorkspaceUiHydratingRef.current = true
    saveNightlyWorkspaceUi(map)

    const saved = map[key]
    if (saved) {
      setRightTab(typeof saved.tab === 'string' ? saved.tab : 'agent')
      setRightOpen(saved.open === true)
      setPaneDock(saved.dock === 'bottom' ? 'bottom' : 'right')
    } else {
      setRightTab('agent')
      setRightOpen(false)
      setPaneDock('right')
    }

    const scopedTabs = tabsRef.current.filter(t => nightlyWorkspaceKey(t) === key)
    if (saved?.layout === 'grid' && scopedTabs.length > 1) {
      setSplitId(null)
      setGridMode(true)
      return
    }

    if (saved?.layout === 'split' && scopedTabs.length > 1) {
      const activeNow = activeIdRef.current
      const partner = scopedTabs.find(t => t.id !== activeNow && nightlySessionKey(t) === saved.splitKey)
        || scopedTabs.find(t => t.id !== activeNow)
      if (partner) {
        setGridMode(false)
        setSplitId(partner.id)
        setBootedIds(prev => prev.has(partner.id) ? prev : new Set(prev).add(partner.id))
        return
      }
    }

    setGridMode(false)
    setSplitId(null)
  // Workspace changes are the hydration boundary. UI state changes are saved
  // by the effect below and must not re-run hydration.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNightlyWorkspaceKey])

  useEffect(() => {
    if (nightlyWorkspaceUiHydratingRef.current) {
      nightlyWorkspaceUiHydratingRef.current = false
      return
    }

    const key = nightlyWorkspaceUiRef.current
    if (!key) return
    const scopedTabs = tabsRef.current.filter(t => nightlyWorkspaceKey(t) === key)
    const partner = splitId ? scopedTabs.find(t => t.id === splitId) : null
    const map = loadNightlyWorkspaceUi()
    map[key] = {
      ...(map[key] || {}),
      tab: rightTab,
      open: rightOpen,
      dock: paneDock,
      layout: gridMode && scopedTabs.length > 1
        ? 'grid'
        : partner
          ? 'split'
          : 'focus',
      splitKey: partner ? nightlySessionKey(partner) : null
    }
    saveNightlyWorkspaceUi(map)
  }, [activeNightlyWorkspaceKey, rightTab, rightOpen, paneDock, gridMode, splitId])

  useEffect(() => {
    const current = tabs.find(t => t.id === activeId)
    if (current?.cwd) rememberSession(current)
  }, [activeId, rememberSession, tabs])

  const selectTab = useCallback((id) => {
    // The workspace hydration effect owns layout transitions. Leaving the old
    // Split/Grid state intact for this render lets it persist the outgoing
    // project before applying the incoming project's saved/default preset.
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
    window.sush.newTab({ tabId: tab.id, cwd: tab.cwd, shellId: tab.shell }).catch((error) => {
      console.error('Failed to initialize tab context', error)
    })
    return tab
  }, [profiles, rememberSession])

  const launchSessions = useCallback(({ cwd, agents, groupLabel, prompt, groupId: intoGroupId, worktrees }) => {
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
    // The working cap is the plan's grid size (Free 4 → Max 25), bounded by
    // the absolute MAX_SESSIONS ceiling — so the session count a tier sells
    // is the session count a launch can actually reach, no more.
    const tierCap = Math.min(MAX_SESSIONS, entitlements.limit('gridCap') || 4)
    const liveCount = tabsRef.current.filter(t => t.status !== 'exited').length
    const room = Math.max(0, tierCap - liveCount)
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
    const workspaceCwd = existing?.workspaceCwd || existing?.cwd || targetCwd || null

    // Flatten the crew into one session spec per PTY, so worktree creation and
    // labeling share the same numbering.
    const specs = []
    agents.forEach(agent => {
      const count = Math.max(1, agent.count || 1)
      for (let i = 0; i < count; i++) {
        const base = agent.id === 'shell'
          ? (targetCwd ? pathLabel(targetCwd) : prof?.label ?? 'Shell')
          : agent.label
        // The custom name lives on the workspace; sessions keep agent names.
        specs.push({ agent, label: count > 1 ? `${base} ${i + 1}` : base })
      }
    })

    const brief = String(prompt ?? '').trim().replace(/\s*\n+\s*/g, ' ')

    // Type the brief into a session once its agent TUI actually settles (the
    // activity classifier reports waiting/idle after boot) instead of a blind
    // timer. Hard fallback at 12s so a brief is never silently dropped.
    const briefSession = (tab, i) => {
      if (!brief) return
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
    }

    // Worktree swarms: give each session its own checkout. Creation is async
    // (one `git worktree add` per session), so the spawn loop awaits per
    // session; on any failure the session falls back to the shared directory.
    ;(async () => {
      let i = 0
      for (const spec of specs) {
        let sessionCwd = targetCwd
        if (worktrees && targetCwd) {
          try {
            const r = await window.sush.gitWorktreeAdd?.({ cwd: targetCwd, name: `${spec.label}-${i + 1}` })
            if (r?.ok && r.path) sessionCwd = r.path
          } catch {}
        }
        const tab = openTab(prof, {
          cwd: sessionCwd,
          workspaceCwd: workspaceCwd || sessionCwd,
          sessionRootCwd: sessionCwd,
          command: buildAgentCommand(spec.agent, { model: spec.agent.model, effort: spec.agent.effort }) || undefined,
          agentId: spec.agent.id,
          model: spec.agent.model || null,
          effort: spec.agent.effort || null,
          tag: `sess-${nextSessionTag++}`,
          groupId,
          groupLabel: label,
          label: spec.label
        })
        if (tab) briefSession(tab, i)
        i++
      }
    })()

    setShowLauncher(false)
    // Seducia stays open so you can keep orchestrating after a launch.
  }, [openTab, profiles, entitlements.limit])

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

  // Workspace action: send raw input to one specific session (e.g. answering a
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
    const anchor = block.tabs?.find(t => t.workspaceCwd || t.cwd)
    const cwd = anchor?.workspaceCwd || anchor?.cwd || null
    openTab(profiles[0], {
      cwd,
      workspaceCwd: cwd,
      groupId: block.id,
      groupLabel: block.label,
      tag: `sess-${nextSessionTag++}`
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
      const pool = Object.values(allThemes())
      const entry = pool.find(t => t.id === q || (t.label || '').toLowerCase() === q)
        || pool.find(t => (t.label || '').toLowerCase().includes(q))
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

  const closeTab = useCallback((id, { rememberClosed = true, returnHome = true } = {}) => {
    const closing = tabsRef.current.find(t => t.id === id)
    if (closing?.cwd) rememberSession(closing)
    // Remember enough to reopen a USER-CLOSED session with Ctrl+Shift+T.
    // Internal restarts (model/account changes) deliberately skip this stack.
    if (closing && rememberClosed) {
      lastClosedRef.current.push({
        cwd: closing.cwd,
        workspaceCwd: closing.workspaceCwd || closing.cwd,
        sessionRootCwd: closing.sessionRootCwd || closing.cwd,
        profileId: closing.profileId,
        shell: closing.shell,
        shellLabel: closing.shellLabel,
        label: closing.label,
        bootCommand: closing.bootCommand || null,
        agentId: closing.agentId || null,
        model: closing.model || null,
        effort: closing.effort || null,
        groupId: closing.groupId || null,
        groupLabel: closing.groupLabel || null
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
      // This updater runs at render time, AFTER anything queued in the same
      // batch — e.g. the replacement tab an account/model restart opens right
      // after closing. Only move focus if it still points at the closed tab,
      // or the restart's new session loses focus to an unrelated project.
      if (!next.length) {
        // Last session closed: don't eagerly spawn a replacement terminal.
        // Leave the workspace empty and let the user re-open from Home.
        setActiveId(cur => (cur === id ? null : cur))
        return next
      }
      // Keep a sensible session selected for when the user returns, but we drop
      // to Home below rather than throwing them into it.
      if (wasActive) setActiveId(cur => (cur === id ? next[next.length - 1].id : cur))
      return next
    })

    // User closes return to Home; internal restarts keep the workspace canvas
    // stable while the replacement PTY is created.
    if (wasActive && returnHome) { setHomeView('dashboard'); setView('home') }
  }, [rememberSession])

  useEffect(() => {
    closeTabRef.current = closeTab
  }, [closeTab])

  // Limit-hit recovery for INTERACTIVE agent sessions (the case the Seducia
  // cascade can't reach): switch this CLI to the account that's rested longest
  // and relaunch the session in resume mode, so the conversation continues on
  // the fresh account (claude --continue, codex resume --last). Explicit, one
  // click from Overview — never automatic, so a live session is never
  // yanked out from under you.
  const restartSessionWithModel = useCallback(async (tabId, next = {}) => {
    const tab = tabsRef.current.find(t => t.id === tabId)
    const provider = tab?.agentId
    const agent = agentById(provider)
    if (!tab || !provider || !agent?.resumeCommand) return { ok: false }

    const requestedModel = next.model ?? null
    const requestedEffort = next.effort ?? null
    const model = requestedModel == null ? null : normalizeModel(provider, requestedModel)
    const effort = requestedEffort == null ? null : normalizeEffort(provider, requestedEffort, model || requestedModel)
    if (requestedModel && !model) return { ok: false, error: 'invalid-model' }
    if (requestedEffort && !effort) return { ok: false, error: 'invalid-effort' }
    const command = buildAgentCommand(agent, { model, effort, resume: true })
    if (!command) return { ok: false, error: 'unsupported-provider' }

    const { cwd, workspaceCwd, sessionRootCwd, label, groupId, groupLabel } = tab
    closeTab(tabId, { rememberClosed: false, returnHome: false })
    openTab(profiles[0], {
      cwd: sessionRootCwd || cwd,
      workspaceCwd: workspaceCwd || sessionRootCwd || cwd,
      sessionRootCwd: sessionRootCwd || cwd,
      agentId: provider,
      model,
      effort,
      command,
      label,
      groupId,
      groupLabel,
      tag: `sess-${nextSessionTag++}`
    })
    return { ok: true }
  }, [closeTab, openTab, profiles])

  const switchToAccountAndResume = useCallback(async (tabId, slotId) => {
    const tab = tabsRef.current.find(t => t.id === tabId)
    const provider = tab?.agentId
    const agent = agentById(provider)
    if (!tab || !provider || !agent?.resumeCommand || !slotId) return { ok: false }
    try {
      const sw = await window.sush.accountsSwitch({ provider, slotId })
      if (!sw?.ok) return sw || { ok: false }
      const { cwd, workspaceCwd, sessionRootCwd, label, groupId, groupLabel, model, effort } = tab
      closeTab(tabId, { rememberClosed: false, returnHome: false })
      openTab(profiles[0], {
        cwd: sessionRootCwd || cwd,
        workspaceCwd: workspaceCwd || sessionRootCwd || cwd,
        sessionRootCwd: sessionRootCwd || cwd,
        agentId: provider,
        model: model || null,
        effort: effort || null,
        command: buildAgentCommand(agent, { model, effort, resume: true }) || agent.resumeCommand,
        label,
        groupId,
        groupLabel,
        tag: `sess-${nextSessionTag++}`
      })
      return { ok: true, label: sw.label || null }
    } catch {
      return { ok: false }
    }
  }, [closeTab, openTab, profiles])

  // Pick the best alternate account automatically for limit-hit recovery.
  const switchAndResume = useCallback(async (tabId) => {
    const tab = tabsRef.current.find(t => t.id === tabId)
    const provider = tab?.agentId
    const agent = agentById(provider)
    if (!tab || !provider || !agent?.resumeCommand) return
    try {
      const list = await window.sush.accountsList?.()
      const st = list?.providers?.[provider]
      if (!st || (st.slots?.length || 0) < 2) return
      const alt = st.slots
        .filter(s => s.id !== st.active)
        .sort((a, b) => (a.lastLimitAt || 0) - (b.lastLimitAt || 0))[0]
      if (alt) await switchToAccountAndResume(tabId, alt.id)
    } catch {}
  }, [switchToAccountAndResume])

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
        // Sessions opened without an explicit project latch the first cwd the
        // PTY reports. Later OSC7 directory changes update cwd, not project identity.
        workspaceCwd: tab.workspaceCwd || cwd || null,
        sessionRootCwd: tab.sessionRootCwd || cwd || null,
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

    const prof = profiles.find(p => p.id === last.profileId) ?? profiles[0]
    const agent = last.agentId && last.agentId !== 'shell' ? agentById(last.agentId) : null
    const command = agent
      ? (buildAgentCommand(agent, { model: last.model, effort: last.effort, resume: true }) || last.bootCommand || undefined)
      : (last.bootCommand || undefined)

    openTab(prof, {
      cwd: last.sessionRootCwd || last.cwd || null,
      workspaceCwd: last.workspaceCwd || last.sessionRootCwd || last.cwd || null,
      sessionRootCwd: last.sessionRootCwd || last.cwd || null,
      shell: last.shell,
      shellLabel: last.shellLabel,
      label: last.label,
      command,
      agentId: last.agentId || null,
      model: last.model || null,
      effort: last.effort || null,
      groupId: last.groupId || null,
      groupLabel: last.groupLabel || null,
      tag: `reopen-${Date.now()}`
    })
  }, [openTab, profiles])

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
    const agent = tab.agentId && tab.agentId !== 'shell' ? agentById(tab.agentId) : null
    openTab(prof, {
      cwd: tab.sessionRootCwd || tab.cwd,
      workspaceCwd: tab.workspaceCwd || tab.sessionRootCwd || tab.cwd,
      sessionRootCwd: tab.sessionRootCwd || tab.cwd,
      shell: tab.shell,
      label: `${tab.label} (copy)`,
      command: agent
        ? (buildAgentCommand(agent, { model: tab.model, effort: tab.effort }) || tab.bootCommand || undefined)
        : (tab.bootCommand || undefined),
      agentId: tab.agentId || null,
      model: tab.model || null,
      effort: tab.effort || null,
      groupId: tab.groupId || null,
      groupLabel: tab.groupLabel || null,
      tag: `copy-${Date.now()}`
    })
  }, [profiles, openTab])

  // ── Usage Guard (Pro+) ─────────────────────────────────────────────────────
  // Threshold + mode come from Settings; the watching/tripping lives in
  // useUsageGuard. Auto-handoff falls back to warn below Ultra.
  const guardMode = (settings.usageGuardMode === 'handoff' && !entitlements.can('autoHandoff'))
    ? 'warn' : (settings.usageGuardMode || 'warn')
  const guardPct = settings.usageGuardPct ?? 80
  const guard = useUsageGuard({
    enabled: entitlements.can('usageGuard') && settings.usageGuardEnabled === true,
    thresholdPct: guardPct,
    mode: guardMode,
    tabsRef,
    onHandoff: (tabId) => performLimitHandoffRef.current(tabId)
  })
  const guardTrip = guard.trip
  const guardBlocked = guard.blocked

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

  // ── Cross-model limit handoff ──────────────────────────────────────────────
  // A limited Claude (or any agent) session's work continues on another model:
  // summarize the session with a NON-limited CLI, then launch the fallback
  // agent in the same directory with the summary as its brief — so hitting a
  // limit never cuts the task off mid-flight. Used by Nightly Overview's
  // "Hand off →" and by the Usage Guard's hands-free mode.
  const performLimitHandoff = useCallback(async (tabId) => {
    const tab = tabsRef.current.find(t => t.id === tabId)
    if (!tab) return
    const from = tab.agentId || 'shell'
    const card = await buildHandoffCard(tabId)
    // Pick the first fallback CLI that's actually installed (never the one
    // that just hit its limit).
    const pool = ['codex', 'gemini', 'claude'].filter(n => n !== from)
    let fallback = pool[0]
    try {
      const probe = await window.sush.checkClis({ names: pool })
      fallback = pool.find(n => probe?.found?.[n]) || pool[0]
    } catch {}
    const scroll = stripAnsi(String(card?.scroll || '')).slice(-3500)
    // Summarize with the fallback engine itself — the limited CLI can't answer.
    let summary = null
    try {
      summary = await cliComplete(
        `Summarize this terminal session for a fresh coding agent taking over mid-task. State the inferred goal, what is already done, what remains, and the exact next step. Under 120 words, plain prose, no preamble.\n--- session output (tail) ---\n${scroll}`,
        { cwd: tab.cwd || undefined, engine: fallback }
      )
    } catch {}
    const brief = [
      `You are taking over from another AI agent (${from}) that hit its usage limit mid-task.`,
      summary ? `Handoff summary: ${summary}` : `Recent output tail: ${scroll.slice(-900)}`,
      card?.branch ? `Git branch: ${card.branch}${card.dirty ? ` (${card.dirty} changed files)` : ''}.` : '',
      'Pick the work up from exactly where it stopped.'
    ].filter(Boolean).join(' ')
    performHandoff({
      openNew: true,
      agentId: fallback,
      sourceCwd: tab.workspaceCwd || tab.cwd || null,
      fullText: `# Sush limit handoff\nFrom: ${from} — "${tab.label}"\nDir: ${tab.cwd || 'unknown'}\n\n${summary || scroll.slice(-2000)}`,
      injectText: brief
    })
  }, [buildHandoffCard, performHandoff])
  const performLimitHandoffRef = useRef(performLimitHandoff)
  performLimitHandoffRef.current = performLimitHandoff

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
    } else if (action.name === 'rename-tab') {
      // `title <name>` from the omnibar renames the focused session.
      if (activeIdRef.current && action.label) renameTab(activeIdRef.current, String(action.label).slice(0, 40))
    } else if (action.name === 'open-sushrc') {
      setSmartResult(null)
      setShowSushrc(true)
    } else if (action.name === 'handoff') {
      setSmartResult(null)
      if (activeIdRef.current) setHandoffSource(activeIdRef.current)
    }
  }, [findOrOpenCwd, queuePtyCommand, recentSessions, duplicateTab, renameTab])

  const runSmartInput = useCallback(async (input) => {
    const command = input.trim()
    if (!command) return
    setSmartBusy(true)
    try {
      const target = tabsRef.current.find(tab => tab.id === activeId) ?? tabsRef.current[0]
      const result = await window.sush.runSmartInput({ tabId: target?.id, input: command })
      const sensitive = result?.sensitive === true
      const nextResult = {
        input: sensitive ? '[sensitive command redacted]' : command,
        type: result?.type ?? 'success',
        output: result?.output ?? '',
        action: result?.action
      }
      setSmartResult(nextResult)
      applySmartAction(result?.action, nextResult)
      // Feed the alias miner real commands only (skip failures/typos).
      if (!sensitive && nextResult.type !== 'error') { recordCommand(command); setNudgeHidden(false); setCmdTick(t => t + 1) }
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
    else if (action === 'pane-right') { setPaneDock('right'); setRightOpen(true) }
    else if (action === 'pane-bottom') { setPaneDock('bottom'); setRightOpen(true) }
    else if (action === 'zen') setZenMode(prev => !prev)
    else if (action === 'mission') setView('overview')
    else if (action === 'shortcuts') setShowShortcuts(true)
    else if (action === 'home') { setHomeView('dashboard'); setView('home') }
    else if (action === 'handoff') { if (activeIdRef.current) setHandoffSource(activeIdRef.current) }
    else if (action === 'rename') { if (activeIdRef.current) { setView('terminal'); setRenamingId(activeIdRef.current) } }
    else if (action === 'sushrc') setShowSushrc(true)
    else if (action === 'export-output') exportSessionOutput()
    else if (action === 'export-md') exportSessionOutput(undefined, 'md')
    else if (action === 'copy-output') copySessionOutput()
    else if (action === 'reopen') reopenLastClosed()
    else if (action === 'split') toggleWorkspaceSplit()
    else if (action === 'hunt') setShowHunt(true)
    else if (action === 'digest') {
      const active = tabsRef.current.find(t => t.id === activeIdRef.current)
      buildWorkspaceDigest(active?.groupId ?? null)
    }
    else if (action === 'plans') setShowPlans(true)
    else if (action === 'changelog') setShowChangelog(true)
    else if (action === 'lock') identity.lock()
    else if (action === 'switch-user') identity.signOut()
    else if (action === 'manage-users') setShowUserManager(true)
    else if (action === 'broadcast') setBroadcastMode(prev => !prev)
    else if (action === 'feather') saveSettings(withFeather(settings, !isFeather(settings)))
    else if (action === 'grid') toggleWorkspaceGrid()
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
    else if (action?.startsWith?.('crew:')) {
      // Relaunch a saved crew straight from the palette — the whole workspace
      // (agents × counts + cwd + brief) in one action.
      const id = action.slice('crew:'.length)
      const crew = loadCrews().find(c => c.id === id)
      if (crew) launchSessions({
        cwd: crew.cwd || activeIdRef.current && (() => {
          const active = tabsRef.current.find(t => t.id === activeIdRef.current)
          return active?.workspaceCwd || active?.cwd || null
        })(),
        agents: crewToAgents(crew, agentById),
        groupLabel: crew.name,
        prompt: crew.brief || undefined
      })
    }
  }, [settings, recentSessions, openRecentSession, identity, exportSessionOutput, copySessionOutput, reopenLastClosed, toggleWorkspaceSplit, toggleWorkspaceGrid, launchSessions, buildWorkspaceDigest])

  // Dynamic palette entries: new actions + a jump-to-session for every open tab.
  const paletteActions = useCallback(() => {
    const base = [
      { id: 'act-mission', label: 'Workspace Overview', description: 'Project and agent status (Ctrl+Shift+M)', icon: 'activity', action: 'mission' },
      { id: 'act-handoff', label: 'Hand Off Session', description: 'Pass this session\'s context to another', icon: 'send', action: 'handoff' },
      { id: 'act-rename', label: 'Rename Session', description: 'Rename the active session (F2)', icon: 'edit', action: 'rename' },
      { id: 'act-sushrc', label: 'Edit .sushrc Profile', description: 'Your shell-agnostic Sush profile', icon: 'fileText', action: 'sushrc' },
      { id: 'act-export', label: 'Export Session Output', description: 'Save this session\'s recent output as .txt', icon: 'fileText', action: 'export-output' },
      { id: 'act-export-md', label: 'Export Session as Markdown', description: 'Transcript with metadata + fenced output, ready for an issue or PR', icon: 'fileText', action: 'export-md' },
      { id: 'act-copy-output', label: 'Copy Session Output', description: 'Copy this session\'s recent output to the clipboard', icon: 'fileText', action: 'copy-output' },
      { id: 'act-reopen', label: 'Reopen Closed Session', description: 'Bring back the last session you closed (Ctrl+Shift+T)', icon: 'clock', action: 'reopen' },
      { id: 'act-hunt', label: 'Hunt Session Output', description: 'Search every session\'s output, live and saved (Ctrl+Shift+F)', icon: 'search', action: 'hunt' },
      { id: 'act-digest', label: 'Workspace Digest', description: 'AI crew report of this workspace\'s sessions, saved as Markdown', icon: 'fileText', action: 'digest' },
      { id: 'act-split', label: 'Toggle Split View', description: 'Two sessions from this project, side by side (Ctrl+\\)', icon: 'grid', action: 'split' },
      { id: 'act-pane-right', label: 'Dock Workspace Pane Right', description: 'Show the active tool pane beside the terminal', icon: 'panel', action: 'pane-right' },
      { id: 'act-pane-bottom', label: 'Stack Workspace Pane Bottom', description: 'Show the active tool pane below the terminal', icon: 'layout', action: 'pane-bottom' },
      { id: 'act-plans', label: 'Plans & Upgrade', description: 'Compare tiers, redeem an unlock code', icon: 'star', action: 'plans' },
      { id: 'act-changelog', label: 'What’s New', description: 'Recent changes and release notes', icon: 'sparkles', action: 'changelog' },
      { id: 'act-lock', label: 'Lock Sush', description: 'Lock the app — sessions keep running', icon: 'lock', action: 'lock' },
      { id: 'act-switch-user', label: 'Switch User / Sign Out', description: 'Closes your sessions and opens the user picker', icon: 'users', action: 'switch-user' },
      { id: 'act-users', label: 'Manage Users', description: 'Identities, PINs, isolation level', icon: 'users', action: 'manage-users' },
      { id: 'act-feather', label: isFeather(settings) ? 'Feather Mode: Off' : 'Feather Mode: On', description: 'One-click light profile — eco rendering, no motion, solid window', icon: 'feather', action: 'feather' },
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
    const themeEntries = Object.values(allThemes()).map(th => ({
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
    // Saved crews — relaunch a whole workspace in one action.
    const crewEntries = loadCrews().map(c => {
      const n = Object.values(c.counts).reduce((s, x) => s + x, 0)
      return {
        id: `crew-${c.id}`,
        label: `Launch crew: ${c.name}`,
        description: `${n} session${n === 1 ? '' : 's'}${c.cwd ? ` · ${c.cwd}` : ''}`,
        icon: 'layers',
        action: `crew:${c.id}`
      }
    })
    // Saved snippets — run the exact command via `run`.
    const snippetEntries = snippets.map(s => ({
      id: `snip-${s.name}`,
      label: `Snippet: ${s.name}`,
      description: s.command,
      icon: 'command',
      run: s.command
    }))
    // Recent commands (most-recent first, de-duped) — the History tab, in the
    // palette where it belongs.
    const seen = new Set()
    const historyEntries = []
    for (let i = commandHistory.length - 1; i >= 0 && historyEntries.length < 15; i--) {
      const cmd = commandHistory[i]
      if (!cmd || seen.has(cmd)) continue
      seen.add(cmd)
      historyEntries.push({ id: `hist-${historyEntries.length}-${cmd}`, label: cmd, description: 'Recent command', icon: 'clock', run: cmd })
    }
    return [...base, ...crewEntries, ...snippetEntries, ...sessions, ...recents, ...historyEntries, ...themeEntries]
  }, [tabs, themeId, recentSessions, snippets, commandHistory, settings])

  // Power-user session shortcuts (v3.1):
  //   Ctrl+1..8  jump to session N      Ctrl+9            jump to last session
  //   Ctrl+PageDown / PageUp  next / previous session (sequential)
  //   Ctrl+,     open Settings          Ctrl+Shift+N      new session launcher
  //   Ctrl+Shift+T  reopen last closed  Ctrl+Shift+Home   go to Home screen
  useEffect(() => {
    const handler = (e) => {
      if (!canHandleGlobalShortcut(identity.ready, blockingShortcutSurface)) return
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
  }, [selectTab, reopenLastClosed, identity.ready, blockingShortcutSurface])

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
    <div
      className={`sush-app-bg flex flex-col h-screen${theme.ui.glass ? ' sush-glass-ui' : ''}${(reducedFx || terminalSaver) ? ' sush-lite' : ''}${terminalSaver ? ' sush-saver' : ''}${zenMode ? ' sush-focus-mode' : ''}${(settings.reduceMotion || ecoMode) ? ' sush-reduce-motion' : ''}${ecoMode ? ' sush-eco' : ''}`}
      style={{
        ...accentVars(accent),
        ...(theme.ui.glass ? glassVars(theme.ui) : {}),
        // Custom wallpaper sits under everything; bgDim is a dark veil baked
        // into the same background stack so terminal text stays readable.
        // With window material on (and no wallpaper) the canvas is translucent
        // so Mica/Acrylic shows through — see the .sush-material rule.
        // When materialActive, the .sush-material rule overrides this with a
        // translucent surface (via !important) so the OS material shows.
        background: settings.bgImage
          ? `linear-gradient(rgba(2,3,5,${(settings.bgDim ?? 62) / 100}), rgba(2,3,5,${(settings.bgDim ?? 62) / 100})), url(${JSON.stringify(settings.bgImage)}) center / cover no-repeat fixed, ${theme.xterm.background}`
          : theme.xterm.background
      }}
    >
      <div className="flex flex-1 min-h-0">
        {!zenMode && (
          <NightlyWorkspaceRail
            tabs={tabs}
            activeId={activeId}
            accent={accent}
            activity={agentStates}
            onHome={() => { setHomeView('dashboard'); setView('home') }}
            onOverview={() => setView('overview')}
            onSelect={selectTab}
            onNewSession={() => setShowLauncher(true)}
            onHunt={() => setShowHunt(true)}
            onSettings={() => setShowSettings(true)}
            user={identity.currentUser}
            onLock={identity.lock}
            onSignOut={identity.signOut}
            onManageUsers={() => setShowUserManager(true)}
            onViewProfile={() => setShowProfile(true)}
          />
        )}

        <div className="flex flex-col flex-1 min-w-0">
          {!zenMode && (
            <NightlyTopbar
              activeTab={view === 'home' ? null : activeTab}
              tabs={tabs}
              accent={accent}
              activity={agentStates}
              limited={!!agentLimits[activeId]}
              guardTrip={guardTrip}
              providerMeta={nightlyProviderMeta}
              rightOpen={rightOpen}
              onHome={() => { setHomeView('dashboard'); setView('home') }}
              onHunt={() => setShowHunt(true)}
              onMission={() => setView(prev => prev === 'overview' ? 'terminal' : 'overview')}
              onSeducia={() => setSeduciaOpen(true)}
              onSwitchAccount={(slotId) => activeId && switchToAccountAndResume(activeId, slotId)}
              layoutMode={view === 'overview'
                ? 'overview'
                : gridMode
                  ? 'grid'
                  : splitId && activeWorkspaceTabs.some(t => t.id === splitId)
                    ? 'split'
                    : 'focus'}
              canSplit={activeWorkspaceTabs.length > 1}
              onLayoutFocus={() => { setGridMode(false); setSplitId(null); setView('terminal') }}
              onLayoutSplit={() => { setGridMode(false); toggleWorkspaceSplit() }}
              onLayoutGrid={toggleWorkspaceGrid}
              onLayoutOverview={() => setView('overview')}
              activePane={rightTab}
              paneDock={paneDock}
              onPaneDockChange={setPaneDock}
              onOpenPane={(pane) => {
                setRightTab(pane)
                setRightOpen(true)
              }}
              onTogglePanel={() => setRightOpen(prev => !prev)}
            />
          )}

          <div className="flex-1 relative overflow-hidden">
            {(
              // One container for both layouts. Grid mode is a STYLE switch on
              // the same keyed wrappers — terminals never remount on toggle, so
              // xterm buffers survive. Unbooted tabs tile as wake-on-click
              // placeholders (the lazy-boot CPU guard extends into the grid).
              (() => {
                // Grid auto-sizes to the session count: a near-square layout
                // (2 sessions → 1×2, 3-4 → 2×2, 5-9 → 3×3, and so on). The live
                // tile count is capped by the plan tier's gridCap (Free 4 /
                // Plus 9 / Pro 12 / Ultra 20 / Max 25 / Enterprise 32) — also the lazy-boot CPU
                // guard, honest about it via the "showing X of N" note below —
                // so a weak machine isn't asked to paint a wall of WebGL
                // terminals at once.
                // Split (Ctrl+\) is a constrained grid of two: the active
                // session plus its pinned partner, reusing the same keyed
                // wrappers so neither terminal remounts.
                const splitPartner = !gridMode && !zenMode && splitId && splitId !== activeId
                  ? activeWorkspaceTabs.find(t => t.id === splitId) : null
                const layoutGridMode = (gridMode || !!splitPartner) && !zenMode
                const GRID_CAP = entitlements.limit('gridCap') || 4
                const gridTabs = gridMode && !zenMode
                  ? activeWorkspaceTabs.slice(0, GRID_CAP)
                  : splitPartner
                    ? [tabs.find(t => t.id === activeId), splitPartner].filter(Boolean)
                    : tabs.filter(tab => bootedIds.has(tab.id))
                const n = gridTabs.length
                const cols = gridMode && !zenMode ? Math.max(1, Math.ceil(Math.sqrt(n))) : splitPartner ? 2 : 1
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
                          data-nightly-tile={layoutGridMode ? '1' : undefined}
                          data-nightly-workspace={nightlyWorkspaceKey(tab) || undefined}
                          data-tab-id={tab.id}
                          onMouseDown={layoutGridMode ? () => {
                            if (!booted) setBootedIds(prev => new Set(prev).add(tab.id))
                            // In split view, focusing the partner swaps the panes
                            // instead of collapsing the split (active === splitId
                            // would otherwise dissolve it).
                            if (splitPartner && tab.id === splitId) setSplitId(activeIdRef.current)
                            setActiveId(tab.id)
                          } : undefined}
                          style={layoutGridMode
                            ? { position: 'relative', overflow: 'hidden', borderRadius: 10, border: `1px solid ${focused ? rgba(accent, 0.6) : 'rgba(255,255,255,0.08)'}`, boxShadow: focused ? `0 0 0 1px ${rgba(accent, 0.35)}` : 'none', background: wallpaperOnTerminals ? 'transparent' : '#07090b' }
                            : { position: 'absolute', inset: 0 }}
                        >
                          {booted ? (
                            <Suspense fallback={<div className="flex items-center justify-center" style={{ position: 'absolute', inset: 0, color: '#8a939c', fontSize: 12 }}>Starting terminal…</div>}>
                              <Terminal
                                tabId={tab.id}
                                theme={t}
                                profile={prof}
                                shellId={tab.shell}
                                active={focused}
                                splitVisible={layoutGridMode}
                                initialCwd={tab.cwd}
                                bootCommand={tab.bootCommand}
                                fontSize={layoutGridMode ? Math.max(10, fontSize - 2) : fontSize}
                                fontFamily={fontFamily}
                                cursorStyle={cursorStyle}
                                broadcastTabIds={broadcastTargets}
                                restoreKey={tab.cwd ? `u:${identity.currentUser?.id ?? 'solo'}:${tabKey(tab)}` : null}
                                persistScrollback={settings.persistScrollback !== false}
                                transparentBg={wallpaperOnTerminals}
                                powerSaver={terminalSaver}
                                inputLocked={guardBlocked && tab.agentId === 'claude'}
                                onSessionState={(state) => handleSessionState(tab.id, state)}
                                onReady={(state) => handleTerminalReady(tab.id, state)}
                                onNewTab={() => openTab(prof, { cwd: tab.cwd, shell: tab.shell })}
                                onCommand={(cmd) => {
                                  // Move a repeated command to the end so the
                                  // palette's "recent" list reflects real recency
                                  // (includes()-dedupe froze old commands in place).
                                  if (cmd && !isSensitiveCommand(cmd)) {
                                    setCommandHistory(prev => [...prev.filter(c => c !== cmd).slice(-499), cmd])
                                  }
                                }}
                                onExport={() => exportSessionOutput(tab.id)}
                              />
                            </Suspense>
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
                            // out in the grid without opening Overview.
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
                    {/* Grid only — split view always shows exactly 2 tiles, so
                        the "showing X of N" cap note would be wrong there. */}
                    {gridMode && !zenMode && activeWorkspaceTabs.length > GRID_CAP && (
                      <div style={{ position: 'absolute', bottom: 10, right: 14, zIndex: 70, fontSize: 10.5, fontWeight: 700, color: '#8a939c', background: 'rgba(5,7,10,0.85)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, padding: '4px 12px' }}>
                        showing {GRID_CAP} of {activeWorkspaceTabs.length} in this project (CPU guard)
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

            {view === 'overview' && (
              <div key="nightly-overview" className="sush-reveal" style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
                <NightlyOverview
                  tabs={tabs}
                  states={agentStates}
                  limits={agentLimits}
                  metrics={sessionMetrics}
                  summary={agentSummary}
                  accent={accent}
                  onFocus={(id) => { setActiveId(id); setView('terminal') }}
                  onHandoff={(id) => performLimitHandoff(id)}
                  onNewSession={() => setShowLauncher(true)}
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
                  // A React element is always truthy even when the component
                  // renders null, so "jsonView || <pre>" never fell through —
                  // every non-JSON success output showed as an empty box.
                  // Decide JSON-ness here instead.
                  let isJson = false
                  if (smartResult.type !== 'error' && /^[[{]/.test(raw)) {
                    try { JSON.parse(raw); isJson = true } catch {}
                  }
                  return isJson ? <JsonViewer content={raw} accent={accent} /> : (
                    <pre style={{ margin: 0, padding: 12, color: '#d4dbe1', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.5 }}>
                      {raw}
                    </pre>
                  )
                })()}
              </div>
            )}
          </div>

          {view === 'terminal' && !zenMode && (
            <NightlyComposer
              activeTab={activeTab}
              providerMeta={nightlyProviderMeta}
              accent={accent}
              disabled={guardBlocked && activeTab?.agentId === 'claude'}
              onOpenLauncher={() => setShowLauncher(true)}
              onChangeSessionModel={(next) => activeId ? restartSessionWithModel(activeId, next) : { ok: false }}
              onSend={(text) => {
                if (!activeTab) return
                promptSession(activeTab.id, `${text}\r`)
              }}
            />
          )}

          {rightOpen && !zenMode && paneDock === 'bottom' && (
            <div
              data-glass
              className={!mounted ? 'sush-slide-up' : undefined}
              style={{ position: 'relative', display: 'flex', flexShrink: 0, height: bottomPaneHeight, minHeight: 180 }}
            >
              <div
                onMouseDown={startBottomPaneDrag}
                title="Resize stacked pane"
                style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 5, cursor: 'row-resize', zIndex: 12 }}
              />
              <RightPanel
                accent={accent}
                tab={rightTab}
                onTab={setRightTab}
                activeCwd={activeTab?.sessionRootCwd || activeTab?.cwd}
                activeTab={activeTab}
                providerMeta={nightlyProviderMeta}
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
                sshShellId={profileShell(profiles[0])}
                settings={settings}
                commandHistory={commandHistory}
                ghNotifCount={ghNotifCount}
                onManageUsers={() => setShowUserManager(true)}
                nightly
                dock="bottom"
                style={{ width: '100%', height: bottomPaneHeight }}
              />
            </div>
          )}
        </div>

        {rightOpen && !zenMode && paneDock === 'right' && (
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
              activeCwd={activeTab?.sessionRootCwd || activeTab?.cwd}
              activeTab={activeTab}
              providerMeta={nightlyProviderMeta}
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
              sshShellId={profileShell(profiles[0])}
              settings={settings}
              commandHistory={commandHistory}
              ghNotifCount={ghNotifCount}
              onManageUsers={() => setShowUserManager(true)}
              nightly
              dock="right"
              style={{ width: rightWidth }}
            />
          </div>
        )}
      </div>

      {!zenMode && !ecoMode && (
        <SeduciaOrb
          accent={accent}
          open={seduciaOpen}
          onOpenChange={setSeduciaOpen}
          tabs={tabs}
          recentSessions={recentSessions}
          activeCwd={activeTab?.workspaceCwd || activeTab?.sessionRootCwd || activeTab?.cwd}
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

      {showPlans && (
        <PlansPage accent={accent} ent={entitlements} onDismiss={() => setShowPlans(false)} />
      )}

      {showChangelog && (
        <ChangelogPage accent={accent} onDismiss={() => setShowChangelog(false)} />
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
          activeCwd={activeTab?.workspaceCwd || activeTab?.sessionRootCwd || activeTab?.cwd}
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

      {showHunt && (
        <HuntOverlay
          accent={accent}
          tabs={tabs}
          onJump={(id) => { setActiveId(id); setView('terminal') }}
          onClose={() => setShowHunt(false)}
        />
      )}

      {/* Usage Guard pill — visible whenever the guard is tripped. */}
      {guardTrip && !zenMode && (
        <div
          data-glass
          className="sush-fade-up"
          style={{ position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)', zIndex: 350, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 999, background: 'rgba(10,12,16,0.92)', border: '1px solid rgba(255,159,67,0.45)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff9f43', flexShrink: 0 }} className="sush-pulse-dot" />
          <span style={{ fontSize: 11.5, fontWeight: 800, color: '#ffb877' }}>
            Usage Guard · Claude at {guardTrip.pct}%
            {guardMode === 'block' ? ' — input to Claude sessions paused' : guardMode === 'handoff' ? ' — handing work to your next model' : ''}
          </span>
          <button
            onClick={() => setView('overview')}
            style={{ fontSize: 10.5, fontWeight: 800, color: '#ffcb9b', background: 'rgba(255,159,67,0.14)', border: '1px solid rgba(255,159,67,0.4)', borderRadius: 999, padding: '3px 10px', cursor: 'pointer' }}
          >
            Overview
          </button>
          <button
            title="Dismiss until the next threshold crossing"
            onClick={guard.dismiss}
            style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 2px' }}
          >
            ×
          </button>
        </div>
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
          onFactoryReset={identity.factoryReset}
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
            const result = await identity.removeUser(id, false)
            if (!result?.ok) return result
            return result
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
  )
}
