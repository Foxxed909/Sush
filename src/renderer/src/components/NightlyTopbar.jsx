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
  paneDock,
  onPaneDockChange,
  onOpenPane,
  onTogglePanel
}) {
  const [branch, setBranch] = useState(null)

  const gitRoot = activeTab?.sessionRootCwd || activeTab?.workspaceCwd || activeTab?.cwd
  useEffect(() => {
    if (!gitRoot) { setBranch(null); return }
    let cancelled = false
    window.sush.gitStatus?.({ cwd: gitRoot })
      .then(g => { if (!cancelled) setBranch(g?.repo ? g.branch : null) })
      .catch(() => { if (!cancelled) setBranch(null) })
    return () => { cancelled = true }
  }, [gitRoot])

  const workspaceTabs = useMemo(() => {
    const root = activeTab?.workspaceCwd || activeTab?.cwd
    if (!root) return activeTab ? [activeTab] : []
    const key = String(root).replace(/[\\/]+$/, '').toLowerCase()
    return tabs.filter(t => String(t.workspaceCwd || t.cwd || '').replace(/[\\/]+$/, '').toLowerCase() === key)
  }, [tabs, activeTab])

  const workspaceCount = useMemo(() => {
    const keys = new Set(tabs.map(t => String(t.workspaceCwd || t.cwd || t.groupId || 'unassigned').replace(/[\\/]+$/, '').toLowerCase()))
    return keys.size
  }, [tabs])
  const hasSession = !!activeTab?.id

  const stateId = activeTab?.status === 'exited' ? 'error' : (activity[activeTab?.id] || 'idle')
  const state = STATES[stateId] || STATES.idle
  const agent = agentById(activeTab?.agentId) || agentById('shell')
  const providerLabel = agent?.label || activeTab?.agentId || 'Shell'

  const windowControl = (action) => window.sush?.windowControl?.(action)

  return (
    <header className={`nightly-topbar${rightOpen ? ' is-inspector-open' : ''}`}>
      <div className="nightly-crumbs">
        <button className="nightly-icon-btn" onClick={onHome} title="Home"><Icon name="home" size={13} /></button>
        {hasSession ? (
          <>
            <span className="nightly-project-name">{projectName(activeTab?.workspaceCwd || activeTab?.cwd)}</span>
            <span className="nightly-slash">/</span>
            <span className="nightly-thread-name">{activeTab?.label || 'Session'}</span>
            {branch && <span className="nightly-branch" title={`Branch ${branch}`}><Icon name="gitBranch" size={11} />{branch}</span>}
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
          // One segmented strip instead of a row of bordered chips: what runs
          // here, on which account, and whether it needs you. Segments are in
          // priority order; the strip sheds trailing ones whole when narrow.
          <div className="nightly-session-strip">
            <span className={`nightly-strip-seg nightly-meta-provider${providerMeta?.model ? ' has-model' : ''}`} title={providerMeta?.model ? `${providerLabel} · model ${providerMeta.model}` : providerLabel}>
              <span className="nightly-strip-mono" style={{ color: agent?.color || accent }}>{agent?.mono || '>_'}</span>
              <span className="nightly-strip-provider">{providerLabel}</span>
              {providerMeta?.model && <strong>{providerMeta.model}</strong>}
              {providerMeta?.effort && <span className="nightly-effort-tag">{providerMeta.effort}</span>}
            </span>
            {providerMeta?.contextTokens != null && (
              <span className="nightly-strip-seg nightly-meta-context" title="Provider-reported input context for the latest observed turn">
                Context <strong>{compactTokens(providerMeta.contextTokens)}</strong>
              </span>
            )}
            {providerMeta?.accountLabel ? (
              <NightlyAccountMenu
                provider={providerMeta.provider}
                label={providerMeta.accountLabel}
                count={providerMeta.accountCount}
                usagePct={providerMeta.usagePct}
                usageTitle={`Session ${providerMeta.sessionPct ?? '—'}% · week ${providerMeta.weekPct ?? '—'}%`}
                accent={accent}
                onSwitch={onSwitchAccount}
              />
            ) : providerMeta?.usagePct != null && (
              <span className={`nightly-strip-seg nightly-meta-usage${providerMeta.usagePct >= 80 ? ' is-limit' : ''}`} title={`Session ${providerMeta.sessionPct ?? '—'}% · week ${providerMeta.weekPct ?? '—'}%`}>
                Usage <strong>{providerMeta.usagePct}%</strong>
              </span>
            )}
            <span className={`nightly-strip-seg nightly-meta-state${limited || guardTrip ? ' is-limit' : ''}`} title={`${workspaceTabs.length} agent${workspaceTabs.length === 1 ? '' : 's'} in this project`}>
              <span className="nightly-strip-dot" style={{ background: limited || guardTrip ? '#ff9f43' : state.dot }} />
              {guardTrip ? `Guard ${guardTrip.pct}%` : limited ? 'Limit reached' : state.label}
            </span>
          </div>
        ) : (
          <div className="nightly-home-summary">
            <span>{workspaceCount} project{workspaceCount === 1 ? '' : 's'}</span>
            <span className="nightly-home-sep" aria-hidden>·</span>
            <span>{tabs.length} live session{tabs.length === 1 ? '' : 's'}</span>
          </div>
        )}
      </div>

      <div className="nightly-topbar-actions">
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
          dock={paneDock}
          onDockChange={onPaneDockChange}
          onOpen={onOpenPane}
        />
        <button className="nightly-action-btn" onClick={onSeducia} title="Seducia (Ctrl+K)"><Icon name="sparkles" size={13} /> Seducia</button>
        <button className={`nightly-icon-btn${rightOpen ? ' is-active' : ''}`} onClick={onTogglePanel} title="Toggle current pane"><Icon name="panel" size={14} /></button>
        <span className="nightly-window-divider" />
        <button className="nightly-window-btn" onClick={() => windowControl('minimize')} title="Minimize">−</button>
        <button className="nightly-window-btn" onClick={() => windowControl('maximize')} title="Maximize">□</button>
        <button className="nightly-window-btn nightly-window-close" onClick={() => windowControl('close')} title="Close">×</button>
      </div>
    </header>
  )
}
