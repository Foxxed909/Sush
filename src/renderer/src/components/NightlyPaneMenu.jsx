import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

const PANES = [
  { id: 'files', label: 'Files', hint: 'Workspace tree', icon: 'file' },
  { id: 'browser', label: 'Browser', hint: 'Persistent web pane', icon: 'globe' },
  { id: 'memory', label: 'Notes', hint: 'Local markdown · .sushmemory', icon: 'book' },
  { id: 'thread', label: 'Thread', hint: 'Same-session structured turns', icon: 'terminal', disabled: true }
]

export default function NightlyPaneMenu({ accent, activePane, panelOpen, onOpen }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const active = PANES.find(p => p.id === activePane)

  return (
    <div ref={ref} className="nightly-pane-menu">
      <button
        className={`nightly-icon-btn${panelOpen && active ? ' is-active' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Workspace panes"
      >
        <Icon name={active?.icon || 'layers'} size={14} />
      </button>

      {open && (
        <div className="nightly-pane-popover">
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
        </div>
      )}
    </div>
  )
}
