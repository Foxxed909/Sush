import React, { useState, useCallback, useEffect, useRef } from 'react'
import Terminal from './components/Terminal'
import TitleBar from './components/TitleBar'
import ProfileManager, { useProfiles } from './components/ProfileManager'
import Settings from './components/Settings'
import SessionRail from './components/SessionRail'
import HomeDashboard from './components/HomeDashboard'
import SmartCommandBar from './components/SmartCommandBar'
import NewSessionModal from './components/NewSessionModal'
import RightPanel from './components/RightPanel'
import PlansModal from './components/PlansModal'
import CommandPalette from './components/CommandPalette'
import ShortcutsHelp from './components/ShortcutsHelp'
import { themes, defaultTheme } from './themes'
import { accentVars, rgba } from './lib/ui'
import { loadPlan, savePlan } from './lib/plan'
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
  const shell = tab.shell || 'powershell'
  const profileId = tab.profileId || 'powershell'
  const cwd = normalizePathKey(tab.cwd)
  const base = cwd ? `${profileId}:${shell}:${cwd}` : `${profileId}:${shell}:new`
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

function loadSessionLayout(profiles) {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_LAYOUT_KEY) ?? '{}')
    if (!Array.isArray(saved.tabs) || !saved.tabs.length) throw new Error('empty layout')

    const tabs = dedupeTabs(saved.tabs.slice(0, 12).map(item => {
      const profile = profiles.find(p => p.id === item.profileId) ?? profiles[0]
      return makeTab(profile, {
        label: item.label,
        profileId: item.profileId,
        profileLabel: item.profileLabel,
        shell: item.shell,
        shellLabel: item.shellLabel,
        cwd: item.cwd,
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
  const [rightTab, setRightTab] = useState(() => localStorage.getItem('sush-right-tab') || 'agent')
  const [settings, setSettings] = useState(loadSettings)
  const [recentSessions, setRecentSessions] = useState(loadRecentSessions)
  const [smartBusy, setSmartBusy] = useState(false)
  const [smartResult, setSmartResult] = useState(null)
  const [zenMode, setZenMode] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [commandHistory, setCommandHistory] = useState([])
  const pendingPtyRef = useRef(new Map())
  const tabsRef = useRef(tabs)
  const activeIdRef = useRef(activeId)
  const closeTabRef = useRef(null)

  useEffect(() => { tabsRef.current = tabs }, [tabs])
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

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

  const activeTab = tabs.find(t => t.id === activeId) ?? tabs[0]
  const activeProfile = profiles.find(p => p.id === activeTab?.profileId) ?? profiles[0]

  const themeId = settings.themeId ?? activeProfile?.themeId ?? 'pink'
  const theme = themes[themeId] ?? defaultTheme
  const accent = theme.ui.accent
  const fontSize = settings.fontSize ?? 14
  const fontFamily = settings.fontFamily ?? "'Cascadia Code'"
  const cursorStyle = settings.cursorStyle ?? 'block'

  useEffect(() => {
    const handler = (e) => {
      if (!e.ctrlKey) return
      if (e.key === '=' || e.key === '+') { e.preventDefault(); saveSettings({ ...settings, fontSize: Math.min((settings.fontSize ?? 14) + 1, 28) }) }
      if (e.key === '-') { e.preventDefault(); saveSettings({ ...settings, fontSize: Math.max((settings.fontSize ?? 14) - 1, 8) }) }
      if (e.key === '0') { e.preventDefault(); saveSettings({ ...settings, fontSize: 14 }) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [settings])

  const openRight = useCallback((tab) => {
    setRightTab(tab)
    setRightOpen(true)
  }, [])

  useEffect(() => {
    const handler = (e) => {
      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      // Ctrl/Cmd+K → summon Seducia. Ctrl/Cmd+B → toggle panel.
      if (ctrl && key === 'k') { e.preventDefault(); setRightOpen(prev => (prev && rightTab === 'agent' ? false : true)); setRightTab('agent') }
      if (ctrl && key === 'b') { e.preventDefault(); setRightOpen(prev => !prev) }
      // Ctrl+P → command palette
      if (ctrl && key === 'p' && !e.shiftKey) { e.preventDefault(); setShowPalette(prev => !prev) }
      // Ctrl+? or Ctrl+Shift+/ → shortcuts
      if (ctrl && (key === '?' || (e.shiftKey && key === '/'))) { e.preventDefault(); setShowShortcuts(prev => !prev) }
      // Ctrl+Shift+Z → zen mode
      if (ctrl && e.shiftKey && key === 'z') { e.preventDefault(); setZenMode(prev => !prev) }
      // Ctrl+T → new tab
      if (ctrl && key === 't') { e.preventDefault(); openTab(profiles[0]) }
      // Ctrl+W → close active tab
      if (ctrl && key === 'w') { e.preventDefault(); if (activeIdRef.current) closeTabRef.current?.(activeIdRef.current) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [rightTab, profiles])

  useEffect(() => { localStorage.setItem('sush-right-open', rightOpen ? '1' : '0') }, [rightOpen])
  useEffect(() => { localStorage.setItem('sush-right-tab', rightTab) }, [rightTab])

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
    // Queue a boot command (e.g. `claude`) to auto-run once the shell is ready.
    if (options.command) pendingPtyRef.current.set(tab.id, options.command)
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

  // Seducia "tell claude …" — type a prompt into every matching live agent.
  const sendAgentPrompt = useCallback(({ target, text }) => {
    const body = String(text ?? '').trim()
    if (!body) return
    const matches = liveTargets(target)
    if (!matches.length) return
    matches.forEach(tab => {
      if (tab.status === 'running') {
        window.sush.ptyInput({ tabId: tab.id, data: `${body}\r` })
      } else {
        // Not booted yet — queue so it fires when the shell signals ready.
        pendingPtyRef.current.set(tab.id, body)
      }
    })
    // Jump to the (first) agent we just prompted so you see the reply.
    setActiveId(matches[0].id)
    setView('terminal')
  }, [liveTargets])

  // Seducia "focus codex" — bring the matching live agent to the foreground.
  const focusAgent = useCallback((target) => {
    const match = liveTargets(target)[0]
    if (!match) return
    setActiveId(match.id)
    setView('terminal')
  }, [liveTargets])

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

    window.sush.closeTab({ tabId: id })
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      if (!next.length) {
        const fresh = makeTab(profiles[0])
        window.sush.newTab({ tabId: fresh.id, cwd: fresh.cwd })
        setActiveId(fresh.id)
        return [fresh]
      }
      // Use the ref instead of the closed-over activeId so rapid closes (e.g.
      // closeGroup) always read the most recent value, not a stale snapshot.
      if (id === activeIdRef.current) setActiveId(next[next.length - 1].id)
      return next
    })
  }, [profiles, rememberSession])

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
    openTab(prof, { cwd: tab.cwd, shell: tab.shell, label: `${tab.label} (copy)` })
  }, [profiles, openTab])

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
    } catch (error) {
      setSmartResult({ input: command, type: 'error', output: error.message })
    } finally {
      setSmartBusy(false)
    }
  }, [activeId, applySmartAction])

  const visibleSmartOutput = view === 'terminal' && smartResult?.output && smartResult.type !== 'passthrough'

  const handlePaletteAction = useCallback((action) => {
    if (action === 'new-session') setShowLauncher(true)
    else if (action === 'open-seducia') { setRightTab('agent'); setRightOpen(true) }
    else if (action === 'settings') setShowSettings(true)
    else if (action === 'plans') setShowPlans(true)
    else if (action === 'toggle-panel') setRightOpen(prev => !prev)
    else if (action === 'zen') setZenMode(prev => !prev)
    else if (action === 'shortcuts') setShowShortcuts(true)
    else if (action === 'home') { setHomeView('dashboard'); setView('home') }
  }, [])

  return (
    <div className="flex flex-col h-screen" style={{ ...accentVars(accent), background: theme.xterm.background, opacity: (settings.opacity ?? 100) / 100 }}>
      {!zenMode && <TitleBar accent={accent} onSettings={() => setShowSettings(true)} />}

      <div className="flex flex-1 min-h-0">
        {!zenMode && (
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
        />
        )}

        <div className="flex flex-col flex-1 min-w-0">
          {!zenMode && (
          <SmartCommandBar
            activeTab={activeTab}
            accent={accent}
            onRun={runSmartInput}
            onSeducia={() => openRight('agent')}
            onTogglePanel={() => setRightOpen(prev => !prev)}
            rightOpen={rightOpen}
            busy={smartBusy}
          />
          )}

          <div className="flex-1 relative overflow-hidden">
            {tabs.map(tab => {
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
                  fontSize={fontSize}
                  fontFamily={fontFamily}
                  cursorStyle={cursorStyle}
                  onSessionState={(state) => handleSessionState(tab.id, state)}
                  onReady={(state) => handleTerminalReady(tab.id, state)}
                  onNewTab={() => openTab(prof, { cwd: tab.cwd, shell: tab.shell })}
                  onCommand={(cmd) => { if (cmd) setCommandHistory(prev => prev.includes(cmd) ? prev : [...prev.slice(-499), cmd]) }}
                />
              )
            })}

            {view === 'home' && (
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
                onSeducia={() => openRight('agent')}
              />
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
            settings={settings}
            planId={planId}
            commandHistory={commandHistory}
          />
        )}
      </div>

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

    </div>
  )
}
