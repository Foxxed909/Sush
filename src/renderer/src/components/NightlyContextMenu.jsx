import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icons'

// Right-click menu for the Nightly rail. Viewport-level (portal) so header and
// rail stacking contexts never clip it, clamped on-screen, and keyboard
// complete: arrows/Home/End move, Enter selects, Escape closes.
//
// items: [{ label, icon?, hint?, onSelect, danger?, disabled?, confirm? }, { separator: true }]
// `confirm` (string) makes a destructive item ask once more inside the menu.
export default function NightlyContextMenu({ x, y, items, label = 'Actions', onClose }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: x, top: y, visibility: 'hidden' })
  const [confirming, setConfirming] = useState(null)

  const actionable = useMemo(
    () => items.map((item, index) => ({ item, index })).filter(({ item }) => !item.separator && !item.disabled),
    [items]
  )
  const [active, setActive] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
      visibility: 'visible'
    })
  }, [x, y, items, confirming])

  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) onClose() }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return }
      if (confirming) return
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % Math.max(1, actionable.length)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + actionable.length) % Math.max(1, actionable.length)) }
      else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
      else if (e.key === 'End') { e.preventDefault(); setActive(Math.max(0, actionable.length - 1)) }
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose, actionable.length, confirming])

  // Move DOM focus with the highlighted item so Enter/Space activate it.
  useEffect(() => {
    const target = actionable[active]
    if (target) ref.current?.querySelector(`[data-idx="${target.index}"]`)?.focus()
  }, [active, actionable, confirming])

  const run = (item) => {
    if (item.confirm && confirming !== item) { setConfirming(item); return }
    onClose()
    item.onSelect?.()
  }

  if (typeof document === 'undefined' || !document.body) return null

  return createPortal(
    <div ref={ref} className="nightly-ctx" role="menu" aria-label={label} style={{ position: 'fixed', zIndex: 6000, ...pos }}>
      {confirming ? (
        <div className="nightly-ctx-confirm" role="alertdialog">
          <p>{confirming.confirm}</p>
          <div>
            <button type="button" onClick={() => setConfirming(null)}>Cancel</button>
            <button type="button" className="is-danger" autoFocus onClick={() => { onClose(); confirming.onSelect?.() }}>{confirming.label.replace(/…$/, '')}</button>
          </div>
        </div>
      ) : items.map((item, i) => item.separator ? (
        <div key={`s${i}`} className="nightly-ctx-sep" role="separator" />
      ) : (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          data-idx={i}
          disabled={item.disabled}
          className={`nightly-ctx-item${item.danger ? ' is-danger' : ''}`}
          onMouseEnter={() => { const at = actionable.findIndex(a => a.index === i); if (at >= 0) setActive(at) }}
          onClick={() => run(item)}
        >
          {item.icon ? <Icon name={item.icon} size={13} /> : <span className="nightly-ctx-blank" />}
          <span>{item.label}</span>
          {item.hint && <kbd>{item.hint}</kbd>}
        </button>
      ))}
    </div>,
    document.body
  )
}
