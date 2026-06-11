import React, { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icons'
import ProviderButtons from './ProviderButtons'
import { rgba } from '../lib/ui'

const USER_COLORS = ['#ff6b9d', '#a78bfa', '#5fd3a8', '#ffcb6b', '#60a5fa', '#f97316', '#38bdf8', '#ef4444']

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

function Avatar({ user, size = 64, ring = true, dim = false }) {
  const color = user?.color || '#ff6b9d'
  const [imgFailed, setImgFailed] = useState(false)
  const showImg = !!user?.avatarUrl && !imgFailed
  return (
    <div
      className="flex items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: '28%',
        flexShrink: 0,
        overflow: 'hidden',
        background: `linear-gradient(150deg, ${rgba(color, 0.85)}, ${rgba(color, 0.35)})`,
        border: `1px solid ${rgba(color, 0.65)}`,
        boxShadow: ring ? `0 10px 34px ${rgba(color, dim ? 0.12 : 0.35)}, inset 0 1px 0 rgba(255,255,255,0.3)` : 'none',
        color: '#0a0a0c',
        fontWeight: 900,
        fontSize: size * 0.4,
        letterSpacing: 0.5,
        userSelect: 'none',
        filter: dim ? 'saturate(0.55) brightness(0.8)' : 'none',
        transition: 'filter .2s ease, box-shadow .2s ease'
      }}
    >
      {showImg ? (
        <img
          src={user.avatarUrl}
          alt=""
          draggable={false}
          onError={() => setImgFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        user?.avatar || (user?.name?.[0] ?? '?').toUpperCase()
      )}
    </div>
  )
}

function PinDots({ length, max = 8, error }) {
  const count = Math.max(4, Math.min(max, Math.max(length, 4)))
  return (
    <div className={error ? 'sush-lock-shake' : undefined} style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          style={{
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: i < length ? (error ? '#ff5370' : '#f1f4f6') : 'rgba(255,255,255,0.14)',
            border: `1px solid ${i < length ? 'transparent' : 'rgba(255,255,255,0.22)'}`,
            transition: 'background .12s ease'
          }}
        />
      ))}
    </div>
  )
}

