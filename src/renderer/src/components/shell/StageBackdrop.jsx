import React, { useId } from 'react'

// Sidebar header art for the Nightly channel — ported from T3 Code's
// SidebarStageBackdrop "nightly" sky (MIT, (c) 2026 T3 Tools Inc.): a night
// gradient, a soft glow, a tiled star field and two blurred cloud banks,
// masked so it fades into the sidebar instead of ending at a hard edge.
// Colours come from --stage-night-* (index.css), tuned to Sush's palette.

const STARS = [
  [14, 10, 0.6, 0.85], [38, 22, 0.4, 0.55], [58, 8, 0.5, 0.7], [84, 16, 0.4, 0.5],
  [104, 7, 0.6, 0.8], [126, 20, 0.4, 0.55], [148, 11, 0.5, 0.7], [170, 24, 0.4, 0.5],
  [192, 9, 0.6, 0.8], [214, 18, 0.4, 0.55], [236, 8, 0.5, 0.7], [258, 20, 0.45, 0.6],
  [278, 11, 0.55, 0.75], [26, 34, 0.4, 0.45], [118, 34, 0.4, 0.45], [202, 32, 0.4, 0.5],
  [268, 34, 0.4, 0.45]
]
const SPARKLES = [[70, 28], [160, 36], [246, 26]]

export default function StageBackdrop() {
  const id = useId().replace(/:/g, '')
  const sky = `${id}-sky`
  const glow = `${id}-glow`
  const cloud = `${id}-cloud`
  const soft = `${id}-soft`
  const stars = `${id}-stars`
  const glows = `${id}-glows`
  return (
    <div className="ts-stage-art" aria-hidden>
      <svg width="100%" height="100%" fill="none" preserveAspectRatio="xMinYMin slice" viewBox="0 0 8192 96" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={sky} x1="24" y1="0" x2="264" y2="96" gradientUnits="userSpaceOnUse" spreadMethod="reflect">
            <stop style={{ stopColor: 'var(--stage-night-bottom)' }} />
            <stop offset="0.5" style={{ stopColor: 'var(--stage-night-mid)' }} />
            <stop offset="1" style={{ stopColor: 'var(--stage-night-top)' }} />
          </linearGradient>
          <radialGradient id={glow} cx="0" cy="0" r="1" gradientTransform="translate(216 18) rotate(137) scale(120 84)" gradientUnits="userSpaceOnUse">
            <stop style={{ stopColor: 'var(--stage-night-glow-highlight)' }} stopOpacity="0.4" />
            <stop offset="0.5" style={{ stopColor: 'var(--stage-night-glow-secondary)' }} stopOpacity="0.16" />
            <stop offset="1" style={{ stopColor: 'var(--stage-night-bottom)' }} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={cloud} x1="0" y1="60" x2="288" y2="96" gradientUnits="userSpaceOnUse">
            <stop style={{ stopColor: 'var(--stage-night-highlight)' }} stopOpacity="0.5" />
            <stop offset="0.52" style={{ stopColor: 'var(--stage-night-secondary)' }} stopOpacity="0.62" />
            <stop offset="1" style={{ stopColor: 'var(--stage-night-tertiary)' }} stopOpacity="0.5" />
          </linearGradient>
          <filter id={soft} x="-24" y="-24" width="336" height="144" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <pattern id={stars} width="288" height="96" patternUnits="userSpaceOnUse">
            <g style={{ fill: 'var(--stage-night-line)' }}>
              {STARS.map(([cx, cy, r, o]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fillOpacity={o} />)}
            </g>
            <g style={{ stroke: 'var(--stage-night-sparkle)' }} strokeLinecap="round" strokeOpacity="0.7" strokeWidth="0.6">
              {SPARKLES.map(([x, y]) => (
                <g key={`${x}-${y}`}>
                  <path d={`M${x - 1.5} ${y}H${x + 1.5}`} />
                  <path d={`M${x} ${y - 1.5}V${y + 1.5}`} />
                </g>
              ))}
            </g>
          </pattern>
          <pattern id={glows} width="640" height="96" patternUnits="userSpaceOnUse">
            <rect width="640" height="96" fill={`url(#${glow})`} />
          </pattern>
        </defs>
        <rect width="100%" height="96" fill={`url(#${sky})`} />
        <rect width="100%" height="96" fill={`url(#${glows})`} />
        <rect width="100%" height="96" fill={`url(#${stars})`} />
        <g filter={`url(#${soft})`}>
          <path d="M-12 88C-12 74 0 63 14 63C18 50 30 41 44 41C58 41 70 49 74 62C79 57 86 54 94 54C110 54 123 66 124 82C132 83 138 88 141 96H-12V88Z" fill={`url(#${cloud})`} />
        </g>
        <g filter={`url(#${soft})`}>
          <path d="M150 96C151 84 161 75 173 75C176 64 186 57 198 57C210 57 220 64 223 75C231 75 238 80 241 87C250 87 257 91 260 96H150Z" fill={`url(#${cloud})`} fillOpacity="0.8" />
        </g>
      </svg>
    </div>
  )
}
