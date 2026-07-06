import React, { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icons'
import ProviderButtons from './ProviderButtons'
import { fileToAvatarDataUrl } from './ProfileViewer'
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

// The dots ARE the PIN display — the actual input is visually hidden behind
// them (the old screen showed dots AND a password field: two representations
// of the same four digits). `phase` drives the feel: each typed digit pops,
// busy pulses the filled dots in a wave, error fills them red and shakes the
// row (while they're still filled — the old code emptied first, so you
// watched empty circles wiggle), success flashes them accent.
function PinDots({ length, max = 8, phase, accent }) {
  const count = Math.max(4, Math.min(max, Math.max(length, 4)))
  const fillColor = phase === 'error' ? '#ff5370' : phase === 'success' ? (accent || 'var(--text-1)') : 'var(--text-1)'
  return (
    <div className="sush-pin-row" data-phase={phase} style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="sush-pin-dot"
          data-filled={i < length}
          style={{
            '--i': i,
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: i < length ? fillColor : 'rgba(255,255,255,0.14)',
            border: `1px solid ${i < length ? 'transparent' : 'rgba(255,255,255,0.22)'}`,
            boxShadow: phase === 'success' && i < length ? `0 0 10px ${rgba(accent || '#ff6b9d', 0.7)}` : 'none'
          }}
        />
      ))}
    </div>
  )
}