function GhostButton({ children, onClick, danger, autoFocus }) {
  return (
    <button
      onClick={onClick}
      autoFocus={autoFocus}
      className="sush-lock-ghost"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${danger ? 'rgba(255,83,112,0.35)' : 'rgba(255,255,255,0.12)'}`,
        color: danger ? '#ff8aa0' : '#c6cdd4',
        borderRadius: 10,
        padding: '8px 16px',
        fontSize: 12.5,
        fontWeight: 700,
        cursor: 'pointer'
      }}
    >
      {children}
    </button>
  )
}

// Full-screen identity gate. Three modes:
//   pick   — choose among all users (sign-in screen)
//   locked — the signed-in user locked the app; only they can resume
//   create — new-user form (also the first-run experience)
export default function LockScreen({
  users = [],
  lastUserId = null,
  lockedUser = null,
  onUnlock,            // (user, pin) => Promise<{ ok, error? }>
  onCreate,            // (form) => Promise<{ ok, error? }>
  onSwitchRequest,     // sign out the locked user, fall back to picker
  onProviderSignedIn   // (user) => void — main already activated the user
}) {
  const firstRun = users.length === 0
  const [mode, setMode] = useState(firstRun ? 'create' : lockedUser ? 'locked' : 'pick')
  const [selected, setSelected] = useState(() =>
    lockedUser || users.find(u => u.id === lastUserId) || users[0] || null
  )
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', color: USER_COLORS[0], pin: '', isolation: 'cli', avatarUrl: '', providerTicket: '', providerLabel: '' })
  const pinInputRef = useRef(null)
  const now = useClock()

  // A provider flow finished: either main matched + activated an identity
  // (hand it up), or we got a one-shot ticket for a brand-new face (land on
  // the create form prefilled from their profile).
  const handleProviderResult = (ev) => {
    if (ev?.mode !== 'signin') return
    if (ev.user) { onProviderSignedIn?.(ev.user); return }
    if (ev.ticket) {
      setForm(f => ({
        ...f,
        name: String(ev.profile?.name || ev.profile?.login || '').slice(0, 32),
        avatarUrl: ev.profile?.picture || ev.profile?.avatarUrl || '',
        providerTicket: ev.ticket,
        providerLabel: ev.provider === 'github' ? 'GitHub' : 'Google'
      }))
      setMode('create')
      setError('')
    }
  }

  const accent = (mode === 'create' ? form.color : selected?.color) || '#ff6b9d'
  const needsPin = mode !== 'create' && !!selected?.hasPin

  useEffect(() => {
    if (needsPin) setTimeout(() => pinInputRef.current?.focus(), 80)
  }, [needsPin, selected?.id])

  const attemptUnlock = async (user, pinValue) => {
    if (busy || !user) return
    setBusy(true)
    setError('')
    const res = await onUnlock(user, pinValue)
    if (!res?.ok) {
      setError(res?.error || 'Sign-in failed')
      setPin('')
      setTimeout(() => setError(''), 900)
    }
    setBusy(false)
  }

  const choose = (user) => {
    setSelected(user)
    setPin('')
    setError('')
    if (!user.hasPin) attemptUnlock(user, '')
  }

  const submitPin = (e) => {
    e?.preventDefault?.()
    if (pin.length >= 4) attemptUnlock(selected, pin)
  }

  const submitCreate = async (e) => {
    e?.preventDefault?.()
    if (busy) return
    if (!form.name.trim()) { setError('Give yourself a name'); return }
    if (form.pin && !/^\d{4,8}$/.test(form.pin)) { setError('PIN must be 4–8 digits'); return }
    setBusy(true)
    setError('')
    const res = await onCreate(form)
    if (!res?.ok) setError(res?.error || 'Could not create user')
    setBusy(false)
  }

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
  const blobs = useMemo(() => {
    const palette = users.length ? users.map(u => u.color || '#ff6b9d') : [form.color]
    return [
      { color: palette[0 % palette.length], top: '-12%', left: '-8%', size: 560, delay: '0s' },
      { color: palette[1 % palette.length], top: '50%', left: '78%', size: 520, delay: '-6s' },
      { color: palette[2 % palette.length], top: '74%', left: '6%', size: 430, delay: '-12s' }
    ]
  }, [users, form.color])

  const visibleUsers = mode === 'locked' ? [lockedUser].filter(Boolean) : users

  return (
    <div
      className="sush-lock-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#07090c',
        overflow: 'hidden',
        WebkitAppRegion: 'drag'
      }}
    >
      {/* Aurora backdrop tinted by user accents */}
      {blobs.map((b, i) => (
        <span
          key={i}
          className="sush-lock-blob"
          style={{
            position: 'absolute',
            top: b.top,
            left: b.left,
            width: b.size,
            height: b.size,
            borderRadius: '50%',
            background: `radial-gradient(circle at 35% 35%, ${rgba(b.color, 0.34)}, transparent 65%)`,
            filter: 'blur(70px)',
            animationDelay: b.delay,
            pointerEvents: 'none'
          }}
        />
      ))}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(1200px 700px at 50% 110%, rgba(0,0,0,0.55), transparent 60%)', pointerEvents: 'none' }} />

      {/* Window controls (frameless window still needs them) */}
      <div style={{ position: 'absolute', top: 12, right: 16, display: 'flex', gap: 8, WebkitAppRegion: 'no-drag' }}>
        {[['minimize', '−'], ['close', '×']].map(([action, sym]) => (
          <button
            key={action}
            onClick={() => window.sush.windowControl(action)}
            style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#8a939c', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
          >
            {sym}
          </button>
        ))}
      </div>

      <div className="sush-lock-card" style={{ WebkitAppRegion: 'no-drag', display: 'flex', flexDirection: 'column', alignItems: 'center', width: 'min(92vw, 760px)' }}>
        {/* Clock */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: -1.5, color: '#f3f6f8', lineHeight: 1, textShadow: '0 6px 40px rgba(0,0,0,0.5)' }}>{timeStr}</div>
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: '#8a939c' }}>{dateStr}</div>
          <div className="flex items-center justify-center" style={{ gap: 8, marginTop: 14 }}>
            <span style={{ width: 14, height: 14, borderRadius: 5, background: `linear-gradient(145deg, ${accent}, ${rgba(accent, 0.35)})`, boxShadow: `0 0 12px ${rgba(accent, 0.5)}` }} />
            <span style={{ color: '#aab3bb', fontWeight: 800, fontSize: 11.5, letterSpacing: 3 }}>SUSH</span>
          </div>
        </div>

        {mode === 'create' ? (
          /* ── Create user ──────────────────────────────────────────────── */
          <form onSubmit={submitCreate} className="sush-lock-panel" data-glass style={{ width: 'min(88vw, 420px)' }}>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <Avatar user={{ name: form.name || '?', color: form.color, avatar: form.name.trim() ? undefined : '+', avatarUrl: form.avatarUrl }} size={72} />
              <div style={{ marginTop: 12, fontSize: 16, fontWeight: 900, color: '#f1f4f6' }}>
                {firstRun ? 'Welcome to Sush' : 'New user'}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: '#8a939c' }}>
                {firstRun ? 'Create your identity — your CLI logins, theme and sessions stay yours.' : 'Their CLI logins and workspace stay fully separate.'}
              </div>
            </div>

            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Name"
              autoFocus
              spellCheck={false}
              maxLength={32}
              className="sush-lock-input"
            />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '14px 0' }}>
              {USER_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  className="sush-swatch"
                  data-active={form.color === c}
                  style={{ background: c, '--swatch-glow': rgba(c, 0.7) }}
                  title={c}
                />
              ))}
            </div>

            {form.providerTicket ? (
              <div style={{ fontSize: 11, color: '#8a939c', textAlign: 'center', marginBottom: 12 }}>
                <Icon name={form.providerLabel === 'GitHub' ? 'github' : 'google'} size={11} style={{ verticalAlign: -1, marginRight: 5 }} />
                Will be linked to your {form.providerLabel} account
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <ProviderButtons mode="signin" accent={form.color} compact onResult={handleProviderResult} />
              </div>
            )}

            <input
              value={form.pin}
              onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
              placeholder="PIN (optional, 4–8 digits)"
              inputMode="numeric"
              type="password"
              className="sush-lock-input"
            />
            <div style={{ fontSize: 10.5, color: '#5a646d', margin: '6px 2px 12px', lineHeight: 1.5 }}>
              A PIN keeps casual eyes out on a shared PC — it isn't encryption.
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[
                { id: 'cli', label: 'CLI isolation', desc: 'claude · codex · gh · XDG' },
                { id: 'full', label: 'Full home', desc: 'HOME / USERPROFILE too' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, isolation: opt.id }))}
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    padding: '9px 11px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    border: `1px solid ${form.isolation === opt.id ? rgba(form.color, 0.6) : 'rgba(255,255,255,0.1)'}`,
                    background: form.isolation === opt.id ? rgba(form.color, 0.12) : 'rgba(255,255,255,0.03)'
                  }}
                >
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: form.isolation === opt.id ? '#f1f4f6' : '#aab3bb' }}>{opt.label}</span>
                  <span style={{ display: 'block', fontSize: 10, color: '#69737d', marginTop: 2 }}>{opt.desc}</span>
                </button>
              ))}
            </div>

            {error && <div style={{ color: '#ff8aa0', fontSize: 12, fontWeight: 700, textAlign: 'center', marginBottom: 10 }}>{error}</div>}

            <button
              type="submit"
              disabled={busy}
              style={{
                width: '100%',
                padding: '11px 0',
                borderRadius: 11,
                border: 'none',
                background: form.color,
                color: '#0a0a0c',
                fontWeight: 900,
                fontSize: 13.5,
                cursor: 'pointer',
                opacity: busy ? 0.6 : 1,
                boxShadow: `0 10px 28px ${rgba(form.color, 0.35)}`
              }}
            >
              {busy ? 'Creating…' : firstRun ? 'Start using Sush' : 'Create user'}
            </button>

            {!firstRun && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <GhostButton onClick={() => { setMode('pick'); setError('') }}>
                  <Icon name="arrowRight" size={12} style={{ transform: 'rotate(180deg)' }} /> Back
                </GhostButton>
              </div>
            )}
          </form>
        ) : (
          /* ── Pick / unlock ─────────────────────────────────────────────── */
          <>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 26 }}>
              {visibleUsers.map(user => {
                const isSel = selected?.id === user.id
                return (
                  <button
                    key={user.id}
                    onClick={() => choose(user)}
                    className="sush-lock-user"
                    data-selected={isSel}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'center', width: 108, padding: 0 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
                      <Avatar user={user} size={68} dim={!isSel} />
                      {user.hasPin && (
                        <span
                          className="flex items-center justify-center"
                          style={{ position: 'absolute', right: 12, bottom: -4, width: 20, height: 20, borderRadius: '50%', background: '#10141a', border: '1px solid rgba(255,255,255,0.18)', color: '#aab3bb' }}
                        >
                          <Icon name="lock" size={10} strokeWidth={2.4} />
                        </span>
                      )}
                      {(user.providers?.github || user.providers?.google) && (
                        <span
                          className="flex items-center justify-center"
                          style={{ position: 'absolute', left: 12, bottom: -4, width: 20, height: 20, borderRadius: '50%', background: '#10141a', border: '1px solid rgba(255,255,255,0.18)', color: '#aab3bb' }}
                        >
                          <Icon name={user.providers?.github ? 'github' : 'google'} size={10} strokeWidth={2.2} />
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 13, fontWeight: 800, color: isSel ? '#f1f4f6' : '#8a939c' }}>{user.name}</div>
                    <div style={{ marginTop: 2, fontSize: 10, color: '#5a646d' }}>
                      {user.isolation === 'full' ? 'full isolation' : 'CLI isolation'}
                    </div>
                  </button>
                )
              })}
            </div>

            {needsPin && (
              <form onSubmit={submitPin} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <PinDots length={pin.length} error={!!error} />
                <input
                  ref={pinInputRef}
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  onKeyDown={e => { if (e.key === 'Enter') submitPin(e) }}
                  type="password"
                  inputMode="numeric"
                  placeholder="PIN"
                  aria-label="PIN"
                  className="sush-lock-input"
                  style={{ width: 180, textAlign: 'center', letterSpacing: 6 }}
                />
                <button
                  type="submit"
                  disabled={pin.length < 4 || busy}
                  style={{
                    padding: '9px 28px',
                    borderRadius: 10,
                    border: 'none',
                    background: accent,
                    color: '#0a0a0c',
                    fontWeight: 900,
                    fontSize: 13,
                    cursor: pin.length < 4 ? 'default' : 'pointer',
                    opacity: pin.length < 4 || busy ? 0.45 : 1,
                    boxShadow: `0 8px 24px ${rgba(accent, 0.35)}`
                  }}
                >
                  {busy ? 'Unlocking…' : 'Unlock'}
                </button>
                {error && !busy && <div style={{ color: '#ff8aa0', fontSize: 12, fontWeight: 700 }}>{error}</div>}
              </form>
            )}

            {!needsPin && selected && !busy && mode === 'locked' && (
              <div style={{ marginBottom: 20 }}>
                <GhostButton autoFocus onClick={() => attemptUnlock(selected, '')}>
                  <Icon name="arrowRight" size={13} /> Resume as {selected.name}
                </GhostButton>
              </div>
            )}

            {mode === 'pick' && (
              <div style={{ width: 'min(88vw, 330px)', marginBottom: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px' }}>
                  <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                  <span style={{ fontSize: 10, color: '#5a646d', fontWeight: 700, letterSpacing: 1 }}>OR</span>
                  <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                </div>
                <ProviderButtons mode="signin" accent={accent} onResult={handleProviderResult} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              {mode === 'locked' ? (
                <GhostButton danger onClick={onSwitchRequest}>
                  <Icon name="users" size={13} /> Sign out &amp; switch user
                </GhostButton>
              ) : (
                <GhostButton onClick={() => { setMode('create'); setError(''); setForm({ name: '', color: USER_COLORS[(users.length) % USER_COLORS.length], pin: '', isolation: 'cli', avatarUrl: '', providerTicket: '', providerLabel: '' }) }}>
                  <Icon name="plus" size={13} /> New user
                </GhostButton>
              )}
            </div>
          </>
        )}
      </div>

      <div style={{ position: 'absolute', bottom: 18, fontSize: 10.5, color: '#3f4852', fontWeight: 700, letterSpacing: 1 }}>
        SUSH IDENTITIES · separate logins, zero bleed
      </div>
    </div>
  )
}
