import React, { useEffect, useRef } from 'react'

// The Seducia orb. Layers, back to front:
//   halo     big soft pink/violet bloom, breathing
//   aurora   two counter-rotating conic rings (blurred once, then only rotated)
//   ripples  three rings that expand while listening, sized by the mic level
//   core     glossy sphere with a slow inner swirl and a specular highlight
//   sparks   particles orbiting on a tilted plane
// States: idle · listening · thinking · speaking. Everything animates with
// transform/opacity (filters are static), so it stays cheap on Windows. The
// mic level arrives as a CSS variable written per frame, not a re-render.
export default function SushOrb({ size = 64, state = 'idle', level = null, levelRef = null, onClick, label = 'Seducia', className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!levelRef || state !== 'listening') { ref.current?.style.setProperty('--level', '0'); return undefined }
    let raf
    let smooth = 0
    const tick = () => {
      const target = Math.min(1, Math.max(0, levelRef.current || 0))
      smooth += (target - smooth) * 0.35
      ref.current?.style.setProperty('--level', smooth.toFixed(3))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [levelRef, state])

  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag
      ref={ref}
      type={onClick ? 'button' : undefined}
      className={`sorb is-${state} ${className}`}
      style={{ '--orb': `${size}px`, ...(level != null ? { '--level': level } : null) }}
      onClick={onClick}
      aria-label={onClick ? (state === 'listening' ? 'Stop listening' : `Talk to ${label}`) : undefined}
      aria-hidden={onClick ? undefined : true}
    >
      <span className="sorb-halo" />
      <span className="sorb-aurora" />
      <span className="sorb-aurora is-b" />
      <span className="sorb-ripple" />
      <span className="sorb-ripple is-2" />
      <span className="sorb-ripple is-3" />
      <span className="sorb-core">
        <span className="sorb-swirl" />
        <span className="sorb-gloss" />
      </span>
      <span className="sorb-sparks">
        {Array.from({ length: 6 }, (_, i) => <i key={i} style={{ '--i': i }} />)}
      </span>
    </Tag>
  )
}