// One PIN form shared by the `locked` and `pick` modes (they used to carry
// two hand-copied variants). The input is offscreen-invisible; clicking the
// dots refocuses it, and everything the user sees comes from the dots row.
function PinForm({ pin, setPin, phase, error, accent, inputRef, onSubmit, onTouch, busy }) {
  // The input is invisible, so focus is everything: grab it on mount, and
  // take it back whenever it drifts to a non-interactive spot (clicking the
  // avatar tile used to strand the keyboard with no visual cue).
  useEffect(() => {
    inputRef.current?.focus()
    const reclaim = () => {
      setTimeout(() => {
        const el = document.activeElement
        if (!el || el === document.body || el.tagName === 'DIV') inputRef.current?.focus()
      }, 0)
    }
    window.addEventListener('pointerup', reclaim)
    return () => window.removeEventListener('pointerup', reclaim)
  }, [inputRef])
  return (
    <form
      onSubmit={onSubmit}
      onClick={() => inputRef.current?.focus()}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: 4, width: '100%', cursor: 'text' }}
    >
      <PinDots length={pin.length} phase={phase} accent={accent} />
      <input
        ref={inputRef}
        value={pin}
        onChange={e => {
          if (busy || phase === 'success') return
          onTouch?.()
          setPin(e.target.value.replace(/\D/g, '').slice(0, 8))
        }}
        onKeyDown={e => { if (e.key === 'Enter') onSubmit(e) }}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        aria-label="PIN"
        // Visually hidden, still focusable: the dots are the display.
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
      <button type="submit" disabled={pin.length < 4 || busy} style={unlockBtn(accent, pin.length < 4 || busy)}>
        {busy ? 'Unlocking…' : 'Unlock'}
      </button>
      {error && !busy && <div className="sush-fade-up" style={{ color: '#ff8aa0', fontSize: 12, fontWeight: 700 }}>{error}</div>}
    </form>
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
        color: danger ? '#ff8aa0' : 'var(--text-2)',
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
//
// Redesign note: every mode now lives inside one consistent glass card under a
// shared clock header — the old screen floated the picker bare but boxed the
// create form, which read as two different screens. One frame, three states.
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
  // 'idle' | 'busy' | 'error' | 'success' — drives the PIN dots + card exit.
  const [phase, setPhase] = useState('idle')
  const [form, setForm] = useState({ name: '', color: USER_COLORS[0], pin: '', isolation: 'cli', avatarUrl: '', providerTicket: '', providerLabel: '' })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const pinInputRef = useRef(null)
  const avatarFileRef = useRef(null)
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
    setPhase('busy')
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const res = await onUnlock(user, pinValue, {
      // Success beat: dots flash accent + the card eases out BEFORE the
      // screen dismisses/reloads — the old flow hard-unmounted next frame.
      beforeDismiss: () => new Promise(resolve => {
        setPhase('success')
        setTimeout(resolve, reduceMotion ? 0 : 300)
      })
    })
    if (!res?.ok) {
      // Wrong PIN: keep the dots FILLED and red while the row shakes, then
      // drain. The error text stays until the next keystroke.
      setError(res?.error || 'Sign-in failed')
      setPhase('error')
      setTimeout(() => { setPin(''); setPhase('idle') }, 430)
      setBusy(false)
      return
    }
    setBusy(false)
  }

  const choose = (user) => {
    setSelected(user)
    setPin('')
    setError('')
    setPhase('idle')
    if (!user.hasPin) { attemptUnlock(user, ''); return }
    // The click landed on the avatar button — hand focus to the (invisible)
    // PIN input so typing works immediately.
    setTimeout(() => pinInputRef.current?.focus(), 120)
  }

  const submitPin = (e) => {
    e?.preventDefault?.()
    if (pin.length >= 4) attemptUnlock(selected, pin)
  }

  // Auto-submit on the last digit: the stored PIN length is known, so typing
  // the final digit signs you in without reaching for Enter.
  useEffect(() => {
    if (!needsPin || busy || phase === 'error' || phase === 'success') return
    const want = selected?.pinLength
    if (want && pin.length === want) attemptUnlock(selected, pin)
  }, [pin]) // eslint-disable-line react-hooks/exhaustive-deps

  const resetCreateForm = () => setForm({ name: '', color: USER_COLORS[users.length % USER_COLORS.length], pin: '', isolation: 'cli', avatarUrl: '', providerTicket: '', providerLabel: '' })

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

  // Clock split into parts so the colon can carry the one sharp accent (and a
  // CSS-only pulse — no per-second timer, so it costs nothing on battery).
  const h24 = now.getHours()
  const hh = String(((h24 + 11) % 12) + 1).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ampm = h24 < 12 ? 'AM' : 'PM'
  const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
  const greet = h24 < 5 ? 'Still up' : h24 < 12 ? 'Good morning' : h24 < 18 ? 'Good afternoon' : 'Good evening'
  const blobs = useMemo(() => {
    const palette = users.length ? users.map(u => u.color || '#ff6b9d') : [form.color]
    return [
      { color: palette[0 % palette.length], top: '-14%', left: '-10%', size: 580, delay: '0s' },
      { color: palette[1 % palette.length], top: '46%', left: '80%', size: 540, delay: '-6s' },
      { color: palette[2 % palette.length], top: '78%', left: '4%', size: 420, delay: '-12s' }
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
        background: '#070a0e',
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
            background: `radial-gradient(circle at 35% 35%, ${rgba(b.color, 0.28)}, transparent 66%)`,
            filter: 'blur(80px)',
            animationDelay: b.delay,
            pointerEvents: 'none'
          }}
        />
      ))}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(1300px 760px at 50% 116%, rgba(0,0,0,0.6), transparent 60%)', pointerEvents: 'none' }} />

      {/* Window controls (frameless window still needs them) */}
      <div style={{ position: 'absolute', top: 12, right: 16, display: 'flex', gap: 8, WebkitAppRegion: 'no-drag' }}>
        {[['minimize', '−'], ['close', '×']].map(([action, sym]) => (
          <button
            key={action}
            onClick={() => window.sush.windowControl(action)}
            style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
          >
            {sym}
          </button>
        ))}
      </div>

      <div className={`sush-lock-card${phase === 'success' ? ' sush-lock-exit' : ''}`} style={{ position: 'relative', zIndex: 1, WebkitAppRegion: 'no-drag', display: 'flex', flexDirection: 'column', alignItems: 'center', width: 'min(92vw, 440px)' }}>
        {/* Clock header — shared by every mode. The clock is the hero moment:
            heavy figures, a thin AM/PM, the colon in accent with a CSS pulse. */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', color: rgba(accent, 0.85), marginBottom: 10 }}>{greet}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 0, lineHeight: 0.9 }}>
            <span style={{ fontSize: 78, fontWeight: 800, letterSpacing: -3, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums', textShadow: '0 8px 48px rgba(0,0,0,0.55)' }}>{hh}</span>
            <span className="sush-lock-colon" style={{ fontSize: 70, fontWeight: 300, color: accent, padding: '0 4px', textShadow: `0 0 28px ${rgba(accent, 0.6)}` }}>:</span>
            <span style={{ fontSize: 78, fontWeight: 800, letterSpacing: -3, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums', textShadow: '0 8px 48px rgba(0,0,0,0.55)' }}>{mm}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-3)', marginLeft: 10, letterSpacing: 0.5 }}>{ampm}</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: 'var(--text-3)' }}>{dateStr}</div>
        </div>

        {/* One glass card holds whichever mode is active */}
        <div className="sush-lock-panel" data-glass style={{ width: '100%' }}>
          {/* Brand row */}
          <div className="flex items-center justify-center" style={{ gap: 8, marginBottom: 18 }}>
            <span style={{ width: 15, height: 15, borderRadius: 5, background: `linear-gradient(145deg, ${accent}, ${rgba(accent, 0.35)})`, boxShadow: `0 0 14px ${rgba(accent, 0.5)}` }} />
            <span style={{ color: 'var(--text-2)', fontWeight: 800, fontSize: 11.5, letterSpacing: 3 }}>SUSH</span>
          </div>

          {/* keyed on mode so pick → PIN → create cross-fade instead of
              hard-swapping content inside the glass card */}
          <div key={mode} className="sush-lock-modeswap">
          {mode === 'create' ? (
            /* ── Create user ──────────────────────────────────────────────── */
            <form onSubmit={submitCreate}>
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <div
                  onClick={() => avatarFileRef.current?.click()}
                  title="Add a profile picture"
                  style={{ display: 'inline-block', cursor: 'pointer', position: 'relative' }}
                >
                  <Avatar user={{ name: form.name || '?', color: form.color, avatar: form.name.trim() ? undefined : '+', avatarUrl: form.avatarUrl }} size={72} />
                  <span className="flex items-center justify-center" style={{ position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: '50%', background: form.color, border: '2px solid var(--surface-0)', color: '#0a0a0c' }}>
                    <Icon name={form.avatarUrl ? 'edit' : 'plus'} size={12} strokeWidth={2.5} />
                  </span>
                </div>
                <input
                  ref={avatarFileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    try {
                      const dataUrl = await fileToAvatarDataUrl(file)
                      setForm(f => ({ ...f, avatarUrl: dataUrl }))
                    } catch {}
                  }}
                />
                <div style={{ marginTop: 12, fontSize: 16, fontWeight: 900, color: 'var(--text-1)' }}>
                  {firstRun ? 'Welcome to Sush' : 'New profile'}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  {firstRun ? 'A profile is your own sealed world — CLI logins, theme, and sessions stay yours.' : 'A separate world: its own CLI logins, theme, and sessions.'}
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
                <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginBottom: 12 }}>
                  <Icon name={form.providerLabel === 'GitHub' ? 'github' : 'google'} size={11} style={{ verticalAlign: -1, marginRight: 5 }} />
                  Will be linked to your {form.providerLabel} account
                </div>
              ) : (
                <div style={{ marginBottom: 14 }}>
                  <ProviderButtons mode="signin" accent={form.color} compact onResult={handleProviderResult} />
                </div>
              )}

              {/* Advanced is collapsed by default — a fresh profile just needs a
                  name. PIN ("curious eyes" lock) and isolation level live here. */}
              <button
                type="button"
                onClick={() => setShowAdvanced(s => !s)}
                className="flex items-center"
                style={{ gap: 6, width: '100%', justifyContent: 'center', background: 'none', border: 'none', color: '#6b757e', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '4px 0 12px' }}
              >
                <Icon name={showAdvanced ? 'chevronDown' : 'chevronRight'} size={12} />
                {showAdvanced ? 'Hide options' : 'PIN & isolation (optional)'}
              </button>

              {showAdvanced && (
                <div className="sush-fade-up">
                  <input
                    value={form.pin}
                    onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
                    placeholder="PIN (optional, 4–8 digits)"
                    inputMode="numeric"
                    type="password"
                    className="sush-lock-input"
                  />
                  <div style={{ fontSize: 10.5, color: 'var(--text-4)', margin: '6px 2px 12px', lineHeight: 1.5 }}>
                    A PIN keeps curious eyes out on a shared PC — it isn't encryption.
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    {[
                      { id: 'cli', label: 'CLI isolation', desc: 'Recommended — separate agent logins' },
                      { id: 'full', label: 'Full home', desc: 'Also separate git / ssh / npm' }
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
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: form.isolation === opt.id ? 'var(--text-1)' : 'var(--text-2)' }}>{opt.label}</span>
                        <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                {busy ? 'Creating…' : firstRun ? 'Start using Sush' : 'Create profile'}
              </button>

              {!firstRun && (
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <GhostButton onClick={() => { setMode('pick'); setError('') }}>
                    <Icon name="arrowRight" size={12} style={{ transform: 'rotate(180deg)' }} /> Back
                  </GhostButton>
                </div>
              )}
            </form>
          ) : mode === 'locked' ? (
            /* ── Locked (resume the one signed-in user) ────────────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Avatar user={selected} size={84} />
              <div style={{ marginTop: 14, fontSize: 19, fontWeight: 900, color: 'var(--text-1)' }}>{selected?.name}</div>
              <div className="flex items-center" style={{ gap: 6, marginTop: 4, fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>
                <Icon name="lock" size={11} /> Locked · {selected?.isolation === 'full' ? 'full isolation' : 'CLI isolation'}
              </div>

              {needsPin ? (
                <div style={{ marginTop: 18, width: '100%' }}>
                  <PinForm
                    pin={pin}
                    setPin={setPin}
                    phase={phase}
                    error={error}
                    accent={accent}
                    inputRef={pinInputRef}
                    onSubmit={submitPin}
                    onTouch={() => { if (error) setError('') }}
                    busy={busy}
                  />
                </div>
              ) : (
                <div style={{ marginTop: 22 }}>
                  <button autoFocus disabled={busy} onClick={() => attemptUnlock(selected, '')} style={unlockBtn(accent, busy)}>
                    {busy ? 'Resuming…' : `Resume as ${selected?.name}`}
                  </button>
                </div>
              )}

              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.07)', width: '100%', display: 'flex', justifyContent: 'center' }}>
                <GhostButton danger onClick={onSwitchRequest}>
                  <Icon name="users" size={13} /> Sign out &amp; switch profile
                </GhostButton>
              </div>
            </div>
          ) : (
            /* ── Pick (choose among profiles) ──────────────────────────────── */
            <div>
              <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-2)', marginBottom: 16 }}>
                {needsPin ? `Enter ${selected?.name}'s PIN` : 'Who’s using Sush?'}
              </div>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginBottom: needsPin ? 20 : 4 }}>
                {visibleUsers.map((user, i) => {
                  const isSel = selected?.id === user.id
                  return (
                    <button
                      key={user.id}
                      onClick={() => choose(user)}
                      className="sush-lock-user"
                      data-selected={isSel}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'center', width: 96, padding: 0, animationDelay: `${i * 70}ms` }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
                        <div style={{ borderRadius: '30%', padding: 3, transform: isSel ? 'scale(1.06)' : 'scale(1)', background: isSel ? `linear-gradient(150deg, ${rgba(user.color || accent, 0.95)}, ${rgba(user.color || accent, 0.15)})` : 'transparent', boxShadow: isSel ? `0 10px 30px ${rgba(user.color || accent, 0.4)}` : 'none', transition: 'background .2s ease, box-shadow .2s ease, transform .2s ease' }}>
                          <Avatar user={user} size={68} dim={!isSel} ring={false} />
                        </div>
                        {user.hasPin && (
                          <span className="flex items-center justify-center" style={{ position: 'absolute', right: 6, bottom: -2, width: 19, height: 19, borderRadius: '50%', background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.18)', color: 'var(--text-2)' }}>
                            <Icon name="lock" size={9} strokeWidth={2.4} />
                          </span>
                        )}
                        {(user.providers?.github || user.providers?.google) && (
                          <span className="flex items-center justify-center" style={{ position: 'absolute', left: 6, bottom: -2, width: 19, height: 19, borderRadius: '50%', background: 'var(--surface-1)', border: '1px solid rgba(255,255,255,0.18)', color: 'var(--text-2)' }}>
                            <Icon name={user.providers?.github ? 'github' : 'google'} size={9} strokeWidth={2.2} />
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop: 9, fontSize: 12.5, fontWeight: 800, color: isSel ? 'var(--text-1)' : 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
                    </button>
                  )
                })}
              </div>

              {needsPin && (
                <div style={{ marginBottom: 4 }}>
                  <PinForm
                    pin={pin}
                    setPin={setPin}
                    phase={phase}
                    error={error}
                    accent={accent}
                    inputRef={pinInputRef}
                    onSubmit={submitPin}
                    onTouch={() => { if (error) setError('') }}
                    busy={busy}
                  />
                </div>
              )}

              {!needsPin && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 12px' }}>
                    <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                    <span style={{ fontSize: 10, color: 'var(--text-4)', fontWeight: 700, letterSpacing: 1 }}>OR</span>
                    <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                  </div>
                  <ProviderButtons mode="signin" accent={accent} onResult={handleProviderResult} />
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                    <GhostButton onClick={() => { setMode('create'); setError(''); resetCreateForm() }}>
                      <Icon name="plus" size={13} /> New profile
                    </GhostButton>
                  </div>
                </>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 18, fontSize: 10.5, color: 'var(--text-5)', fontWeight: 700, letterSpacing: 1 }}>
        SUSH PROFILES · separate worlds, zero bleed
      </div>
    </div>
  )
}

// Shared primary-action button style (unlock / resume).
function unlockBtn(accent, disabled) {
  return {
    padding: '10px 30px',
    borderRadius: 10,
    border: 'none',
    background: accent,
    color: '#0a0a0c',
    fontWeight: 900,
    fontSize: 13,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    boxShadow: `0 8px 24px ${rgba(accent, 0.35)}`,
    transition: 'opacity .15s ease'
  }
}
