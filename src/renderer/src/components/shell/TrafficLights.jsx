import React, { useEffect, useState } from 'react'

// macOS window controls, on every platform: close · minimize · zoom. The
// glyphs appear when the pointer is over the group (as on a Mac); when the
// window loses focus the lights go grey, which is how a Mac tells you which
// window has the keyboard. Wired to the same windowControl IPC as before.
export default function TrafficLights({ className = '' }) {
  const [focused, setFocused] = useState(() => (typeof document === 'undefined' ? true : document.hasFocus()))
  useEffect(() => {
    const on = () => setFocused(true)
    const off = () => setFocused(false)
    window.addEventListener('focus', on)
    window.addEventListener('blur', off)
    return () => { window.removeEventListener('focus', on); window.removeEventListener('blur', off) }
  }, [])
  const control = (action) => window.sush?.windowControl?.(action)
  return (
    <div className={`mac-lights${focused ? '' : ' is-inactive'} ${className}`} role="group" aria-label="Window">
      <button type="button" className="mac-light is-close" onClick={() => control('close')} aria-label="Close window" title="Close">
        <svg viewBox="0 0 12 12" aria-hidden><path d="M3.6 3.6l4.8 4.8M8.4 3.6l-4.8 4.8" /></svg>
      </button>
      <button type="button" className="mac-light is-min" onClick={() => control('minimize')} aria-label="Minimize window" title="Minimize">
        <svg viewBox="0 0 12 12" aria-hidden><path d="M3 6h6" /></svg>
      </button>
      <button type="button" className="mac-light is-zoom" onClick={() => control('maximize')} aria-label="Zoom window" title="Zoom">
        <svg viewBox="0 0 12 12" aria-hidden><path d="M3.4 8.6V4.8l3.8 3.8zM8.6 3.4v3.8L4.8 3.4z" className="is-fill" /></svg>
      </button>
    </div>
  )
}
