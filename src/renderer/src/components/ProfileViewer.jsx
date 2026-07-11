import React, { useRef, useState } from 'react'
import Icon from './Icons'
import UserAvatar from './UserAvatar'
import { rgba } from '../lib/ui'

// Downscale + center-crop a picked image to a small square JPEG data URL so
// it can live inside sush-users.json (~10-20KB) without bloating the store.
// Exported: the lock-screen create form uses the same pipeline.
export function fileToAvatarDataUrl(file, size = 128) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        const side = Math.min(img.width, img.height)
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      } catch (e) {
        reject(e)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')) }
    img.src = url
  })
}

// Who am I, at a glance: big avatar (click to change), identity details,
// linked accounts (with unlink), Lock / Sign out, and account deletion.
export default function ProfileViewer({ user, accent, onClose, onChanged, onLock, onSignOut, onManageUsers, onDeleteAccount }) {
  const fileRef = useRef(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [hover, setHover] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  if (!user) return null
  const color = user.color || accent
  const github = user.providers?.github
  const google = user.providers?.google

  const unlink = async (provider) => {
    setError('')
    const res = await window.sush.oauthUnlink({ userId: user.id, provider })
    if (!res?.ok) setError(res?.error || `Could not unlink ${provider}`)
    else onChanged?.()
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const dataUrl = await fileToAvatarDataUrl(file)
      const res = await window.sush.usersUpdate({ id: user.id, patch: { avatarUrl: dataUrl } })
      if (!res?.ok) setError(res?.error || 'Could not save the photo')
      else onChanged?.()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const removePhoto = async () => {
    setError('')
    const res = await window.sush.usersUpdate({ id: user.id, patch: { avatarUrl: '' } })
    if (!res?.ok) setError(res?.error || 'Could not remove the photo')
    else onChanged?.()
  }

  const memberSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' }) : null

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 3000, background: 'rgba(4,6,9,0.7)', backdropFilter: 'blur(6px)' }} onMouseDown={onClose}>
      <div
        data-glass
        onMouseDown={e => e.stopPropagation()}
        className="sush-fade-up"
        style={{
          width: 'min(92vw, 380px)',
          background: 'rgba(13,16,21,0.94)',
          border: `1px solid ${rgba(color, 0.3)}`,
          borderRadius: 'var(--r-xl, 16px)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.65)',
          padding: '26px 24px 22px',
          textAlign: 'center'
        }}
      >
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>

        {/* Avatar (click to change) */}
        <button
          onClick={() => fileRef.current?.click()}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          title="Change profile picture"
          className="flex items-center justify-center"
          style={{
            position: 'relative', width: 96, height: 96, margin: '0 auto', borderRadius: '30%', overflow: 'hidden',
            background: 'none',
            border: `1px solid ${rgba(color, 0.65)}`,
            boxShadow: `0 14px 40px ${rgba(color, 0.35)}`,
            cursor: 'pointer', padding: 0
          }}
        >
          <UserAvatar user={user} color={color} size="100%" fontSize={38} radius={0} />
          {(hover || busy) && (
            <span className="flex items-center justify-center" style={{ position: 'absolute', inset: 0, background: 'rgba(5,7,10,0.55)', color: 'var(--text-1)' }}>
              <Icon name="edit" size={20} strokeWidth={2.2} />
            </span>
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8 }}>
          <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ background: 'none', border: 'none', color: color, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
            {busy ? 'saving...' : 'change photo'}
          </button>
          {user.avatarUrl && (
            <button onClick={removePhoto} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              remove
            </button>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 19, fontWeight: 900, color: 'var(--text-1)' }}>{user.name}</div>
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-3)' }}>
          {user.isolation === 'full' ? 'Full home isolation' : 'CLI isolation'}
          {user.hasPin ? ' - PIN set' : ''}
          {memberSince ? ` - since ${memberSince}` : ''}
        </div>

        {/* Linked accounts */}
        <div style={{ margin: '16px 0 4px', textAlign: 'left' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: 1, marginBottom: 8 }}>CONNECTED ACCOUNTS</div>
          {!github && !google && (
            <div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>
              None linked - connect Google or GitHub in <button onClick={onManageUsers} style={{ background: 'none', border: 'none', color: color, fontWeight: 800, cursor: 'pointer', fontSize: 11.5, padding: 0 }}>Manage Users</button>.
            </div>
          )}
          {github && (
            <div className="flex items-center" style={{ gap: 8, padding: '5px 0' }}>
              <Icon name="github" size={13} color="var(--text-2)" />
              <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>@{github.login}</span>
              <button onClick={() => unlink('github')} title="Unlink GitHub from this account" style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                unlink
              </button>
            </div>
          )}
          {google && (
            <div className="flex items-center" style={{ gap: 8, padding: '5px 0' }}>
              <Icon name="google" size={13} color="var(--text-2)" />
              <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>{google.email || google.name}</span>
              <button onClick={() => unlink('google')} title="Unlink Google from this account" style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                unlink
              </button>
            </div>
          )}
        </div>

        {error && <div style={{ color: '#ff8aa0', fontSize: 11.5, fontWeight: 700, marginTop: 8 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button
            onClick={() => { onClose(); onLock?.() }}
            style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: `1px solid ${rgba(color, 0.4)}`, background: rgba(color, 0.1), color: 'var(--text-1)', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
          >
            <Icon name="lock" size={12} style={{ verticalAlign: -2, marginRight: 6 }} />Lock
          </button>
          <button
            onClick={() => { onClose(); onSignOut?.() }}
            style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: '1px solid rgba(255,83,112,0.4)', background: 'rgba(255,83,112,0.1)', color: '#ff8aa0', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
          >
            <Icon name="logout" size={12} style={{ verticalAlign: -2, marginRight: 6 }} />Sign out
          </button>
        </div>

        {/* Delete account — two-step, honest about what it does */}
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--text-4)', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}
          >
            Delete this account...
          </button>
        ) : (
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,83,112,0.06)', border: '1px solid rgba(255,83,112,0.25)', textAlign: 'left' }}>
            <div style={{ fontSize: 11.5, color: '#ffb3c0', fontWeight: 700, lineHeight: 1.5 }}>
              Delete "{user.name}" from Sush? Sessions close and the profile disappears from the lock screen. CLI logins and files in its home folder stay on disk.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={() => { onClose(); onDeleteAccount?.(user.id) }}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#ff5370', color: '#0a0a0c', fontWeight: 900, fontSize: 11.5, cursor: 'pointer' }}
              >
                Delete account
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: 'var(--text-2)', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}
              >
                Keep it
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
