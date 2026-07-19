import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'
import { themes, presetThemeIds, buildCustomTheme } from '../themes'

// Compact in-shell theme switcher: a row of accent swatches that writes straight
// to settings.themeId (the same mechanism Settings + the palette use). Lives in
// the TitleBar so the premium preset family is always one click away.
function ThemeSwitcher({ accent, themeId, onThemeChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const custom = buildCustomTheme()
  const presets = [...presetThemeIds.map(id => themes[id]), custom].filter(Boolean)

  return (
    <div ref={ref} style={{ position: 'relative', WebkitAppRegion: 'no-drag', display: 'flex', alignItems: 'center' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Theme"
        className="flex items-center justify-center"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: open ? accent : 'var(--text-3)', padding: 4, borderRadius: 6, transition: 'color .15s' }}
        onMouseEnter={e => { e.currentTarget.style.color = accent }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.color = 'var(--text-3)' }}
      >
        <Icon name="palette" size={15} />
      </button>

      {open && (
        <div
          className="sush-swatch-pop flex items-center"
          data-glass
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 400,
            gap: 9,
            padding: '9px 11px',
            borderRadius: 'var(--r-lg)',
            background: 'rgba(15,16,17,0.94)',
            border: `1px solid ${rgba(accent, 0.22)}`,
            boxShadow: '0 14px 38px rgba(0,0,0,0.6)'
          }}
        >
          {presets.map(t => (
            <button
              key={t.id}
              onClick={() => { onThemeChange?.(t.id); setOpen(false) }}
              title={t.label}
              data-active={t.id === themeId}
              className="sush-swatch"
              style={{ background: t.ui.accent, '--swatch-glow': rgba(t.ui.accent, 0.7) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Letter avatar with the provider picture layered on top when present (the
// letter shows through if the image fails to load).
function ChipAvatar({ user, color, size, fontSize, radius }) {
  return (
    <span
      className="flex items-center justify-center"
      style={{ position: 'relative', overflow: 'hidden', width: size, height: size, borderRadius: radius, background: `linear-gradient(150deg, ${rgba(color, 0.9)}, ${rgba(color, 0.4)})`, color: '#0a0a0c', fontWeight: 900, fontSize }}
    >
      {user.avatar || user.name[0]?.toUpperCase()}
      {user.avatarUrl && (
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

// Identity chip: who is signed in, with profile / lock / switch / sign-out.
function UserChip({ user, accent, onLock, onSignOut, onManageUsers, onViewProfile }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  if (!user) return null
  const color = user.color || accent

  const items = [
    { icon: 'users', label: 'View profile', run: onViewProfile },
    { icon: 'lock', label: 'Lock Sush', hint: 'sessions keep running', run: onLock },
    { icon: 'users', label: 'Switch user…', hint: 'closes your sessions', run: onSignOut },
    { icon: 'settings', label: 'Manage users…', run: onManageUsers },
    { icon: 'logout', label: 'Sign out', hint: 'closes your sessions', run: onSignOut, danger: true }
  ]

  return (
    <div ref={ref} style={{ position: 'relative', WebkitAppRegion: 'no-drag', display: 'flex', alignItems: 'center' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={`Signed in as ${user.name}`}
        className="flex items-center"
        style={{
          gap: 7,
          background: open ? rgba(color, 0.12) : 'rgba(255,255,255,0.03)',
          border: `1px solid ${rgba(color, open ? 0.45 : 0.22)}`,
          borderRadius: 'var(--r-pill)',
          padding: '3px 10px 3px 4px',
          cursor: 'pointer',
          transition: 'background .15s, border-color .15s'
        }}
      >
        <ChipAvatar user={user} color={color} size={20} fontSize={10.5} radius="32%" />
        <span style={{ color: 'var(--text-2)', fontSize: 11, fontWeight: 800, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.name}
        </span>
      </button>

      {open && (
        <div
          data-glass
          className="sush-fade-up"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 400,
            minWidth: 218,
            background: 'rgba(15,16,17,0.94)',
            border: `1px solid ${rgba(color, 0.25)}`,
            borderRadius: 'var(--r-lg)',
            boxShadow: '0 16px 44px rgba(0,0,0,0.6)',
            padding: 6
          }}
        >
          <div
            className="flex items-center"
            onClick={() => { setOpen(false); onViewProfile?.() }}
            title="View profile"
            style={{ gap: 9, padding: '8px 10px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 5, cursor: 'pointer' }}
          >
            <ChipAvatar user={user} color={color} size={28} fontSize={13} radius="30%" />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', color: 'var(--text-1)', fontWeight: 800, fontSize: 12.5 }}>{user.name}</span>
              <span style={{ display: 'block', color: 'var(--text-3)', fontSize: 10, marginTop: 1 }}>
                {user.isolation === 'full' ? 'full home isolation' : 'CLI logins isolated'}
              </span>
            </span>
          </div>
          {items.map(item => (
            <button
              key={item.label}
              onClick={() => { setOpen(false); item.run?.() }}
              className="flex items-center"
              style={{ gap: 9, width: '100%', padding: '7px 10px', border: 'none', background: 'transparent', color: item.danger ? '#ff8aa0' : 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontWeight: 700, borderRadius: 8, textAlign: 'left' }}
              onMouseEnter={e => { e.currentTarget.style.background = rgba(item.danger ? '#ff5370' : color, 0.1) }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <Icon name={item.icon} size={13} color={item.danger ? '#ff8aa0' : 'var(--text-3)'} strokeWidth={2.1} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.hint && <span style={{ fontSize: 9, color: 'var(--text-4)', fontWeight: 600 }}>{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// macOS-style traffic-light buttons — the symbol shows on group hover. Placed
// left (macOS convention) or right (Windows) per the user's setting.
function TrafficLights({ ctrl }) {
  return (
    <div
      className="flex traffic-lights"
      style={{ gap: 7, WebkitAppRegion: 'no-drag' }}
      onMouseEnter={e => { e.currentTarget.querySelectorAll('button').forEach(b => { b.style.color = 'rgba(0,0,0,0.6)' }) }}
      onMouseLeave={e => { e.currentTarget.querySelectorAll('button').forEach(b => { b.style.color = 'transparent' }) }}
    >
      {[
        { action: 'close', symbol: '×', color: '#ff5f57' },
        { action: 'minimize', symbol: '−', color: '#ffbd2e' },
        { action: 'maximize', symbol: '⤢', color: '#28ca42' }
      ].map(({ action, symbol, color }) => (
        <button
          key={action}
          onClick={() => ctrl(action)}
          title={action}
          className="sush-press"
          style={{ width: 12, height: 12, borderRadius: '50%', background: color, border: 'none', cursor: 'pointer', fontSize: 8, lineHeight: 1, color: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color .1s', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.35), 0 1px 2px rgba(0,0,0,0.3)' }}
        >
          {symbol}
        </button>
      ))}
    </div>
  )
}

export default function TitleBar({ accent, onSettings, sessionCount = 0, themeId, onThemeChange, user, onLock, onSignOut, onManageUsers, onViewProfile, minimizeToTray = false, trafficLightSide = 'right' }) {
  // With "minimize to tray" on, the minimize dot hides the window into the
  // tray instead of the taskbar.
  const ctrl = (action) => window.sush.windowControl(
    action === 'minimize' && minimizeToTray ? 'minimize-tray' : action
  )
  // macOS puts window controls at the far left; Windows expects them right.
  const lightsLeft = trafficLightSide === 'left'

  return (
    <div
      data-glass
      className="flex items-center justify-between shrink-0"
      style={{
        position: 'relative',
        zIndex: 1000,
        background: 'rgba(10,11,13,0.6)',
        height: 40,
        padding: '0 14px',
        WebkitAppRegion: 'drag',
        borderBottom: `1px solid ${rgba(accent, 0.1)}`
      }}
    >
      {/* Brand lockup (traffic lights sit before it in macOS mode) */}
      <div className="flex items-center" style={{ gap: 10, WebkitAppRegion: 'no-drag' }}>
        {lightsLeft && <><TrafficLights ctrl={ctrl} /><span style={{ width: 4 }} /></>}
        <span
          style={{
            width: 17,
            height: 17,
            borderRadius: 'var(--r-sm)',
            background: `linear-gradient(145deg, ${accent}, ${rgba(accent, 0.35)})`,
            boxShadow: `0 0 12px ${rgba(accent, 0.45)}, inset 0 1px 0 rgba(255,255,255,0.35)`
          }}
        />
        <span style={{ color: 'var(--text-1)', fontWeight: 800, fontSize: 12.5, letterSpacing: 2.5, fontFeatureSettings: "'ss01', 'kern'" }}>SUSH</span>
        {sessionCount > 0 && (
          <span
            title={`${sessionCount} active session${sessionCount !== 1 ? 's' : ''}`}
            className="flex items-center"
            style={{ gap: 5, fontSize: 10, fontWeight: 700, color: accent, background: rgba(accent, 0.1), border: `1px solid ${rgba(accent, 0.2)}`, borderRadius: 'var(--r-pill)', padding: '2px 8px', letterSpacing: 0.3 }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: accent, boxShadow: `0 0 6px ${accent}` }} />
            {sessionCount}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center" style={{ gap: 4, WebkitAppRegion: 'no-drag' }}>
        <UserChip user={user} accent={accent} onLock={onLock} onSignOut={onSignOut} onManageUsers={onManageUsers} onViewProfile={onViewProfile} />
        {user && (
          <button
            onClick={onSignOut}
            title="Sign out (closes your sessions)"
            className="flex items-center justify-center"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6, transition: 'color .15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ff8aa0' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)' }}
          >
            <Icon name="logout" size={14} />
          </button>
        )}
        <span style={{ width: 6 }} />
        <ThemeSwitcher accent={accent} themeId={themeId} onThemeChange={onThemeChange} />

        <button
          onClick={onSettings}
          title="Settings"
          className="flex items-center justify-center"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6, transition: 'color .15s' }}
          onMouseEnter={e => { e.currentTarget.style.color = accent }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)' }}
        >
          <Icon name="settings" size={15} />
        </button>

        {/* Traffic lights on the right (Windows convention) unless moved left */}
        {!lightsLeft && (
          <>
            <span style={{ width: 1, height: 16, background: rgba(accent, 0.12), margin: '0 8px 0 6px' }} />
            <TrafficLights ctrl={ctrl} />
          </>
        )}
      </div>
    </div>
  )
}
