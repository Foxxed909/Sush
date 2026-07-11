import React, { useState } from 'react'
import Icon from './Icons'
import ProviderButtons from './ProviderButtons'
import UserAvatar from './UserAvatar'
import { rgba } from '../lib/ui'

const USER_COLORS = ['#ff6b9d', '#a78bfa', '#5fd3a8', '#ffcb6b', '#60a5fa', '#f97316', '#38bdf8', '#ef4444']

// Manage Sush identities: rename, recolor, change PIN, isolation level,
// delete (optionally wiping the identity's data directory + stored state).
export default function UserManager({ users, currentUser, accent, onClose, onChanged, onRemove }) {
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)  // user object
  const [wipe, setWipe] = useState(true)
  const [error, setError] = useState('')

  const startEdit = (user) => {
    setEditingId(user.id)
    setError('')
    setForm({ name: user.name, color: user.color, isolation: user.isolation, pin: '', clearPin: false })
  }

  const save = async () => {
    setError('')
    const payload = {
      id: editingId,
      patch: { name: form.name, color: form.color, isolation: form.isolation }
    }
    if (form.clearPin) payload.newPin = ''
    else if (form.pin) payload.newPin = form.pin
    const res = await window.sush.usersUpdate(payload)
    if (!res?.ok) { setError(res?.error || 'Update failed'); return }
    setEditingId(null)
    setForm(null)
    onChanged?.()
  }

  const doDelete = async () => {
    const res = await onRemove?.(confirmDelete.id, wipe)
    if (res && !res.ok) { setError(res.error || 'Delete failed'); return }
    setConfirmDelete(null)
  }

  const unlink = async (userId, provider) => {
    setError('')
    const res = await window.sush.oauthUnlink({ userId, provider })
    if (!res?.ok) { setError(res?.error || 'Unlink failed'); return }
    onChanged?.()
  }

  const field = {
    width: '100%',
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'var(--text-1)',
    borderRadius: 9,
    padding: '8px 11px',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit'
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 3000, background: 'rgba(4,6,9,0.7)', backdropFilter: 'blur(6px)' }} onMouseDown={onClose}>
      <div
        data-glass
        onMouseDown={e => e.stopPropagation()}
        className="sush-fade-up"
        style={{
          width: 'min(92vw, 520px)',
          maxHeight: '82vh',
          overflow: 'auto',
          background: 'rgba(13,16,21,0.92)',
          border: `1px solid ${rgba(accent, 0.25)}`,
          borderRadius: 'var(--r-xl, 16px)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.65)',
          padding: 22
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <div className="flex items-center" style={{ gap: 9 }}>
            <Icon name="users" size={16} color={accent} strokeWidth={2.2} />
            <span style={{ color: 'var(--text-1)', fontWeight: 900, fontSize: 15 }}>Users</span>
            <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700 }}>{users.length} identit{users.length === 1 ? 'y' : 'ies'}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {confirmDelete ? (
          <div style={{ padding: '6px 2px' }}>
            <div style={{ color: 'var(--text-1)', fontWeight: 800, fontSize: 14, marginBottom: 8 }}>
              Delete “{confirmDelete.name}”?
            </div>
            <div style={{ color: 'var(--text-3)', fontSize: 12.5, lineHeight: 1.6, marginBottom: 14 }}>
              This removes the identity from Sush.
              {confirmDelete.id === currentUser?.id && ' You are deleting the signed-in user — you will be signed out.'}
            </div>
            <label className="flex items-center" style={{ gap: 8, color: 'var(--text-2)', fontSize: 12.5, marginBottom: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={wipe} onChange={e => setWipe(e.target.checked)} />
              Also wipe their data (CLI logins under their identity folder + Sush state)
            </label>
            {error && <div style={{ color: '#ff8aa0', fontSize: 12, marginBottom: 10 }}>{error}</div>}
            <div className="flex" style={{ gap: 8 }}>
              <button onClick={doDelete} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: '#ff5370', color: '#0a0a0c', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>
                Delete user
              </button>
              <button onClick={() => { setConfirmDelete(null); setError('') }} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: 'var(--text-2)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: 10 }}>
            {users.map(user => (
              <div key={user.id} style={{ border: `1px solid ${editingId === user.id ? rgba(user.color, 0.5) : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, background: 'rgba(255,255,255,0.025)', padding: 12 }}>
                <div className="flex items-center" style={{ gap: 11 }}>
                  <UserAvatar user={user} size={36} fontSize={15} radius="28%" gradient={[0.85, 0.35]} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="flex items-center" style={{ gap: 7 }}>
                      <span style={{ color: 'var(--text-1)', fontWeight: 800, fontSize: 13.5 }}>{user.name}</span>
                      {user.id === currentUser?.id && (
                        <span style={{ fontSize: 9, fontWeight: 900, color: user.color, background: rgba(user.color, 0.12), border: `1px solid ${rgba(user.color, 0.3)}`, borderRadius: 999, padding: '1px 7px', letterSpacing: 0.5 }}>YOU</span>
                      )}
                      {user.hasPin && <Icon name="lock" size={11} color="var(--text-3)" />}
                    </span>
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>
                      {user.isolation === 'full' ? 'Full home isolation' : 'CLI isolation (claude · codex · gh · XDG)'}
                    </span>
                  </span>
                  {user.id === currentUser?.id && (
                    <>
                      <button onClick={() => editingId === user.id ? (setEditingId(null), setForm(null)) : startEdit(user)} style={{ background: 'none', border: 'none', color: accent, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                        {editingId === user.id ? 'close' : 'edit'}
                      </button>
                      <button
                        onClick={() => { setConfirmDelete(user); setWipe(true); setError('') }}
                        disabled={users.length <= 1}
                        title={users.length <= 1 ? 'The last user cannot be deleted' : 'Delete your active identity'}
                        style={{ background: 'none', border: 'none', color: users.length <= 1 ? 'var(--text-5)' : '#ff5370', cursor: users.length <= 1 ? 'default' : 'pointer', fontSize: 12, fontWeight: 800 }}
                      >
                        delete
                      </button>
                    </>
                  )}
                </div>

                {editingId === user.id && form && (
                  <div className="flex flex-col" style={{ gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name" maxLength={32} style={field} />
                    <div style={{ display: 'flex', gap: 7 }}>
                      {USER_COLORS.map(c => (
                        <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} className="sush-swatch" data-active={form.color === c} style={{ background: c, '--swatch-glow': rgba(c, 0.7) }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {['cli', 'full'].map(level => (
                        <button
                          key={level}
                          onClick={() => setForm(f => ({ ...f, isolation: level }))}
                          style={{ flex: 1, padding: '7px 0', borderRadius: 9, cursor: 'pointer', fontSize: 11.5, fontWeight: 800, border: `1px solid ${form.isolation === level ? rgba(user.color, 0.55) : 'rgba(255,255,255,0.1)'}`, background: form.isolation === level ? rgba(user.color, 0.12) : 'transparent', color: form.isolation === level ? 'var(--text-1)' : 'var(--text-3)' }}
                        >
                          {level === 'cli' ? 'CLI isolation' : 'Full home'}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-4)', lineHeight: 1.5 }}>
                      Isolation changes apply to <b>new</b> sessions only. Full home gives this user fresh dotfiles (git, ssh, npm…) — their existing CLI logins under CLI isolation carry over.
                    </div>
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <input
                        value={form.pin}
                        onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 8), clearPin: false }))}
                        placeholder={user.hasPin ? 'New PIN (leave empty to keep)' : 'Set PIN (4–8 digits)'}
                        type="password"
                        inputMode="numeric"
                        style={{ ...field, flex: 1 }}
                      />
                      {user.hasPin && (
                        <label className="flex items-center" style={{ gap: 6, fontSize: 11.5, color: 'var(--text-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={form.clearPin} onChange={e => setForm(f => ({ ...f, clearPin: e.target.checked, pin: '' }))} />
                          remove PIN
                        </label>
                      )}
                    </div>
                    <div style={{ paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: 1, marginBottom: 8 }}>CONNECTED ACCOUNTS</div>
                      {['google', 'github'].map(p => {
                        const rec = user.providers?.[p]
                        if (!rec) return null
                        return (
                          <div key={p} className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
                            <Icon name={p} size={13} color="var(--text-2)" />
                            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p === 'google' ? (rec.email || rec.name || 'Google account') : `@${rec.login}`}
                            </span>
                            <button onClick={() => unlink(user.id, p)} style={{ background: 'none', border: 'none', color: '#ff5370', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
                              unlink
                            </button>
                          </div>
                        )
                      })}
                      {(!user.providers?.google || !user.providers?.github) && (
                        <ProviderButtons
                          mode="link"
                          userId={user.id}
                          accent={user.color}
                          compact
                          providers={['google', 'github'].filter(p => !user.providers?.[p])}
                          onResult={() => onChanged?.()}
                        />
                      )}
                    </div>
                    {error && <div style={{ color: '#ff8aa0', fontSize: 12 }}>{error}</div>}
                    <div>
                      <button onClick={save} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: user.color, color: '#0a0a0c', fontWeight: 900, fontSize: 12.5, cursor: 'pointer' }}>
                        Save changes
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div style={{ fontSize: 10.5, color: 'var(--text-4)', lineHeight: 1.6, marginTop: 4 }}>
              Each identity manages its own PIN and connected accounts after signing in. CLI logins live in <code style={{ color: 'var(--text-3)' }}>identities/&lt;id&gt;/home</code>, and signing out closes that identity's sessions.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
