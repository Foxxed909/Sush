import React, { useEffect, useMemo, useState } from 'react'
import Icon from './Icons'
import { STATES } from '../lib/agentActivity'
import { agentById } from '../lib/agents'
import { rgba } from '../lib/ui'

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
  onTogglePanel
}) {
  const [branch, setBranch] = useState(null)

  useEffect(() => {
    if (!activeTab?.cwd) { setBranch(null); return }
    let cancelled = false
    window.sush.gitStatus?.({ cwd: activeTab.cwd })
      .then(g => { if (!cancelled) setBranch(g?.repo ? g.branch : null) })
      .catch(() => { if (!cancelled) setBranch(null) })
    return () => { cancelled = true }
  }, [activeTab?.cwd])

  const workspaceTabs = useMemo(() => {
    if (!activeTab?.cwd) return activeTab ? [activeTab] : []
    const key = String(activeTab.cwd).replace(/[\\/]+$/, '').toLowerCase()
    return tabs.filter(t => String(t.cwd || '').replace(/[\\/]+$/, '').toLowerCase() === key)
  }, [tabs, activeTab])

  const stateId = activeTab?.status === 'exited' ? 'error' : (activity[activeTab?.id] || 'idle')
  const state = STATES[stateId] || STATES.idle
  const agent = agentById(activeTab?.agentId) || agentById('shell')
  const providerLabel = agent?.label || activeTab?.agentId || 'Shell'

  const windowControl = (action) => window.sush?.windowControl?.(action)

  return (
    <header className="nightly-topbar">
      <div className="nightly-crumbs">
        <button className="nightly-icon-btn" onClick={onHome} title="Overview"><Icon name="home" size={13} /></button>
        <span className="nightly-project-name">{projectName(activeTab?.cwd)}</span>
        <span className="nightly-slash">/</span>
        <span className="nightly-thread-name">{activeTab?.label || 'New session'}</span>
        {branch && <span className="nightly-chip nightly-branch"><Icon name="gitBranch" size={10} />{branch}</span>}
      </div>

      <div className="nightly-topbar-center">
        <span className="nightly-chip" title={providerMeta?.model ? `Model: ${providerMeta.model}` : undefined}>
          <span style={{ color: agent?.color || accent, fontWeight: 900 }}>{agent?.mono || '>_'}</span>
          {providerLabel}
          {providerMeta?.model && <strong>· {providerMeta.model}</strong>}
        </span>
        <span className="nightly-chip" title="Live context-window telemetry is not exposed by every CLI yet">
          Context <strong>{activeTab?.contextPct != null ? `${activeTab.contextPct}%` : '—'}</strong>
        </span>
        {providerMeta?.accountLabel && (
          <span className="nightly-chip nightly-subtle" title={providerMeta.accountCount > 1 ? `${providerMeta.accountCount} connected account slots` : 'Active account'}>
            {providerMeta.accountLabel}
          </span>
        )}
        {providerMeta?.usagePct != null && (
          <span className={`nightly-chip ${providerMeta.usagePct >= 80 ? 'nightly-limit' : ''}`} title={`Session: ${providerMeta.sessionPct ?? '—'}% · Week: ${providerMeta.weekPct ?? '—'}%`}>
            Usage <strong>{providerMeta.usagePct}%</strong>
          </span>
        )}
        <span className={`nightly-chip ${limited || guardTrip ? 'nightly-limit' : ''}`}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: limited || guardTrip ? '#ff9f43' : state.dot }} />
          {guardTrip ? `Guard ${guardTrip.pct}%` : limited ? 'Limit reached' : state.label}
        </span>
        <span className="nightly-chip nightly-subtle">{workspaceTabs.length} agent{workspaceTabs.length === 1 ? '' : 's'}</span>
      </div>

      <div className="nightly-topbar-actions">
        <button className="nightly-icon-btn" onClick={onHunt} title="Search all output"><Icon name="search" size={14} /></button>
        <button className="nightly-icon-btn" onClick={onMission} title="Agent overview"><Icon name="activity" size={14} /></button>
        <button className="nightly-action-btn" onClick={onSeducia}><Icon name="sparkles" size={13} /> Seducia</button>
        <button className={`nightly-icon-btn${rightOpen ? ' is-active' : ''}`} onClick={onTogglePanel} title="Toggle inspector"><Icon name="panel" size={14} /></button>
        <span className="nightly-window-divider" />
        <button className="nightly-window-btn" onClick={() => windowControl('minimize')} title="Minimize">−</button>
        <button className="nightly-window-btn" onClick={() => windowControl('maximize')} title="Maximize">□</button>
        <button className="nightly-window-btn nightly-window-close" onClick={() => windowControl('close')} title="Close">×</button>
      </div>
    </header>
  )
}
