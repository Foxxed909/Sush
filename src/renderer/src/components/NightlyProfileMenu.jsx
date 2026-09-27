import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

function Avatar({ user, accent }) {
  const color = user?.color || accent
  return (
    <span className="nightly-profile-avatar" style={{ background: rgba(color, .15), borderColor: rgba(color, .35), color }}>
      {user?.avatar || user?.name?.[0]?.toUpperCase() || '?'}
      {user?.avatarUrl && (
        <img
          src={user.avatarUrl}
          alt=""
          onError={e => { e.currentTarget.style.display = 'none' }}
          draggable={false}
        />
      )}
    </span>
  )
}

export default function NightlyProfileMenu({
  user,
  accent,
  onViewProfile,
  onLock,
  onSignOut,
  onManageUsers
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const run = fn => {
    setOpen(false)
    fn?.()
  }

  if (!user) return null

  return (
    <div ref={ref} className="nightly-profile-menu">
      <button
        className="nightly-profile-trigger"
        onClick={() => setOpen(v => !v)}
        title={`Signed in as ${user.name}`}
      >
        <Avatar user={user} accent={accent} />
        <span className="nightly-profile-copy">
          <strong>{user.name}</strong>
          <small>{user.isolation === 'full' ? 'Full isolation' : 'CLI logins isolated'}</small>
        </span>
        <Icon name="chevronDown" size={11} />
      </button>

      {open && (
        <div className="nightly-profile-popover">
          <button onClick={() => run(onViewProfile)}>
            <Icon name="users" size={13} />
            <span>View profile</span>
          </button>
          <button onClick={() => run(onLock)}>
            <Icon name="lock" size={13} />
            <span>Lock Sush</span>
            <small>sessions keep running</small>
          </button>
          <button onClick={() => run(onSignOut)}>
            <Icon name="refresh" size={13} />
            <span>Switch user…</span>
          </button>
          <button onClick={() => run(onManageUsers)}>
            <Icon name="settings" size={13} />
            <span>Manage users…</span>
          </button>
          <div className="nightly-profile-divider" />
          <button className="is-danger" onClick={() => run(onSignOut)}>
            <Icon name="logout" size={13} />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  )
}
