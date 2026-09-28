import React, { useEffect, useMemo, useState } from 'react'
import Icon from './Icons'
import { STATES } from '../lib/agentActivity'
import { agentById } from '../lib/agents'
import { rgba } from '../lib/ui'
import NightlyAccountMenu from './NightlyAccountMenu'
import NightlyLayoutMenu from './NightlyLayoutMenu'
import NightlyPaneMenu from './NightlyPaneMenu'

function compactTokens(value) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return String(Math.round(n))
}

function projectName(cwd) {
  if (!cwd) return 'Unassigned'
  const bits = String(cwd).replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean)
  return bits[bits.length - 1] || cwd
}

export default function NightlyTopbar({
  activeTab,
  tabs = [],
  accent,
  activity = {},
  limited = false,
  guardTrip,
  providerMeta,
  rightOpen,
  onHome,
  onHunt,
  onMission,
  onSeducia,
  onSwitchAccount,
  layoutMode,
  canSplit,
  onLayoutFocus,
  onLayoutSplit,
  onLayoutGrid,
  onLayoutOverview,
  activePane,
  onOpenPane,
  onTogglePanel
}) {
  const [gitMeta, setGitMeta] = useState({ repo: false, branch: null, changes: 0 })
  const [openingProject, setOpeningProject] = useState(false)

  useEffect(() => {
    const cwd = activeTab?.workspaceCwd || activeTab?.cwd
    if (!cwd) {
      setGitMeta({ repo: false, branch: null, changes: 0 })
      return
    }
    let cancelled = false
    window.sush.gitStatus?.({ cwd })
      .then(g => {
        if (cancelled) return
        setGitMeta({
          repo: !!g?.repo,
          branch: g?.repo ? (g.branch || null) : null,
          changes: g?.repo && Array.isArray(g.files) ? g.files.length : 0
        })
      })
      .catch(() => {
        if (!cancelled) setGitMeta({ repo: false, branch: null, changes: 0 })
      })
    return () => { cancelled = true }
  }, [activeTab?.workspaceCwd, activeTab?.cwd])

  const workspaceTabs = useMemo(() => {
    const root = activeTab?.workspaceCwd || activeTab?.cwd
    if (!root) return activeTab ? [activeTab] : []
    const key = String(root).replace(/[\\/]+$/, '').toLowerCase()
    return tabs.filter(t => String(t.workspaceCwd || t.cwd || '').replace(/[\\/]+$/, '').toLowerCase() === key)
  }, [tabs, activeTab])

  const workspaceCount = useMemo(() => {
    const keys = new Set(
      tabs
        .map(t => String(t.workspaceCwd || t.cwd || t.groupId || '').replace(/[\\/]+$/, '').toLowerCase())
        .filter(Boolean)
    )
    return keys.size
  }, [tabs])
  const liveSessionCount = useMemo(() => tabs.filter(t => t.status !== 'exited').length, [tabs])
  const hasSession = !!activeTab?.id

  const stateId = activeTab?.status === 'exited' ? 'error' : (activity[activeTab?.id] || 'idle')
  const state = STATES[stateId] || STATES.idle
  const agent = agentById(activeTab?.agentId) || agentById('shell')
  const providerLabel = agent?.label || activeTab?.agentId || 'Shell'

  const windowControl = (action) => window.sush?.windowControl?.(action)

  const openProject = async () => {
    const cwd = activeTab?.workspaceCwd || activeTab?.cwd
    if (!cwd || openingProject) return
    setOpeningProject(true)
    try {
      const editor = await window.sush?.openInEditor?.({ cwd })
      if (!editor?.ok) await window.sush?.openPath?.({ path: cwd })
    } catch {
      try { await window.sush?.openPath?.({ path: cwd }) } catch {}
    } finally {
      setOpeningProject(false)
    }
  }

  return (
    <header className={`nightly-topbar${rightOpen ? ' is-inspector-open' : ''}`}>
      <div className="nightly-crumbs">
        <button className="nightly-icon-btn" onClick={onHome} title="Home"><Icon name="home" size={13} /></button>
        {hasSession ? (
          <>
            <span className="nightly-project-name">{projectName(activeTab?.workspaceCwd || activeTab?.cwd)}</span>
            <span className="nightly-slash">/</span>
            <span className="nightly-thread-name">{activeTab?.label || 'Session'}</span>
            {gitMeta.repo && gitMeta.branch && (
              <button
                type="button"
                className="nightly-chip nightly-branch nightly-git-chip"
                onClick={() => onOpenPane?.('changes')}
                title={gitMeta.changes
                  ? `${gitMeta.branch} · ${gitMeta.changes} working-tree change${gitMeta.changes === 1 ? '' : 's'} · Open Changes`
                  : `${gitMeta.branch} · working tree clean · Open Changes`}
              >
                <Icon name="gitBranch" size={10} />
                <span>{gitMeta.branch}</span>
                {gitMeta.changes > 0 && <strong className="nightly-git-count">{gitMeta.changes}</strong>}
              </button>
            )}
          </>
        ) : (
          <>
            <span className="nightly-project-name">Sush</span>
            <span className="nightly-slash">/</span>
            <span className="nightly-thread-name">Home</span>
          </>
        )}
      </div>

      <div className="nightly-topbar-center">
        {hasSession ? (
          <>
            <span className="nightly-chip nightly-meta-provider" title={providerMeta?.model ? `Model: ${providerMeta.model}` : undefined}>
              <span style={{ color: agent?.color || accent, fontWeight: 900 }}>{agent?.mono || '>_'}</span>
              <span className="nightly-provider-label">{providerLabel}</span>
              {providerMeta?.model && <strong>· {providerMeta.model}</strong>}
              {providerMeta?.effort && <span className="nightly-effort-tag">{providerMeta.effort}</span>}
            </span>
            <button
              type="button"
              className="nightly-chip nightly-meta-context nightly-context-chip"
              onClick={() => onOpenPane?.('context')}
              title={providerMeta?.contextTokens != null
                ? 'Provider-reported input context · Open Context inspector'
                : 'Context-window usage is not exposed by this CLI · Open observed Context inspector'}
            >
              Context <strong>{compactTokens(providerMeta?.contextTokens)}</strong>
            </button>
            {providerMeta?.accountLabel && (
              <NightlyAccountMenu
                provider={providerMeta.provider}
                label={providerMeta.accountLabel}
                count={providerMeta.accountCount}
                accent={accent}
                onSwitch={onSwitchAccount}
              />
            )}
            {providerMeta?.usagePct != null && (
              <span className={`nightly-chip nightly-meta-usage ${providerMeta.usagePct >= 80 ? 'nightly-limit' : ''}`} title={`Session: ${providerMeta.sessionPct ?? '—'}% · Week: ${providerMeta.weekPct ?? '—'}%`}>
                Usage <strong>{providerMeta.usagePct}%</strong>
              </span>
            )}
            <span className={`nightly-chip nightly-meta-state ${limited || guardTrip ? 'nightly-limit' : ''}`}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: limited || guardTrip ? '#ff9f43' : state.dot }} />
              {guardTrip ? `Guard ${guardTrip.pct}%` : limited ? 'Limit reached' : state.label}
            </span>
            <span className="nightly-chip nightly-subtle nightly-meta-count">{workspaceTabs.length} agent{workspaceTabs.length === 1 ? '' : 's'}</span>
          </>
        ) : (
          <>
            <span className="nightly-chip nightly-subtle">{workspaceCount} project{workspaceCount === 1 ? '' : 's'}</span>
            <span className="nightly-chip nightly-subtle">{liveSessionCount} live session{liveSessionCount === 1 ? '' : 's'}</span>
          </>
        )}
      </div>

      <div className="nightly-topbar-actions">
        {hasSession && (activeTab?.workspaceCwd || activeTab?.cwd) && (
          <button
            className="nightly-action-btn nightly-open-btn"
            onClick={openProject}
            disabled={openingProject}
            title="Open project in VS Code (falls back to the OS folder)"
          >
            <Icon name="code" size={13} />
            <span className="nightly-open-label">{openingProject ? 'Opening…' : 'Open'}</span>
          </button>
        )}
        <button className="nightly-icon-btn" onClick={onHunt} title="Search all output"><Icon name="search" size={14} /></button>
        <NightlyLayoutMenu
          accent={accent}
          mode={layoutMode}
          canSplit={canSplit}
          onFocus={onLayoutFocus}
          onSplit={onLayoutSplit}
          onGrid={onLayoutGrid}
          onOverview={onLayoutOverview || onMission}
        />
        <button className="nightly-icon-btn" onClick={onMission} title="Overview"><Icon name="activity" size={14} /></button>
        <NightlyPaneMenu
          accent={accent}
          activePane={activePane}
          panelOpen={rightOpen}
          onOpen={onOpenPane}
        />
        <button className="nightly-action-btn" onClick={onSeducia}><Icon name="sparkles" size={13} /> Seducia</button>
        <button className={`nightly-icon-btn${rightOpen ? ' is-active' : ''}`} onClick={onTogglePanel} title="Toggle current pane"><Icon name="panel" size={14} /></button>
        <span className="nightly-window-divider" />
        <button className="nightly-window-btn" onClick={() => windowControl('minimize')} title="Minimize">−</button>
        <button className="nightly-window-btn" onClick={() => windowControl('maximize')} title="Maximize">□</button>
        <button className="nightly-window-btn nightly-window-close" onClick={() => windowControl('close')} title="Close">×</button>
      </div>
    </header>
  )
}
