import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'
import NightlyAnchoredPopover from './NightlyAnchoredPopover'

export default function NightlyLayoutMenu({
  accent,
  mode = 'focus',
  canSplit = false,
  onFocus,
  onSplit,
  onGrid,
  onOverview
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)

  const items = [
    { id: 'focus', label: 'Focus', hint: 'One active session', icon: 'maximize', run: onFocus },
    { id: 'split', label: 'Split', hint: 'Active + recent session', icon: 'panel', run: onSplit, disabled: !canSplit },
    { id: 'grid', label: 'Grid', hint: 'Tile live sessions', icon: 'grid', run: onGrid, disabled: !canSplit },
    { id: 'overview', label: 'Overview', hint: 'Project & agent status', icon: 'activity', run: onOverview }
  ]

  return (
    <div className="nightly-layout-menu">
      <button
        ref={anchorRef}
        className={`nightly-icon-btn${mode !== 'focus' ? ' is-active' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Workspace layout"
      >
        <Icon name={mode === 'grid' ? 'grid' : mode === 'overview' ? 'activity' : mode === 'split' ? 'panel' : 'layout'} size={14} />
      </button>
      <NightlyAnchoredPopover
        open={open}
        anchorRef={anchorRef}
        align="right"
        className="nightly-layout-popover"
        onClose={() => setOpen(false)}
      >
          <div className="nightly-layout-title">Workspace layout</div>
          {items.map(item => (
            <button
              key={item.id}
              disabled={item.disabled}
              className={item.id === mode ? 'is-active' : ''}
              onClick={() => {
                if (item.disabled) return
                setOpen(false)
                item.run?.()
              }}
            >
              <span className="nightly-layout-icon" style={item.id === mode ? { color: accent, background: rgba(accent, .1) } : undefined}>
                <Icon name={item.icon} size={13} />
              </span>
              <span className="nightly-layout-copy">
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
              {item.id === mode && <Icon name="check" size={12} color={accent} />}
            </button>
          ))}
          <div className="nightly-layout-foot">Ctrl+\ split · Ctrl+Shift+G grid</div>
      </NightlyAnchoredPopover>
    </div>
  )
}
