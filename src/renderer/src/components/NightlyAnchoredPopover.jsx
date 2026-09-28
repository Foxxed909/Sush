import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// A tiny viewport-level popover primitive for Nightly chrome.
//
// Electron drag regions + backdrop-filter create several stacking contexts in
// the topbar. Rendering menus into document.body avoids descendants being
// visually trapped behind terminal/webview surfaces even when their z-index is
// technically higher inside the header.
export default function NightlyAnchoredPopover({
  open,
  anchorRef,
  align = 'center',
  className = '',
  onClose,
  children,
  offset = 8
}) {
  const popoverRef = useRef(null)
  const [style, setStyle] = useState({ visibility: 'hidden' })

  const place = useCallback(() => {
    const anchor = anchorRef?.current
    const popover = popoverRef.current
    if (!anchor || !popover) return

    const a = anchor.getBoundingClientRect()
    const p = popover.getBoundingClientRect()
    let left = align === 'right'
      ? a.right - p.width
      : align === 'left'
        ? a.left
        : a.left + (a.width / 2) - (p.width / 2)

    left = Math.max(8, Math.min(left, window.innerWidth - p.width - 8))

    let top = a.bottom + offset
    const above = a.top - p.height - offset
    if (top + p.height > window.innerHeight - 8 && above >= 8) top = above

    setStyle({
      position: 'fixed',
      left,
      top,
      right: 'auto',
      bottom: 'auto',
      transform: 'none',
      zIndex: 5000,
      visibility: 'visible'
    })
  }, [align, anchorRef, offset])

  useLayoutEffect(() => {
    if (!open) return
    setStyle({ visibility: 'hidden' })
    const id = requestAnimationFrame(place)
    return () => cancelAnimationFrame(id)
  }, [open, place])

  useEffect(() => {
    if (!open) return

    const reposition = () => place()
    const close = (event) => {
      if (anchorRef?.current?.contains(event.target)) return
      if (popoverRef.current?.contains(event.target)) return
      onClose?.()
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose?.()
      requestAnimationFrame(() => anchorRef?.current?.focus?.())
    }

    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, anchorRef, onClose, place])

  if (!open || typeof document === 'undefined' || !document.body) return null

  return createPortal(
    <div ref={popoverRef} className={className} style={style}>
      {children}
    </div>,
    document.body
  )
}
