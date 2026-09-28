import React, { useRef, useState } from 'react'
import Icon from './Icons'
import NightlyAnchoredPopover from './NightlyAnchoredPopover'
import { agentById } from '../lib/agents'

// One answer to "which agent needs me?": a bell with a count, and the list.
const KIND_COLOR = { limit: '#ff9f43', waiting: '#ffcb6b', error: '#ff6b81' }

export default function NightlyAttention({ items = [], onFocus, onHandoff }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)
  const count = items.length

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`nightly-icon-btn nightly-bell${count ? ' has-items' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={count ? `${count} session${count === 1 ? '' : 's'} need you` : 'No sessions need you'}
        title={count ? `${count} need${count === 1 ? 's' : ''} you` : 'Nothing needs you'}
        onClick={() => setOpen(v => !v)}
      >
        <Icon name="bell" size={14} />
        {count > 0 && <span className="nightly-bell-count">{count > 9 ? '9+' : count}</span>}
      </button>
      <NightlyAnchoredPopover open={open} anchorRef={anchorRef} align="right" className="nightly-attention" onClose={() => setOpen(false)}>
        <div className="nightly-attention-head">
          <span>Needs you</span>
          <small>{count ? `${count} session${count === 1 ? '' : 's'}` : 'all clear'}</small>
        </div>
        {!count && <div className="nightly-attention-empty">No agent is waiting, errored or out of quota.</div>}
        {items.map(item => {
          const agent = agentById(item.agentId)
          return (
            <div key={item.id} className="nightly-attention-row">
              <button type="button" className="nightly-attention-main" onClick={() => { setOpen(false); onFocus?.(item.id) }}>
                <span className="nightly-attention-dot" style={{ background: KIND_COLOR[item.kind] }} />
                <span className="nightly-attention-copy">
                  <strong>{item.label}</strong>
                  <small>{item.project} · {item.reason}</small>
                </span>
                <span className="nightly-attention-mono" style={{ color: agent?.color }}>{agent?.mono || '>_'}</span>
              </button>
              {item.kind === 'limit' && onHandoff && (
                <button type="button" className="nightly-attention-act" onClick={() => { setOpen(false); onHandoff(item.id) }}>Hand off</button>
              )}
            </div>
          )
        })}
      </NightlyAnchoredPopover>
    </>
  )
}
