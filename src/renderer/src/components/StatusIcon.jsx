import React from 'react'

// Status as a shape, not a coloured dot: a check for ok, a spinning arc for
// working, an exclamation for needs-you, a cross for errors, a pause for
// idle. Colour still helps, but the shape carries the meaning on its own
// (colour-blind safe, and it reads at 10px).
const TONES = {
  ok: '#5fd3a8',
  working: 'var(--accent)',
  attention: '#ffcb6b',
  warning: '#ffcb6b',
  error: '#ff6b81',
  idle: 'var(--text-4)',
  info: '#7cc4ff',
  accent: 'var(--accent)'
}

function Glyph({ tone }) {
  switch (tone) {
    case 'ok':
      return <polyline points="7.5 12.5 10.5 15.5 16.5 9" />
    case 'working':
      return <path d="M12 5.5a6.5 6.5 0 1 1-6.5 6.5" />
    case 'attention':
    case 'warning':
      return <><line x1="12" y1="7.5" x2="12" y2="13" /><line x1="12" y1="16.5" x2="12.01" y2="16.5" /></>
    case 'error':
      return <><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></>
    case 'info':
      return <><line x1="12" y1="11" x2="12" y2="16" /><line x1="12" y1="8" x2="12.01" y2="8" /></>
    case 'accent':
      return <path d="M12 6.5l1.4 4.1 4.1 1.4-4.1 1.4L12 17.5l-1.4-4.1L6.5 12l4.1-1.4z" />
    default: // idle
      return <><line x1="10" y1="9" x2="10" y2="15" /><line x1="14" y1="9" x2="14" y2="15" /></>
  }
}

export default function StatusIcon({ tone = 'idle', size = 12, title, className = '', ring = true }) {
  const color = TONES[tone] || TONES.idle
  return (
    <svg
      className={`status-icon is-${tone} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ flexShrink: 0, display: 'block' }}
    >
      {title && <title>{title}</title>}
      {ring && tone !== 'working' && <circle cx="12" cy="12" r="10" fill={color} fillOpacity={0.2} stroke="none" />}
      {tone === 'working' && <circle cx="12" cy="12" r="6.5" stroke={color} strokeOpacity={0.22} />}
      <Glyph tone={tone} />
    </svg>
  )
}

// Agent activity state (lib/agentActivity.js) to a status tone.
export function toneForState(id) {
  return { working: 'working', booting: 'working', waiting: 'attention', error: 'error', done: 'ok' }[id] || 'idle'
}
