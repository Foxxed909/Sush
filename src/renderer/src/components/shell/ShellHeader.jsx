import React, { useCallback, useState } from 'react'
import { usePolling } from '../../hooks/usePolling'
import Icon from '../Icons'
import NightlyAttention from '../NightlyAttention'
import NightlyAccountMenu from '../NightlyAccountMenu'
import { agentById } from '../../lib/agents'
import { STATES } from '../../lib/agentActivity'
import { workspaceLabel } from '../../lib/workspaces'
import { SHELL_MODES, threadCentered } from '../../lib/shellModes'

// Nightly channel header, T3 Code style: where you are on the left, the mode
// switcher in the middle, and the thread's tools (git, diff, terminal drawer)
// on the right. Model/effort live in the composer, as in T3.
export default function ShellHeader({
  activeTab,
  accent,
  activity = {},
  limited = false,
  guardTrip,
  providerMeta,
  mode,
  onMode,
  attention = [],
  onAttentionFocus,
  onAttentionHandoff,
  broadcast = false,
  onToggleBroadcast,
  rightOpen,
  rightTab,
  drawerOpen,
  onToggleDrawer,
  onOpenPane,
  onTogglePanel,
  onHunt,
  onChannel
}) {
  const [branch, setBranch] = useState(null)
  const gitRoot = activeTab?.sessionRootCwd || activeTab?.workspaceCwd || activeTab?.cwd
  const readBranch = useCallback(() => {
    if (!gitRoot) { setBranch(null); return }
    window.sush.gitStatus?.({ cwd: gitRoot })
      .then(g => setBranch(g?.repo ? { name: g.branch, dirty: (g.files?.length || g.changes || 0) > 0 } : null))
      .catch(() => setBranch(null))
  }, [gitRoot])
  usePolling(readBranch, 8000, !!gitRoot)

  const agent = agentById(activeTab?.agentId) || agentById('shell')
  const stateId = activeTab?.status === 'exited' ? 'error' : (activity[activeTab?.id] || 'idle')
  const state = STATES[stateId] || STATES.idle
  const drawerRelevant = mode === 'thread' && threadCentered(activeTab)
  const windowControl = (action) => window.sush?.windowControl?.(action)
  const diffOpen = rightOpen && rightTab === 'changes'

  return (
    <header className="shell-header">
      <div className="shell-header-where">
        {activeTab ? (
          <>
            <span className="shell-header-mono" style={{ color: agent?.color || accent }}>{agent?.mono || '>_'}</span>
            <span className="shell-header-title" title={activeTab.label}>{activeTab.label || 'Session'}</span>
            <span className="shell-header-project">{workspaceLabel(activeTab)}</span>
            <span
              className={`shell-header-state${limited || guardTrip ? ' is-limit' : ''}`}
              title={guardTrip ? `Usage Guard at ${guardTrip.pct}%` : state.label}
            >
              <span style={{ background: limited || guardTrip ? '#ff9f43' : state.dot }} />
            </span>
          </>
        ) : (
          <span className="shell-header-title">New thread</span>
        )}
      </div>

      <nav className="shell-modes" aria-label="Mode">
        {SHELL_MODES.map((item, index) => (
          <button
            key={item.id}
            data-mode={item.id}
            className={mode === item.id ? 'is-active' : undefined}
            onClick={() => onMode(item.id)}
            title={`${item.hint} (Alt+${index + 1})`}
            aria-pressed={mode === item.id}
          >
            <Icon name={item.icon} size={12} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="shell-header-actions">
        {broadcast && (
          <button className="nightly-broadcast" onClick={onToggleBroadcast} title="Broadcast is on (Ctrl+Shift+B)">
            <span aria-hidden />
            Broadcasting
          </button>
        )}
        {providerMeta?.accountLabel && (
          <NightlyAccountMenu
            provider={providerMeta.provider}
            label={providerMeta.accountLabel}
            count={providerMeta.accountCount}
            usagePct={providerMeta.usagePct}
            usageTitle={`Session ${providerMeta.sessionPct ?? '—'}% · week ${providerMeta.weekPct ?? '—'}%`}
            accent={accent}
            onSwitch={providerMeta.onSwitch}
          />
        )}
        <NightlyAttention items={attention} onFocus={onAttentionFocus} onHandoff={onAttentionHandoff} />
        {branch && (
          <button className="shell-git" onClick={() => onOpenPane('changes')} title={`Branch ${branch.name} — commit and review changes`}>
            <Icon name="gitBranch" size={12} />
            <span>{branch.name}</span>
            {branch.dirty && <i aria-label="uncommitted changes" />}
          </button>
        )}
        {branch && (
          <button className="nightly-icon-btn shell-pr" onClick={() => onOpenPane('github')} title="Pull requests">
            <Icon name="github" size={13} />
          </button>
        )}
        <button className="nightly-icon-btn" onClick={onHunt} title="Search all output (Ctrl+Shift+F)"><Icon name="search" size={14} /></button>
        {drawerRelevant && (
          <button
            className={`nightly-icon-btn${drawerOpen ? ' is-active' : ''}`}
            onClick={onToggleDrawer}
            title="Toggle terminal drawer (Ctrl+`)"
          >
            <Icon name="terminal" size={14} />
          </button>
        )}
        <button
          className={`nightly-icon-btn${diffOpen ? ' is-active' : ''}`}
          onClick={() => (diffOpen ? onTogglePanel() : onOpenPane('changes'))}
          title="Toggle diff panel"
        >
          <Icon name="code" size={14} />
        </button>
        <button className={`nightly-icon-btn${rightOpen ? ' is-active' : ''}`} onClick={onTogglePanel} title="Toggle right panel">
          <Icon name="panel" size={14} />
        </button>
        <button className="shell-channel" onClick={() => onChannel('stable')} title="You are on Sush Nightly. Switch to Stable (the Quiet Nights shell).">
          Nightly
        </button>
        <span className="nightly-window-divider" />
        <button className="nightly-window-btn" onClick={() => windowControl('minimize')} title="Minimize">−</button>
        <button className="nightly-window-btn" onClick={() => windowControl('maximize')} title="Maximize">□</button>
        <button className="nightly-window-btn nightly-window-close" onClick={() => windowControl('close')} title="Close">×</button>
      </div>
    </header>
  )
}
