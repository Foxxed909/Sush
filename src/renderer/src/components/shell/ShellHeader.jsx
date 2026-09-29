import React, { useState } from 'react'
import { useGitBranch } from '../../hooks/useGitBranch'
import Icon from '../Icons'
import NightlyContextMenu from '../NightlyContextMenu'
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
  onChannel,
  onNewSession,
  onNewInProject,
  onNewTerminal,
  onDuplicate,
  onHome
}) {
  const gitRoot = activeTab?.sessionRootCwd || activeTab?.workspaceCwd || activeTab?.cwd
  const branch = useGitBranch(gitRoot)
  const [menu, setMenu] = useState(null)
  const openMenuUnder = (event, items) => {
    const r = event.currentTarget.getBoundingClientRect()
    setMenu({ x: r.left, y: r.bottom + 6, items })
  }
  const projectCwd = activeTab?.workspaceCwd || activeTab?.cwd || null
  const newItems = () => [
    { label: 'New thread…', icon: 'edit', hint: 'Ctrl+Shift+N', onSelect: () => onNewSession?.() },
    { label: activeTab ? `New thread in ${workspaceLabel(activeTab)}` : 'New thread in project', icon: 'folder', disabled: !projectCwd, onSelect: () => onNewInProject?.(projectCwd) },
    { label: 'New terminal', icon: 'terminal', hint: 'Ctrl+T', onSelect: () => onNewTerminal?.() },
    { separator: true },
    { label: 'Duplicate this thread', icon: 'copy', disabled: !activeTab, onSelect: () => onDuplicate?.(activeTab.id) }
  ]
  const gitItems = () => [
    { label: branch ? `On ${branch.name}${branch.changes ? ` · ${branch.changes} changed` : ''}` : 'Not a git repository', icon: 'gitBranch', disabled: true, onSelect: () => {} },
    { separator: true },
    { label: 'Review changes', icon: 'code', disabled: !branch, onSelect: () => onOpenPane('changes') },
    { label: 'Commit…', icon: 'check', disabled: !branch?.changes, onSelect: () => onOpenPane('changes') },
    { label: 'Pull requests', icon: 'github', onSelect: () => onOpenPane('github') },
    { separator: true },
    { label: 'Copy branch name', icon: 'copy', disabled: !branch, onSelect: () => window.sush?.copyText?.(branch.name) }
  ]

  const agent = agentById(activeTab?.agentId) || agentById('shell')
  const stateId = activeTab?.status === 'exited' ? 'error' : (activity[activeTab?.id] || 'idle')
  const state = STATES[stateId] || STATES.idle
  const drawerRelevant = mode === 'thread' && threadCentered(activeTab)
  const windowControl = (action) => window.sush?.windowControl?.(action)

  return (
    <header className="shell-header">
      <div className="shell-header-where">
        {activeTab ? (
          <>
            <button className="shell-crumb-project" onClick={onHome} title={projectCwd || workspaceLabel(activeTab)}>
              <span className="shell-crumb-mark">{(workspaceLabel(activeTab) || '?').slice(0, 1).toUpperCase()}</span>
              <span>{workspaceLabel(activeTab)}</span>
            </button>
            <span className="shell-crumb-slash">/</span>
            <h2 className="shell-header-title" title={activeTab.label}>{activeTab.label || 'Thread'}</h2>
            <span
              className={`shell-header-state${limited || guardTrip ? ' is-limit' : ''}`}
              title={guardTrip ? `Usage Guard at ${guardTrip.pct}%` : `${agent?.label || 'Shell'} · ${state.label}`}
            >
              <span style={{ background: limited || guardTrip ? '#ff9f43' : state.dot }} />
            </span>
          </>
        ) : (
          <h2 className="shell-header-title">New thread</h2>
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
        <button className="shell-menu-btn" onClick={e => openMenuUnder(e, newItems())} title="New" aria-haspopup="menu">
          <Icon name="plus" size={13} /><Icon name="chevronDown" size={10} />
        </button>
        <button className={`shell-menu-btn${branch?.dirty ? ' is-dirty' : ''}`} onClick={e => openMenuUnder(e, gitItems())} title={branch ? `Git · ${branch.name}` : 'Git'} aria-haspopup="menu">
          <Icon name="github" size={13} /><Icon name="chevronDown" size={10} />
        </button>
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
        {/* With the panel open its own header carries these; T3 does the same. */}
        {!rightOpen && (
          <>
            <button className="nightly-icon-btn" onClick={() => onOpenPane('changes')} title="Open diff panel">
              <Icon name="code" size={14} />
            </button>
            <button className="nightly-icon-btn" onClick={onTogglePanel} title="Open right panel">
              <Icon name="panel" size={14} />
            </button>
          </>
        )}
        <button className="shell-channel" onClick={() => onChannel('stable')} title="You are on Sush Nightly. Switch to Stable (the Quiet Nights shell).">
          Nightly
        </button>
        <span className="nightly-window-divider" />
        <button className="nightly-window-btn" onClick={() => windowControl('minimize')} title="Minimize">−</button>
        <button className="nightly-window-btn" onClick={() => windowControl('maximize')} title="Maximize">□</button>
        <button className="nightly-window-btn nightly-window-close" onClick={() => windowControl('close')} title="Close">×</button>
      </div>
      {menu && <NightlyContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </header>
  )
}
