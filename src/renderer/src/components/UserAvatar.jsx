import React from 'react'
import { rgba } from '../lib/ui'

// The one identity avatar: gradient letter tile with the provider/profile
// picture layered on top when present (the letter shows through if the image
// fails to load). Shared by the TitleBar chip, UserManager rows and the
// ProfileViewer hero — keep any surface-specific chrome (borders, shadows,
// hover overlays) on the caller, not here.
export default function UserAvatar({ user, color, size, fontSize, radius, gradient = [0.9, 0.4], style }) {
  const c = color || user?.color || 'var(--accent)'
  return (
    <span
      className="flex items-center justify-center"
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(150deg, ${rgba(c, gradient[0])}, ${rgba(c, gradient[1])})`,
        color: '#0a0a0c',
        fontWeight: 900,
        fontSize,
        ...style
      }}
    >
      {user?.avatar || user?.name?.[0]?.toUpperCase()}
      {user?.avatarUrl && (
        <img
          src={user.avatarUrl}
          alt=""
          draggable={false}
          onError={e => { e.target.style.display = 'none' }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
    </span>
  )
}
