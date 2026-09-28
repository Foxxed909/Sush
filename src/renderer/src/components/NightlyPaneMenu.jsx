import React, { useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'
import NightlyAnchoredPopover from './NightlyAnchoredPopover'

const PANES = [
  { id: 'agent', label: 'Agent', hint: 'Seducia + workspace agent', icon: 'sparkles' },
  { id: 'changes', label: 'Changes', hint: 'Git diff and commit flow', icon: 'gitBranch' },
  { id: 'files', label: 'Files', hint: 'Workspace tree', icon: 'file' },
  { id: 'browser', label: 'Browser', hint: 'Persistent web pane', icon: 'globe' },
  { id: 'tasks', label: 'Tasks', hint: 'Workspace task list', icon: 'check' },
  { id: 'memory', label: 'Notes', hint: 'Local markdown · .sushmemory', icon: 'book' },
  { id: 'thread', label: 'Thread', hint: 'Same-session structured turns', icon: 'terminal', disabled: true }
]

export default function NightlyPaneMenu({ accent, activePane, panelOpen, onOpen }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)

  const active = PANES.find(p => p.id === activePane)

  return (
    <div className="nightly-pane-menu">
      <button
        ref={anchorRef}
        className={`nightly-icon-btn${panelOpen && active ? ' is-active' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Workspace panes"
      >
        <Icon name={active?.icon || 'layers'} size={14} />
      </button>

      <NightlyAnchoredPopover
        open={open}
        anchorRef={anchorRef}
        align="right"
        className="nightly-pane-popover"
        onClose={() => setOpen(false)}
      >
          <div className="nightly-pane-title">
            <span>Workspace panes</span>
            <small>secondary</small>
          </div>
          {PANES.map(pane => {
            const selected = panelOpen && activePane === pane.id
            return (
              <button
                key={pane.id}
                disabled={pane.disabled}
                className={selected ? 'is-active' : ''}
                onClick={() => {
                  if (pane.disabled) return
                  setOpen(false)
                  onOpen?.(pane.id)
                }}
              >
                <span
                  className="nightly-pane-icon"
                  style={selected ? { color: accent, background: rgba(accent, .1) } : undefined}
                >
                  <Icon name={pane.icon} size={13} />
                </span>
                <span className="nightly-pane-copy">
                  <strong>{pane.label}</strong>
                  <small>{pane.hint}</small>
                </span>
                {pane.disabled
                  ? <span className="nightly-pane-soon">soon</span>
                  : selected
                    ? <Icon name="check" size={12} color={accent} />
                    : null}
              </button>
            )
          })}
          <div className="nightly-pane-foot">
            Thread stays gated until Sush can bind structured turns to the same live interactive CLI session.
          </div>
      </NightlyAnchoredPopover>
    </div>
  )
}
