import React, { useEffect, useRef, useState } from 'react'

// Keeps an overlay mounted for its exit animation. `children` renders while
// `show` is true; when it turns false the last render stays for `ms` inside a
// .sush-overlay-leave wrapper (fade + slight drop, see index.css), then goes.
// Under reduced motion the exit is skipped.
export default function Presence({ show, ms = 150, children }) {
  const last = useRef(null)
  const [leaving, setLeaving] = useState(false)
  if (show) last.current = children
  useEffect(() => {
    if (show) { setLeaving(false); return undefined }
    if (!last.current) return undefined
    const reduced = document.documentElement.classList.contains('sush-motion-reduced')
    if (reduced) { last.current = null; setLeaving(false); return undefined }
    setLeaving(true)
    const t = setTimeout(() => { last.current = null; setLeaving(false) }, ms)
    return () => clearTimeout(t)
  }, [show, ms])
  if (show) return children
  if (!leaving || !last.current) return null
  return <div className="sush-overlay-leave" aria-hidden>{last.current}</div>
}
