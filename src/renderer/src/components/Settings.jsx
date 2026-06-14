import React, { useEffect, useRef, useState } from 'react'
import { themes } from '../themes'
import Icon from './Icons'
import { rgba } from '../lib/ui'
import { loadCustomAgents, saveCustomAgents, addCustomAgent, removeCustomAgent, BUILTIN_AGENTS } from '../lib/agents'
import { useEntitlements } from '../hooks/useEntitlements'

const FONTS = ["'Cascadia Code'", "'Fira Code'", "Consolas", "'JetBrains Mono'", "'Courier New'"]
const CURSORS = ['block', 'bar', 'underline']
const TTS_RATES = [0.75, 1.0, 1.1, 1.25, 1.5, 1.75]

function Label({ children }) {
  return <div style={{ color: 'var(--text-3)', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 7 }}>{children}</div>
}

function Section({ title, accent, children }) {
  const nav = SETTINGS_NAV.find(n => n.sec === title)
  return (
    <div data-settings-sec={title} style={{ marginBottom: 30, scrollMarginTop: 12 }}>
      <div className="flex items-center" style={{ gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-1)' }}>
        {nav?.icon && (
          <span className="flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 8, background: `linear-gradient(145deg, ${rgba(accent, 0.22)}, ${rgba(accent, 0.05)})`, border: `1px solid ${rgba(accent, 0.28)}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)', color: accent, flexShrink: 0 }}>
            <Icon name={nav.icon} size={13} strokeWidth={2} />
          </span>
        )}
        <span style={{ color: 'var(--text-1)', fontSize: 'var(--fs-lg)', fontWeight: 800, letterSpacing: 0.2 }}>{nav?.label || title}</span>
      </div>
      {children}
    </div>
  )
}

// Nav entries -> the Section titles they scroll to. Adding a settings page =
// add a <Section title="..."> in the body + one row here.
const SETTINGS_NAV = [
  { label: 'Plan', sec: 'Plan', icon: 'star', group: 'Account', keywords: 'tier unlock code upgrade plus pro free license' },
  { label: 'Accounts', sec: 'Accounts', icon: 'users', group: 'Account', keywords: 'login limit switch claude codex slot' },
  { label: 'Usage', sec: 'Usage', icon: 'activity', group: 'Account', keywords: 'limit quota tokens cost' },
  { label: 'AI & Seducia', sec: 'AI -- Seducia', icon: 'sparkles', group: 'Intelligence', keywords: 'engine orchestrator cli' },
  { label: 'Agents', sec: 'Agents', icon: 'rocket', group: 'Intelligence', keywords: 'custom cli tools' },
  { label: 'Voice', sec: 'Voice', icon: 'mic', group: 'Intelligence', keywords: 'tts speech openai elevenlabs sound' },
  { label: 'Terminal', sec: 'Terminal', icon: 'terminal', group: 'Experience', keywords: 'font shell scrollback' },
  { label: 'Appearance', sec: 'Appearance', icon: 'palette', group: 'Experience', keywords: 'wallpaper background opacity' },
  { label: 'Theme', sec: 'Theme', icon: 'layout', group: 'Experience', keywords: 'color accent glass' },
  { label: 'Sush Profile', sec: 'Sush Profile', icon: 'fileText', group: 'System', keywords: 'sushrc config' },
  { label: 'Window', sec: 'Window', icon: 'layers', group: 'System', keywords: 'notifications startup' }
]
const NAV_GROUPS = ['Account', 'Intelligence', 'Experience', 'System']

function Row({ children }) {
  return <div style={{ marginBottom: 16 }}>{children}</div>
}

// Custom wallpaper: picked image -> downscaled JPEG data URL in settings
// (localStorage, per user). Shows behind glass surfaces and the home screen;
// the dim slider keeps text readable over busy images.
function WallpaperRow({ accent, settings, set }) {
  const fileRef = useRef(null)
  const [err, setErr] = useState('')

  const onFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr('')
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const maxW = 1600
        const scale = Math.min(1, maxW / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78)
        if (dataUrl.length > 2_500_000) setErr('That image is too large even after compression - try a smaller one.')
        else set('bgImage', dataUrl)
      } catch (e2) {
        setErr(e2.message)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url); setErr('Could not read that image') }
    img.src = url
  }

  return (
    <Row>
      <Label>Background wallpaper</Label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => fileRef.current?.click()}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: `1px solid ${rgba(accent, 0.3)}`, color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
        >
          <Icon name="palette" size={14} color={accent} strokeWidth={2} />
          {settings.bgImage ? 'Change image' : 'Choose image'}
        </button>
        {settings.bgImage && (
          <>
            <img src={settings.bgImage} alt="" style={{ width: 56, height: 32, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-2)' }} />
            <button onClick={() => set('bgImage', '')} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
              remove
            </button>
          </>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      {settings.bgImage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>Dim</span>
          <input type="range" min={20} max={92} value={settings.bgDim ?? 62} onChange={e => set('bgDim', Number(e.target.value))} style={{ flex: 1, accentColor: accent }} />
          <span style={{ color: 'var(--text-2)', fontSize: 12, width: 36, textAlign: 'right', fontWeight: 700 }}>{settings.bgDim ?? 62}%</span>
        </div>
      )}
      {settings.bgImage && (
        <button
          onClick={() => set('terminalWallpaper', settings.terminalWallpaper !== true)}
          style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, marginTop: 10, background: settings.terminalWallpaper === true ? rgba(accent, 0.1) : 'var(--surface-2)', border: `1px solid ${settings.terminalWallpaper === true ? rgba(accent, 0.4) : 'var(--border-2)'}`, color: settings.terminalWallpaper === true ? accent : 'var(--text-3)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, width: '100%' }}
        >
          <Icon name="terminal" size={14} strokeWidth={2} />
          {settings.terminalWallpaper === true ? 'Wallpaper shows through terminals' : 'Terminals stay solid (wallpaper hidden)'}
        </button>
      )}
      {err && <div style={{ color: '#ff8aa0', fontSize: 11, fontWeight: 700, marginTop: 6 }}>{err}</div>}
      <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 6, lineHeight: 1.5 }}>
        Shows through the glass chrome and the home screen (glass themes show the most). Stored per user.
        Turn on “shows through terminals” to let it sit behind your terminal text too — the Dim slider keeps text readable.
      </div>
    </Row>
  )
}

// A thin usage bar (session / week %). Goes amber past 70%, red past 90% so a
// near-limit account reads at a glance.
function MiniBar({ label, pct, accent }) {
  const p = Math.max(0, Math.min(100, pct ?? 0))
  const col = p >= 90 ? '#ff7a8a' : p >= 70 ? '#ffb74d' : accent
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', width: 48, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', borderRadius: 3, background: col, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: 9.5, fontWeight: 800, color: p >= 90 ? '#ff7a8a' : 'var(--text-2)', width: 30, textAlign: 'right' }}>{p}%</span>
    </div>
  )
}

// Per-account usage readout under a slot row. Shows the session/week bars when
// the probe returned utilization numbers; otherwise falls back to status + the
// reset window (still useful, and honest about what we could read).
function SlotUsage({ usage, accent }) {
  if (!usage) return null
  const hasBars = usage.sessionPct != null || usage.weekPct != null
  const resetTxt = usage.resetsAt ? new Date(usage.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
  return (
    <div style={{ padding: '1px 13px 9px 24px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {hasBars ? (
        <>
          {usage.sessionPct != null && <MiniBar label="Session" pct={usage.sessionPct} accent={accent} />}
          {usage.weekPct != null && <MiniBar label="Week" pct={usage.weekPct} accent={accent} />}
        </>
      ) : usage.kind === 'health' ? (
        <div style={{ fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: usage.signedIn ? '#5fd3a8' : '#ff7a8a', flexShrink: 0 }} />
          <span style={{ color: usage.signedIn ? 'var(--text-2)' : '#ff9aa8' }}>{usage.status}</span>
          {usage.note && <span style={{ color: 'var(--text-4)', fontWeight: 600 }}>· {usage.note}</span>}
        </div>
      ) : (
        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700 }}>
          {usage.status === 'allowed' ? 'Within limits' : `Status: ${(usage.status || 'unknown').replace(/_/g, ' ')}`}
          {resetTxt ? ` · resets ${resetTxt}` : ''}
        </div>
      )}
      <div style={{ fontSize: 9, color: 'var(--text-5)', fontWeight: 600 }}>updated {ago(usage.at) || 'just now'}</div>
    </div>
  )
}

// The account switcher. One row per signed-in account, per CLI: "Account 1"
// is the identity's own login, extra accounts get their own isolated config
// dir. Adding one opens a session running that CLI so its normal browser
// sign-in (Google and friends) takes over — Sush never sees the credentials,
// it only points the CLI at the right slot. The OAuth plumbing that used to
// live here (GitHub/Google client status) is an app concern, not a user one,
// so it no longer has UI.
function AccountsSection({ accent }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [usageBusy, setUsageBusy] = useState({})   // `${provider}:${slotId}` -> bool

  useEffect(() => {
    window.sush.accountsList?.().then(r => { if (r?.ok) setData(r.providers) }).catch(() => {})
  }, [])

  // On-demand usage read for one Claude account. Spawns a tiny probe under that
  // slot's login — never auto-polled, so it's safe on a weak CPU.
  const readUsage = async (provider, slotId) => {
    const key = `${provider}:${slotId}`
    setUsageBusy(b => ({ ...b, [key]: true }))
    setErr('')
    const r = await window.sush.accountsUsageRead?.({ provider, slotId })
    if (r?.ok) setData(r.providers)
    else if (r?.error) setErr(r.error)
    setUsageBusy(b => ({ ...b, [key]: false }))
  }

  const setPolicy = (provider, policy) => call(() => window.sush.accountsSetPolicy({ provider, policy }))

  const call = async (fn) => {
    setBusy(true)
    setErr('')
    const r = await fn()
    if (r?.ok) setData(r.providers)
    // Every failure is shown — a swallowed 'no-user' here let "+ Add account"
    // fail invisibly and the user think the slot feature was a no-op.
    else setErr(r?.error === 'no-user' ? 'No Sush profile is signed in - sign in first.' : (r?.error || 'Something went wrong'))
    setBusy(false)
  }

  const providers = [
    ['claude', 'Claude', 'Claude Pro / Max subscription'],
    ['codex', 'Codex', 'ChatGPT subscription']
  ]
  const slotName = (slot, i) => slot.id === 'default' && slot.label === 'Default' ? 'Account 1' : (slot.label || `Account ${i + 1}`)
  const limitAgo = (slot) => {
    if (!slot.lastLimitAt) return null
    const h = (Date.now() - slot.lastLimitAt) / 3600000
    if (h > 12) return null
    return h < 1 ? 'limit hit <1h ago' : `limit hit ${Math.round(h)}h ago`
  }
  const [editing, setEditing] = useState(null)  // { provider, slotId, value }
  const commitRename = () => {
    const e = editing
    setEditing(null)
    if (!e || !e.value.trim()) return
    call(() => window.sush.accountsRename?.({ provider: e.provider, slotId: e.slotId, label: e.value.trim() }))
  }

  return (
    <Section title="Accounts" accent={accent}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 14 }}>
        Each account is a separate CLI login. Add a second one and Sush can hop
        over when the first hits its session limit. Sign-in happens in the
        CLI's own browser flow (Google sign-in supported) — Sush never sees
        your credentials.
      </div>
      {!data && (
        <div className="flex items-center" style={{ gap: 8, color: 'var(--text-4)', fontSize: 11.5, fontWeight: 700, padding: '6px 0 14px' }}>
          <span className="sush-spinner" style={{ width: 13, height: 13 }} />
          Loading accounts…
        </div>
      )}
      {data && providers.map(([p, label, sub]) => {
        const st = data[p] || { active: 'default', slots: [] }
        return (
          <div key={p} style={{ marginBottom: 14, borderRadius: 'var(--r-lg)', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
            <div className="flex items-center" style={{ gap: 9, padding: '10px 13px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-2)' }}>{label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 1 }}>{sub}</div>
              </div>
              <button
                onClick={() => call(async () => {
                  const r = await window.sush.accountsAdd({ provider: p })
                  // Hand the user straight to the sign-in: the new slot is
                  // already active, so a fresh session of this CLI prompts
                  // its own login flow (browser OAuth) — no manual steps.
                  if (r?.ok) window.dispatchEvent(new CustomEvent('sush:open-login-session', { detail: { provider: p } }))
                  return r
                })}
                disabled={busy}
                className="sush-mini-btn"
                style={{ fontSize: 10.5, fontWeight: 800, color: accent, background: rgba(accent, 0.08), border: `1px solid ${rgba(accent, 0.28)}`, borderRadius: 999, padding: '4px 12px', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
              >
                + Add account
              </button>
            </div>
            {st.slots.map((slot, i) => {
              const on = st.active === slot.id
              const isEditing = editing && editing.provider === p && editing.slotId === slot.id
              const uKey = `${p}:${slot.id}`
              return (
                <div key={slot.id} className="sush-row-hover">
                  <div className="flex items-center" style={{ gap: 10, padding: '8px 13px' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: on ? '#5fd3a8' : 'rgba(255,255,255,0.16)', boxShadow: on ? '0 0 7px rgba(95,211,168,0.6)' : 'none' }} />
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editing.value}
                        onChange={e2 => setEditing({ ...editing, value: e2.target.value })}
                        onBlur={commitRename}
                        onKeyDown={e2 => { if (e2.key === 'Enter') commitRename(); if (e2.key === 'Escape') setEditing(null) }}
                        style={{ flex: 1, background: 'var(--surface-2)', border: `1px solid ${rgba(accent, 0.4)}`, borderRadius: 6, color: 'var(--text-2)', fontSize: 12, fontWeight: 700, padding: '2px 7px', outline: 'none' }}
                      />
                    ) : (
                      <span
                        title="Double-click to rename"
                        onDoubleClick={() => setEditing({ provider: p, slotId: slot.id, value: slotName(slot, i) })}
                        style={{ flex: 1, fontSize: 12, fontWeight: 700, color: on ? 'var(--text-2)' : 'var(--text-3)', cursor: 'text' }}
                      >
                        {slotName(slot, i)}
                        {limitAgo(slot) && <span style={{ marginLeft: 8, fontSize: 9.5, fontWeight: 800, color: '#ffb74d' }}>{limitAgo(slot)}</span>}
                      </span>
                    )}
                    {on ? (
                      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, color: '#5fd3a8' }}>ACTIVE</span>
                    ) : (
                      <button
                        onClick={() => call(() => window.sush.accountsSwitch({ provider: p, slotId: slot.id }))}
                        disabled={busy}
                        style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-2)', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 999, padding: '3px 11px', cursor: 'pointer' }}
                      >
                        Switch
                      </button>
                    )}
                    {(p === 'claude' || p === 'codex') && !isEditing && (
                      <button
                        onClick={() => readUsage(p, slot.id)}
                        disabled={usageBusy[uKey]}
                        title={p === 'claude' ? 'Refresh usage' : 'Check sign-in'}
                        className="flex items-center justify-center"
                        style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.color = accent }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)' }}
                      >
                        {usageBusy[uKey] ? <span className="sush-spinner" style={{ width: 11, height: 11 }} /> : <Icon name="refresh" size={12} strokeWidth={2.2} />}
                      </button>
                    )}
                    {!isEditing && (
                      <button
                        onClick={() => setEditing({ provider: p, slotId: slot.id, value: slotName(slot, i) })}
                        disabled={busy}
                        title="Rename this account"
                        className="flex items-center justify-center"
                        style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.color = accent }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)' }}
                      >
                        <Icon name="edit" size={12} strokeWidth={2.2} />
                      </button>
                    )}
                    {slot.id !== 'default' && (
                      <button onClick={() => call(() => window.sush.accountsRemove({ provider: p, slotId: slot.id }))} disabled={busy} title="Remove this account" style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', padding: '0 2px', fontSize: 13, lineHeight: 1 }}>
                        ×
                      </button>
                    )}
                  </div>
                  {(p === 'claude' || p === 'codex') && slot.usage && <SlotUsage usage={slot.usage} accent={accent} />}
                </div>
              )
            })}
            {st.slots.length >= 2 && (
              <div style={{ padding: '4px 13px 11px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: 'var(--text-3)', textTransform: 'uppercase', margin: '8px 0 6px' }}>When this CLI hits its limit</div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[['never', 'Never'], ['ask', 'Ask me'], ['auto', 'Auto switch']].map(([val, lbl]) => {
                    const on2 = (st.limitPolicy || 'ask') === val
                    return (
                      <button
                        key={val}
                        onClick={() => setPolicy(p, val)}
                        disabled={busy}
                        style={{ flex: 1, padding: '6px 0', borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: on2 ? accent : 'var(--surface-2)', color: on2 ? '#0a0a0a' : 'var(--text-3)', border: `1px solid ${on2 ? accent : 'var(--border-2)'}` }}
                      >
                        {lbl}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* CLIs that keep their login outside a relocatable, CLI-specific config
          dir (Gemini → ~/.gemini, OpenCode → ~/.local/share/opencode) can't be
          cleanly multi-accounted without leaking env into every session, so
          they're one login per profile. You can still connect them here. */}
      <div style={{ marginBottom: 14, borderRadius: 'var(--r-lg)', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
        <div style={{ padding: '9px 13px 4px', fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, color: 'var(--text-3)', textTransform: 'uppercase' }}>One login per profile</div>
        {[['gemini', 'Gemini', 'Google account'], ['opencode', 'OpenCode', 'any provider']].map(([p, label, sub]) => (
          <div key={p} className="flex items-center sush-row-hover" style={{ gap: 10, padding: '8px 13px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>{label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 1 }}>{sub} — separate per profile</div>
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('sush:open-login-session', { detail: { provider: p } }))}
              style={{ fontSize: 10.5, fontWeight: 800, color: accent, background: rgba(accent, 0.08), border: `1px solid ${rgba(accent, 0.28)}`, borderRadius: 999, padding: '4px 12px', cursor: 'pointer' }}
            >
              Sign in
            </button>
          </div>
        ))}
      </div>

      {err && <div style={{ color: '#ff8aa0', fontSize: 11, fontWeight: 700, marginTop: 4 }}>{err}</div>}
    </Section>
  )
}

// Live usage/limit dashboard across every agent CLI. Polls a cheap, spawn-free
// snapshot (install state, active account, when each account last hit a limit,
// and Claude's last captured rate-limit window) on a user-chosen interval, plus
// a live Claude probe on demand. The auto-poll never spawns a CLI — only the
// "Check Claude live" button does, so it's safe to leave running on a weak CPU.
function ago(ts) {
  if (!ts) return null
  const m = (Date.now() - ts) / 60000
  if (m < 1) return 'just now'
  if (m < 60) return `${Math.round(m)}m ago`
  const h = m / 60
  if (h < 24) return `${Math.round(h)}h ago`
  return `${Math.round(h / 24)}d ago`
}

const USAGE_INTERVALS = [[0, 'Off'], [30, '30s'], [60, '1 min'], [300, '5 min']]

function UsageSection({ accent, settings, set }) {
  const [snap, setSnap] = useState(null)
  const [live, setLive] = useState(null)        // live Claude probe result
  const [checking, setChecking] = useState(false)
  const [lastAt, setLastAt] = useState(null)
  const interval = settings.usageRefresh ?? 60   // seconds; 0 = off

  const pull = React.useCallback(async () => {
    try {
      const r = await window.sush.usageSnapshot?.()
      if (r?.ok) { setSnap(r); setLastAt(Date.now()) }
    } catch {}
  }, [])

  useEffect(() => { pull() }, [pull])

  // Auto-refresh on the chosen interval (cheap snapshot only).
  useEffect(() => {
    if (!interval) return
    const id = setInterval(pull, interval * 1000)
    return () => clearInterval(id)
  }, [interval, pull])

  const checkLive = async () => {
    setChecking(true)
    try {
      const r = await window.sush.claudeLimitsCheck?.()
      if (r?.limits) setLive(r.limits)
    } catch {}
    setChecking(false)
    pull()
  }

  const claudeLimit = live || snap?.claude?.limits || null
  const clock = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null

  const Card = ({ name, label, sub, data, children }) => {
    const installed = data?.installed
    return (
      <div style={{ marginBottom: 12, borderRadius: 'var(--r-lg)', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
        <div className="flex items-center" style={{ gap: 9, padding: '10px 13px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: installed ? '#5fd3a8' : 'rgba(255,255,255,0.18)', boxShadow: installed ? '0 0 7px rgba(95,211,168,0.6)' : 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-2)' }}>{label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 1 }}>{sub}</div>
          </div>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: installed ? '#5fd3a8' : 'var(--text-3)' }}>
            {installed ? 'INSTALLED' : 'NOT FOUND'}
          </span>
        </div>
        <div style={{ padding: '9px 13px', fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
          {!installed
            ? <span style={{ color: 'var(--text-3)' }}>This CLI isn’t on your PATH, so there’s nothing to report.</span>
            : children}
        </div>
      </div>
    )
  }

  const AccountLine = ({ account }) => {
    if (!account) return <div style={{ color: 'var(--text-3)' }}>Signed-in account: <span style={{ color: 'var(--text-2)' }}>default</span></div>
    const limited = ago(account.lastLimitAt)
    return (
      <>
        <div>Active account: <span style={{ color: 'var(--text-2)', fontWeight: 700 }}>{account.label}</span>{account.count > 1 ? <span style={{ color: 'var(--text-4)' }}> · {account.count} on file</span> : null}</div>
        <div>Last limit hit: {limited ? <span style={{ color: '#ffb74d', fontWeight: 700 }}>{limited}</span> : <span style={{ color: '#5fd3a8' }}>none recorded</span>}</div>
      </>
    )
  }

  return (
    <Section title="Usage" accent={accent}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 14 }}>
        Live account &amp; limit status for every agent CLI. The auto-refresh below reads a
        cheap snapshot (no CLI is launched) — install state, your active account, and when
        each account last got rate-limited. Use <strong style={{ color: accent }}>Check Claude live</strong> to
        actually probe Claude’s current window and reset time.
      </div>

      {/* Controls */}
      <div className="flex items-center" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>Auto-refresh</span>
        {USAGE_INTERVALS.map(([val, lbl]) => {
          const on = interval === val
          return (
            <button
              key={val}
              onClick={() => set('usageRefresh', val)}
              style={{ padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: on ? accent : 'var(--surface-2)', color: on ? '#0a0a0a' : 'var(--text-3)', border: `1px solid ${on ? accent : 'var(--border-2)'}` }}
            >
              {lbl}
            </button>
          )
        })}
        <span style={{ flex: 1 }} />
        <button
          onClick={checkLive}
          disabled={checking}
          className="flex items-center"
          style={{ gap: 6, fontSize: 10.5, fontWeight: 800, color: accent, background: rgba(accent, 0.1), border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 999, padding: '5px 13px', cursor: 'pointer', opacity: checking ? 0.6 : 1 }}
        >
          {checking && <span className="sush-spinner" style={{ width: 10, height: 10 }} />}
          {checking ? 'Probing…' : 'Check Claude live'}
        </button>
      </div>

      <Card name="claude" label="Claude Code" sub="Claude Pro / Max" data={snap?.claude}>
        <AccountLine account={snap?.claude?.account} />
        <div>
          Limit window:{' '}
          {!claudeLimit
            ? <span style={{ color: 'var(--text-3)' }}>unknown — run a Claude panel session or click “Check Claude live”.</span>
            : claudeLimit.status === 'allowed'
              ? <span style={{ color: '#5fd3a8', fontWeight: 700 }}>OK</span>
              : <span style={{ color: '#ffb74d', fontWeight: 700 }}>{String(claudeLimit.status).replace(/_/g, ' ')}</span>}
          {claudeLimit?.resetsAt && <span style={{ color: 'var(--text-3)' }}> · resets {clock(claudeLimit.resetsAt)}</span>}
        </div>
      </Card>

      <Card name="codex" label="Codex" sub="ChatGPT subscription" data={snap?.codex}>
        <AccountLine account={snap?.codex?.account} />
        <div style={{ color: 'var(--text-4)' }}>Codex has no live usage probe — Sush tracks limits as its sessions hit them.</div>
      </Card>

      <Card name="gemini" label="Gemini" sub="Google account" data={snap?.gemini}>
        <div style={{ color: 'var(--text-4)' }}>One login per profile. No live usage probe; limits surface in-session.</div>
      </Card>

      <div style={{ fontSize: 10, color: 'var(--text-5)', marginTop: 4 }}>
        {lastAt ? `Snapshot updated ${clock(lastAt)}${interval ? ` · auto every ${interval < 60 ? interval + 's' : interval / 60 + ' min'}` : ' · auto-refresh off'}` : 'Loading…'}
      </div>
    </Section>
  )
}


// Custom agents: any CLI the user wants as a first-class launcher tile —
// the old way was hardcoding machine-specific paths into lib/agents.js.
// Stored per user (localStorage); the launcher, Seducia and the availability
// probe pick them up through allAgents().
const TIER_META = {
  free: { label: 'Free', color: 'var(--text-3)', blurb: 'The essentials, no code needed.' },
  plus: { label: 'Plus', color: '#5ab0ff', blurb: 'Multi-account work + cloud voice.' },
  pro:  { label: 'Pro',  color: '#c08bff', blurb: 'Everything, max grid.' }
}
const PLAN_ROWS = [
  ['Accounts per CLI', t => String(t.slots)],
  ['Grid sessions',    t => String(t.gridCap)],
  ['Custom agents',    t => (t.customAgents ? 'yes' : '—')],
  ['Cloud voices',     t => (t.cloudTts ? 'yes' : '—')]
]
const PLAN_ORDER = ['free', 'plus', 'pro']

// Tier / unlock-code panel. No paywall: the user pastes a code I mint offline
// and it flips the tier. The actual feature gating lives where each feature does
// (slots in main, grid in App, cloud voice here) — this is just where you see
// what you've got and redeem a code.
function PlanSection({ accent, ent }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { ok, text }
  const tier = ent.tier || 'free'
  const tiers = ent.tiers && Object.keys(ent.tiers).length ? ent.tiers : null
  const meta = TIER_META[tier] || TIER_META.free

  const redeem = async () => {
    const c = code.trim()
    if (!c || busy) return
    setBusy(true); setMsg(null)
    const r = await ent.redeem(c)
    setBusy(false)
    if (r?.ok) { setMsg({ ok: true, text: `Unlocked ${TIER_META[r.tier]?.label || r.tier}. Enjoy.` }); setCode('') }
    else setMsg({ ok: false, text: r?.error || 'Could not redeem that code.' })
  }
  const revert = async () => { await ent.clear(); setMsg({ ok: true, text: 'Reverted to Free.' }); setCode('') }

  const inputStyle = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)', borderRadius: 8, padding: '8px 11px', fontSize: 12.5, outline: 'none', letterSpacing: 0.5, fontFamily: 'var(--font-mono, monospace)' }

  return (
    <Section title="Plan" accent={accent}>
      {/* Current tier */}
      <div className="flex items-center" style={{ gap: 12, padding: '13px 15px', borderRadius: 'var(--r-lg)', border: `1px solid ${rgba(meta.color, 0.35)}`, background: rgba(meta.color, 0.08), marginBottom: 16 }}>
        <span className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 9, background: rgba(meta.color, 0.16), border: `1px solid ${rgba(meta.color, 0.4)}`, color: meta.color, flexShrink: 0 }}>
          <Icon name="star" size={16} strokeWidth={2} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 900, color: 'var(--text-1)' }}>
            {meta.label} plan {ent.expiry && <span style={{ color: 'var(--text-3)', fontWeight: 700, fontSize: 11 }}>· trial</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{meta.blurb}</div>
        </div>
        {tier !== 'free' && (
          <button onClick={revert} title="Remove code, back to Free" style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--text-3)', background: 'var(--surface-1)', border: '1px solid var(--border-2)', borderRadius: 999, padding: '5px 12px', cursor: 'pointer' }}>
            Revert to Free
          </button>
        )}
      </div>

      {/* What each tier unlocks */}
      {tiers && (
        <div style={{ borderRadius: 'var(--r-lg)', border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden', marginBottom: 16 }}>
          <div className="flex" style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ flex: '1.4 1 0', padding: '9px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Feature</div>
            {PLAN_ORDER.map(t => (
              <div key={t} style={{ flex: 1, padding: '9px 8px', textAlign: 'center', fontSize: 11, fontWeight: 900, color: t === tier ? (TIER_META[t]?.color) : 'var(--text-3)' }}>
                {TIER_META[t]?.label}{t === tier ? ' ●' : ''}
              </div>
            ))}
          </div>
          {PLAN_ROWS.map(([name, fn], i) => (
            <div key={name} className="flex" style={{ borderBottom: i < PLAN_ROWS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <div style={{ flex: '1.4 1 0', padding: '8px 12px', fontSize: 11.5, color: 'var(--text-2)' }}>{name}</div>
              {PLAN_ORDER.map(t => (
                <div key={t} style={{ flex: 1, padding: '8px', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: t === tier ? 'var(--text-2)' : 'var(--text-3)' }}>
                  {tiers[t] ? fn(tiers[t]) : '—'}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Redeem */}
      <Label>Have an unlock code?</Label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') redeem() }}
          placeholder="SUSH-PLUS-XXXXXXXX-XXXXXXXXXX"
          spellCheck={false}
          style={inputStyle}
        />
        <button
          onClick={redeem}
          disabled={!code.trim() || busy}
          style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color: code.trim() && !busy ? '#0a0a0a' : 'var(--text-4)', background: code.trim() && !busy ? accent : 'rgba(255,255,255,0.05)', border: `1px solid ${rgba(accent, 0.4)}`, borderRadius: 999, padding: '0 18px', cursor: code.trim() && !busy ? 'pointer' : 'default' }}
        >
          {busy ? '…' : 'Redeem'}
        </button>
      </div>
      {msg && (
        <div style={{ marginTop: 9, fontSize: 11.5, fontWeight: 700, color: msg.ok ? '#7fd6a0' : '#ff8aa0' }}>{msg.text}</div>
      )}
      <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 10, lineHeight: 1.55 }}>
        No payment, no account — a code just unlocks a tier offline. Don't have one? Ask the dev.
      </div>
    </Section>
  )
}

function AgentsSection({ accent, ent }) {
  const [custom, setCustom] = useState(() => loadCustomAgents())
  const [form, setForm] = useState({ label: '', command: '', resumeCommand: '' })
  const [err, setErr] = useState('')

  const inputStyle = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)', borderRadius: 8, padding: '7px 10px', fontSize: 12, outline: 'none' }
  const locked = !ent.can('customAgents')

  const add = () => {
    if (locked) return
    const r = addCustomAgent(form)
    if (!r.ok) { setErr(r.error); return }
    setErr('')
    setForm({ label: '', command: '', resumeCommand: '' })
    setCustom(loadCustomAgents())
  }

  return (
    <Section title="Agents" accent={accent}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 12 }}>
        {BUILTIN_AGENTS.length - 1} agent CLIs ship built in (Claude Code, Codex, Gemini, …).
        Add your own below — it appears in the launcher, Seducia can spawn it, and a
        resume command (if the CLI has one) lets restored sessions pick up where they left off.
      </div>
      {custom.map(a => (
        <div key={a.id} className="flex items-center sush-row-hover" style={{ gap: 10, padding: '7px 11px', borderRadius: 'var(--r-md)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 6 }}>
          <span className="flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: 7, background: rgba(a.color, 0.14), border: `1px solid ${rgba(a.color, 0.4)}`, color: a.color, fontSize: 10, fontWeight: 900, flexShrink: 0 }}>{a.mono}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-2)' }}>{a.label}</div>
            <div className="sush-mono" style={{ fontSize: 10, color: 'var(--text-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.command}{a.resumeCommand ? `  ·  resume: ${a.resumeCommand}` : ''}</div>
          </div>
          <button onClick={() => { removeCustomAgent(a.id); setCustom(loadCustomAgents()) }} title="Remove agent" style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 2px' }}>×</button>
        </div>
      ))}
      {locked ? (
        <div className="flex items-center" style={{ gap: 11, borderRadius: 'var(--r-lg)', border: `1px solid ${rgba(accent, 0.25)}`, background: rgba(accent, 0.05), padding: '12px 14px', marginTop: custom.length ? 8 : 0 }}>
          <span className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 8, background: rgba(accent, 0.12), color: accent, flexShrink: 0 }}>
            <Icon name="lock" size={14} strokeWidth={2} />
          </span>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Custom agents are a <strong style={{ color: accent }}>Plus</strong> feature.
            Redeem a code under <strong style={{ color: accent }}>Plan</strong> to add your own CLIs.
          </div>
        </div>
      ) : (
        <div style={{ borderRadius: 'var(--r-lg)', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', padding: 12, marginTop: custom.length ? 8 : 0 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input placeholder="Name (e.g. Aider)" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} style={{ ...inputStyle, flex: '0 0 160px' }} />
            <input className="sush-mono" placeholder="Command (e.g. aider)" value={form.command} onChange={e => setForm({ ...form, command: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="sush-mono" placeholder="Resume command (optional, e.g. aider --restore)" value={form.resumeCommand} onChange={e => setForm({ ...form, resumeCommand: e.target.value })} style={inputStyle} />
            <button
              onClick={add}
              disabled={!form.label.trim() || !form.command.trim()}
              style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: form.label.trim() && form.command.trim() ? accent : 'var(--text-4)', background: rgba(accent, form.label.trim() && form.command.trim() ? 0.1 : 0.03), border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 999, padding: '6px 14px', cursor: 'pointer' }}
            >
              + Add agent
            </button>
          </div>
          {err && <div style={{ color: '#ff8aa0', fontSize: 11, fontWeight: 700, marginTop: 8 }}>{err}</div>}
        </div>
      )}
    </Section>
  )
}

// Play a base64 audio clip once (used by the Voice "Test" button).
function playB64(base64, mime) {
  try {
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'audio/mpeg' }))
    const a = new Audio(url)
    a.onended = () => URL.revokeObjectURL(url)
    a.play().catch(() => URL.revokeObjectURL(url))
  } catch {}
}

const TTS_ENGINES = [['system', 'System'], ['openai', 'OpenAI'], ['elevenlabs', 'ElevenLabs']]
const OPENAI_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse']

// Voice settings: the system (Web Speech) voice OR a cloud neural voice driven
// by the user's own OpenAI/ElevenLabs key. The key is held in main and never
// round-trips here — this panel only sends it once on save and shows whether
// one is set. "Test" plays a sample through whichever engine is selected.
function VoiceSection({ accent, settings, set, voices, ent }) {
  const cloudLocked = !ent.can('cloudTts')
  const [tts, setTts] = useState(null)      // public cloud config from main
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    window.sush?.ttsConfigGet?.().then(c => { if (c) setTts(c) }).catch(() => {})
  }, [])

  const provider = tts?.provider || 'system'
  const inputStyle = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)', borderRadius: 8, padding: '7px 10px', fontSize: 12, outline: 'none' }

  const saveCfg = async (patch) => {
    setBusy(true); setErr('')
    const r = await window.sush?.ttsConfigSet?.(patch)
    if (r?.ok) setTts(r)
    else if (r?.error) setErr(r.error)
    setBusy(false)
    return r
  }

  const saveKey = async () => {
    if (!keyInput.trim()) return
    const r = await saveCfg({ apiKey: keyInput.trim() })
    if (r?.ok) setKeyInput('')
  }

  const testVoice = async () => {
    setTesting(true); setErr('')
    const sample = "Hey, I'm Seducia — this is how I sound now."
    try {
      if (provider !== 'system') {
        const r = await window.sush?.ttsSynthesize?.({ text: sample, rate: settings.ttsRate })
        if (r?.ok && r.audio) { playB64(r.audio, r.mime); setTesting(false); return }
        if (r?.error) setErr(r.error)
      }
      const u = new SpeechSynthesisUtterance(sample)
      u.rate = settings.ttsRate ?? 1.1
      if (settings.ttsVoice) { const v = window.speechSynthesis.getVoices().find(v => v.voiceURI === settings.ttsVoice); if (v) u.voice = v }
      u.onend = () => setTesting(false)
      u.onerror = () => setTesting(false)
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
    } catch { setTesting(false) }
  }

  const isCloud = provider === 'openai' || provider === 'elevenlabs'
  const voiceHint = tts?.defaults?.[provider]?.voice
  const modelHint = tts?.defaults?.[provider]?.model

  return (
    <Section title="Voice" accent={accent}>
      <Row>
        <Label>Text-to-speech (Seducia speaks back)</Label>
        <button
          onClick={() => set('ttsEnabled', !settings.ttsEnabled)}
          style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: settings.ttsEnabled ? rgba(accent, 0.1) : 'var(--surface-2)', border: `1px solid ${settings.ttsEnabled ? rgba(accent, 0.4) : 'var(--border-2)'}`, color: settings.ttsEnabled ? accent : 'var(--text-3)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
        >
          <Icon name="volume2" size={14} strokeWidth={2} />
          {settings.ttsEnabled ? 'TTS enabled' : 'TTS disabled'}
        </button>
        <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 5, lineHeight: 1.5 }}>
          Off by default — Seducia replies in text either way.
        </div>
      </Row>

      {settings.ttsEnabled && (
        <>
          <Row>
            <Label>Voice engine</Label>
            <div style={{ display: 'flex', gap: 6 }}>
              {TTS_ENGINES.map(([val, lbl]) => {
                const on = provider === val
                const isCloudOpt = val !== 'system'
                const optLocked = isCloudOpt && cloudLocked
                return (
                  <button
                    key={val}
                    onClick={() => { if (!optLocked) saveCfg({ provider: val }) }}
                    disabled={busy || optLocked}
                    title={optLocked ? 'Cloud voices are a Plus feature — redeem a code under Plan' : ''}
                    className="flex items-center justify-center"
                    style={{ gap: 5, flex: 1, padding: '7px 0', borderRadius: 'var(--r-sm)', fontSize: 11.5, fontWeight: 700, cursor: optLocked ? 'default' : 'pointer', opacity: optLocked ? 0.6 : 1, background: on ? accent : 'var(--surface-2)', color: on ? '#0a0a0a' : 'var(--text-3)', border: `1px solid ${on ? accent : 'var(--border-2)'}` }}
                  >
                    {optLocked && <Icon name="lock" size={11} strokeWidth={2.2} />}
                    {lbl}
                  </button>
                )
              })}
            </div>
            {cloudLocked && (
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 6, lineHeight: 1.5 }}>
                The system voice is free. Cloud neural voices (OpenAI / ElevenLabs) unlock with <strong style={{ color: accent }}>Plus</strong> — see <strong style={{ color: accent }}>Plan</strong>.
              </div>
            )}
            <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 5, lineHeight: 1.5 }}>
              {provider === 'system'
                ? 'Your built-in OS voices (robotic, but free and offline).'
                : 'A real neural voice via your own API key — the key stays on this machine and never leaves the main process.'}
            </div>
          </Row>

          <Row>
            <Label>Speech rate</Label>
            <div style={{ display: 'flex', gap: 6 }}>
              {TTS_RATES.map(r => (
                <button key={r} onClick={() => set('ttsRate', r)} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: (settings.ttsRate ?? 1.1) === r ? accent : 'var(--surface-2)', color: (settings.ttsRate ?? 1.1) === r ? '#0a0a0a' : 'var(--text-3)', border: `1px solid ${(settings.ttsRate ?? 1.1) === r ? accent : 'var(--border-2)'}` }}>
                  {r}×
                </button>
              ))}
            </div>
          </Row>

          {provider === 'system' && voices.length > 0 && (
            <Row>
              <Label>System voice</Label>
              <select value={settings.ttsVoice ?? ''} onChange={e => set('ttsVoice', e.target.value)} style={inputStyle}>
                <option value="">System default</option>
                {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
              </select>
            </Row>
          )}

          {isCloud && (
            <>
              <Row>
                <Label>{provider === 'openai' ? 'OpenAI API key' : 'ElevenLabs API key'}</Label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="password"
                    value={keyInput}
                    onChange={e => setKeyInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveKey() }}
                    placeholder={tts?.hasKey ? '•••••••••• (saved — paste to replace)' : (provider === 'openai' ? 'sk-...' : 'paste your key')}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={saveKey} disabled={busy || !keyInput.trim()} style={{ fontSize: 11.5, fontWeight: 800, color: accent, background: rgba(accent, 0.1), border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 8, padding: '0 14px', cursor: keyInput.trim() ? 'pointer' : 'default', opacity: keyInput.trim() ? 1 : 0.5 }}>Save</button>
                  {tts?.hasKey && (
                    <button onClick={() => saveCfg({ apiKey: '' })} disabled={busy} title="Forget key" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', background: 'transparent', border: '1px solid var(--border-2)', borderRadius: 8, padding: '0 12px', cursor: 'pointer' }}>Clear</button>
                  )}
                </div>
                {tts && !tts.safeStorage && (
                  <div style={{ fontSize: 10, color: '#ffb74d', marginTop: 5, lineHeight: 1.5 }}>
                    Your OS keychain isn’t available, so the key is stored unencrypted on this machine.
                  </div>
                )}
                <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 5, lineHeight: 1.5 }}>
                  {provider === 'openai'
                    ? 'Get a key at platform.openai.com. Billed per character to your OpenAI account.'
                    : 'Get a key at elevenlabs.io. Billed per character to your ElevenLabs account.'}
                </div>
              </Row>

              <Row>
                <Label>Voice</Label>
                {provider === 'openai' ? (
                  <select value={tts?.voice || ''} onChange={e => saveCfg({ voice: e.target.value })} style={inputStyle}>
                    <option value="">{`Default (${voiceHint || 'alloy'})`}</option>
                    {OPENAI_VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : (
                  <input
                    value={tts?.voice || ''}
                    onChange={e => setTts({ ...tts, voice: e.target.value })}
                    onBlur={e => saveCfg({ voice: e.target.value })}
                    placeholder={`Voice ID (default: Rachel ${voiceHint || ''})`}
                    style={inputStyle}
                  />
                )}
              </Row>

              <Row>
                <Label>Model (optional)</Label>
                <input
                  value={tts?.model || ''}
                  onChange={e => setTts({ ...tts, model: e.target.value })}
                  onBlur={e => saveCfg({ model: e.target.value })}
                  placeholder={`Default: ${modelHint || ''}`}
                  style={inputStyle}
                />
              </Row>
            </>
          )}

          <Row>
            <button
              onClick={testVoice}
              disabled={testing}
              className="flex items-center justify-center"
              style={{ gap: 8, width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: `1px solid ${rgba(accent, 0.3)}`, color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
            >
              {testing ? <span className="sush-spinner" style={{ width: 12, height: 12 }} /> : <Icon name="volume2" size={14} color={accent} strokeWidth={2} />}
              {testing ? 'Speaking…' : 'Test voice'}
            </button>
            {err && <div style={{ color: '#ff8aa0', fontSize: 11, fontWeight: 700, marginTop: 6 }}>{err}</div>}
          </Row>
        </>
      )}
    </Section>
  )
}

// Preferences backup: writes settings + custom agents to a JSON file the user
// can stash or move to another machine. Deliberately excludes secrets — the TTS
// key lives in main, account logins live in per-identity dirs, neither is here.
function BackupRow({ accent, settings, onChange }) {
  const fileRef = useRef(null)
  const [msg, setMsg] = useState('')

  const btn = (primary) => ({ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '8px 12px', borderRadius: 8, background: primary ? rgba(accent, 0.1) : 'var(--surface-2)', border: `1px solid ${primary ? rgba(accent, 0.35) : 'var(--border-2)'}`, color: primary ? accent : 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontWeight: 700 })

  const doExport = () => {
    try {
      const data = { app: 'sush', kind: 'preferences', version: 1, exportedAt: new Date().toISOString(), settings: settings || {}, customAgents: loadCustomAgents() }
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url; a.download = 'sush-preferences.json'; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMsg('Exported sush-preferences.json')
    } catch { setMsg('Export failed.') }
  }

  const onPick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || '{}'))
        if (data.app !== 'sush' || !data.settings) { setMsg('That isn’t a Sush backup file.'); return }
        if (Array.isArray(data.customAgents)) saveCustomAgents(data.customAgents)
        onChange({ ...settings, ...data.settings })
        setMsg('Restored. A few changes apply on next launch.')
      } catch { setMsg('Could not read that file.') }
    }
    reader.readAsText(file)
  }

  return (
    <Row>
      <Label>Preferences backup</Label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={doExport} style={btn(true)}><Icon name="download" size={13} strokeWidth={2} /> Export</button>
        <button onClick={() => fileRef.current?.click()} style={btn(false)}><Icon name="upload" size={13} strokeWidth={2} /> Import</button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onPick} style={{ display: 'none' }} />
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 6, lineHeight: 1.45 }}>
        Saves your settings and custom agents to a file. No API keys or account logins are included.
      </div>
      {msg && <div style={{ fontSize: 11, fontWeight: 700, color: accent, marginTop: 6 }}>{msg}</div>}
    </Row>
  )
}

export default function Settings({ settings, onChange, onClose, accent, onEditSushrc }) {
  const set = (key, val) => onChange({ ...settings, [key]: val })
  const ent = useEntitlements()
  const [voices, setVoices] = useState([])

  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis?.getVoices() ?? [])
    load()
    window.speechSynthesis?.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', load)
  }, [])

  // Standalone settings page: left nav scrolls the content pane to the
  // matching section, and the nav highlight tracks the section you scroll past.
  const bodyRef = useRef(null)
  const [activeSec, setActiveSec] = useState(SETTINGS_NAV[0].sec)
  const [query, setQuery] = useState('')
  const goTo = (sec) => {
    setActiveSec(sec)
    bodyRef.current?.querySelector(`[data-settings-sec="${sec}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Scroll-spy: highlight whichever section is nearest the top of the pane.
  useEffect(() => {
    const root = bodyRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const secs = Array.from(root.querySelectorAll('[data-settings-sec]'))
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActiveSec(top.target.getAttribute('data-settings-sec'))
      },
      { root, rootMargin: '0px 0px -70% 0px', threshold: 0 }
    )
    secs.forEach(s => io.observe(s))
    return () => io.disconnect()
  }, [])

  // Filter the nav (and content) by the search box — matches label or keywords.
  const q = query.trim().toLowerCase()
  const navMatch = (item) => !q || item.label.toLowerCase().includes(q) || (item.keywords || '').includes(q)
  const visibleSecs = SETTINGS_NAV.filter(navMatch)
  const visibleSet = new Set(visibleSecs.map(i => i.sec))

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Search hides non-matching sections in the content pane too (toggled on the
  // DOM nodes so no section component needs to know about the filter).
  useEffect(() => {
    const root = bodyRef.current
    if (!root) return
    root.querySelectorAll('[data-settings-sec]').forEach(el => {
      const sec = el.getAttribute('data-settings-sec')
      el.style.display = (!q || visibleSet.has(sec)) ? '' : 'none'
    })
  }, [q])

  return (
    <div className="sush-page-in" style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', background: 'var(--surface-0)' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 26px', borderBottom: '1px solid var(--border-1)', flexShrink: 0 }}>
        <div className="flex items-center" style={{ gap: 13 }}>
          <span className="flex items-center justify-center" style={{ width: 38, height: 38, borderRadius: 11, background: `linear-gradient(150deg, ${rgba(accent, 0.3)}, ${rgba(accent, 0.06)})`, border: `1px solid ${rgba(accent, 0.4)}`, boxShadow: `0 8px 22px ${rgba(accent, 0.2)}, inset 0 1px 0 rgba(255,255,255,0.1)`, color: accent }}>
            <Icon name="settings" size={18} strokeWidth={2} />
          </span>
          <div>
            <div style={{ color: 'var(--text-1)', fontWeight: 900, fontSize: 19, letterSpacing: -0.4, lineHeight: 1.1 }}>Settings</div>
            <div style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)', fontWeight: 600, marginTop: 1 }}>Tune Sush to your machine and taste</div>
          </div>
        </div>
        <button onClick={onClose} title="Back (Esc)" className="flex items-center" style={{ gap: 7, height: 32, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border-2)', background: 'var(--surface-1)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
          <Icon name="x" size={13} /> Close
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Section nav — searchable, grouped, with a scroll-spy highlight */}
        <nav style={{ width: 204, flexShrink: 0, borderRight: '1px solid var(--border-1)', padding: '13px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }} className="sush-scroll">
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', display: 'flex', pointerEvents: 'none' }}>
              <Icon name="search" size={13} strokeWidth={2} />
            </span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search settings"
              style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)', borderRadius: 9, padding: '7px 9px 7px 28px', fontSize: 12, outline: 'none' }}
              onFocus={e => { e.target.style.borderColor = rgba(accent, 0.5) }}
              onBlur={e => { e.target.style.borderColor = 'var(--border-2)' }}
            />
          </div>
          {NAV_GROUPS.map(group => {
            const items = visibleSecs.filter(i => i.group === group)
            if (!items.length) return null
            return (
              <div key={group} style={{ marginBottom: 4 }}>
                {!q && <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.9, color: 'var(--text-5)', textTransform: 'uppercase', padding: '6px 11px 4px' }}>{group}</div>}
                {items.map(item => {
                  const on = activeSec === item.sec
                  return (
                    <button
                      key={item.sec}
                      onClick={() => goTo(item.sec)}
                      className="flex items-center"
                      style={{ gap: 9, width: '100%', padding: '8px 11px', marginBottom: 1, borderRadius: 9, border: 'none', borderLeft: `2px solid ${on ? accent : 'transparent'}`, textAlign: 'left', background: on ? rgba(accent, 0.12) : 'transparent', color: on ? accent : 'var(--text-3)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, transition: 'background 0.12s' }}
                    >
                      <Icon name={item.icon} size={14} strokeWidth={2} color={on ? accent : 'var(--text-4)'} />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            )
          })}
          {q && !visibleSecs.length && (
            <div style={{ fontSize: 11, color: 'var(--text-4)', fontWeight: 600, padding: '8px 11px', lineHeight: 1.5 }}>No settings match “{query}”.</div>
          )}
        </nav>

        {/* Content */}
        <div ref={bodyRef} className="sush-scroll" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '22px 30px' }}>
          <div style={{ maxWidth: 640 }}>
          {/* AI */}
          <Section title="AI -- Seducia" accent={accent}>
            <Row>
              <Label>CLI engine</Label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['auto', 'Auto'], ['claude', 'Claude'], ['codex', 'Codex'], ['gemini', 'Gemini']].map(([val, lbl]) => {
                  const current = settings.seduciaCliEngine || 'auto'
                  const on = current === val
                  return (
                    <button
                      key={val}
                      onClick={() => set('seduciaCliEngine', val)}
                      style={{ flex: 1, padding: '7px 0', borderRadius: 'var(--r-sm)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', background: on ? accent : 'var(--surface-2)', color: on ? '#0a0a0a' : 'var(--text-3)', border: `1px solid ${on ? accent : 'var(--border-2)'}` }}
                    >
                      {lbl}
                    </button>
                  )
                })}
              </div>
            </Row>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', background: rgba(accent, 0.05), border: `1px solid ${rgba(accent, 0.16)}`, borderRadius: 8, padding: '9px 12px', lineHeight: 1.5 }}>
              Seducia drives your logged-in agent CLIs — no API key, no extra billing, it just rides your existing subscription. <strong style={{ color: accent }}>Auto</strong> tries claude first and rolls over to codex, then gemini when one is limited or missing. Manage logins and limit behaviour under <strong style={{ color: accent }}>Accounts</strong>.
            </div>
          </Section>

          {/* Plan — tier + unlock-code redemption */}
          <PlanSection accent={accent} ent={ent} />

          {/* Accounts — the Claude/Codex account switcher */}
          <AccountsSection accent={accent} />

          {/* Usage — live limit/account dashboard across all CLIs */}
          <UsageSection accent={accent} settings={settings} set={set} />

          {/* Agents — built-ins + the user's custom CLIs */}
          <AgentsSection accent={accent} ent={ent} />

          {/* Voice — system + cloud (OpenAI / ElevenLabs) TTS */}
          <VoiceSection accent={accent} settings={settings} set={set} voices={voices} ent={ent} />

          {/* Terminal */}
          <Section title="Terminal" accent={accent}>
            <Row>
              <Label>Font size</Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="range" min={8} max={28} value={settings.fontSize ?? 14} onChange={e => set('fontSize', Number(e.target.value))} style={{ flex: 1, accentColor: accent }} />
                <span style={{ color: 'var(--text-2)', fontSize: 12, width: 24, textAlign: 'right', fontWeight: 700 }}>{settings.fontSize ?? 14}</span>
              </div>
            </Row>
            <Row>
              <Label>Font family</Label>
              <select value={settings.fontFamily ?? FONTS[0]} onChange={e => set('fontFamily', e.target.value)} style={{ width: '100%', background: 'var(--surface-2)', border: `1px solid var(--border-2)`, color: 'var(--text-2)', borderRadius: 8, padding: '7px 10px', fontSize: 12 }}>
                {FONTS.map(f => <option key={f} value={f}>{f.replace(/'/g, '')}</option>)}
              </select>
            </Row>
            <Row>
              <Label>Cursor style</Label>
              <div style={{ display: 'flex', gap: 6 }}>
                {CURSORS.map(c => (
                  <button key={c} onClick={() => set('cursorStyle', c)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700, background: (settings.cursorStyle ?? 'block') === c ? accent : 'var(--surface-2)', color: (settings.cursorStyle ?? 'block') === c ? '#000' : 'var(--text-3)', border: `1px solid ${(settings.cursorStyle ?? 'block') === c ? accent : 'var(--border-2)'}` }}>
                    {c}
                  </button>
                ))}
              </div>
            </Row>
          </Section>

          {/* Appearance */}
          <Section title="Appearance" accent={accent}>
            <Row>
              <Label>Power saver (max battery)</Label>
              <button
                onClick={() => set('powerSaver', !settings.powerSaver)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: settings.powerSaver ? rgba(accent, 0.1) : 'var(--surface-2)', border: `1px solid ${settings.powerSaver ? rgba(accent, 0.4) : 'var(--border-2)'}`, color: settings.powerSaver ? accent : 'var(--text-3)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, width: '100%' }}
              >
                <Icon name="activity" size={14} strokeWidth={2} />
                {settings.powerSaver ? 'Power saver ON — lightest on CPU/GPU/battery' : 'Power saver off'}
              </button>
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 6, lineHeight: 1.4 }}>
                The lightest setting: includes Reduce-effects, freezes every ambient
                animation, drops glows/shadows, and slows background polling. Turn it
                on when the battery’s low or the laptop’s warm. <strong style={{ color: accent }}>Ctrl+Shift+E</strong> toggles it anywhere.
              </div>
            </Row>
            <Row>
              <Label>Auto power saver on low battery</Label>
              <button
                onClick={() => set('autoPowerSaver', settings.autoPowerSaver === false)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: settings.autoPowerSaver !== false ? rgba(accent, 0.1) : 'var(--surface-2)', border: `1px solid ${settings.autoPowerSaver !== false ? rgba(accent, 0.4) : 'var(--border-2)'}`, color: settings.autoPowerSaver !== false ? accent : 'var(--text-3)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, width: '100%' }}
              >
                <Icon name="leaf" size={14} strokeWidth={2} />
                {settings.autoPowerSaver !== false ? 'On — saver kicks in under 20% on battery' : 'Off — only the manual toggle'}
              </button>
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 6, lineHeight: 1.4 }}>
                When you’re unplugged and the battery drops below 20%, Sush flips
                into power saver on its own, then steps back out once you charge.
              </div>
            </Row>
            <Row>
              <Label>Reduce effects (performance)</Label>
              <button
                onClick={() => set('lite', !settings.lite)}
                disabled={settings.powerSaver}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: (settings.lite || settings.powerSaver) ? rgba(accent, 0.1) : 'var(--surface-2)', border: `1px solid ${(settings.lite || settings.powerSaver) ? rgba(accent, 0.4) : 'var(--border-2)'}`, color: (settings.lite || settings.powerSaver) ? accent : 'var(--text-3)', cursor: settings.powerSaver ? 'default' : 'pointer', fontSize: 12.5, fontWeight: 700, width: '100%', opacity: settings.powerSaver ? 0.7 : 1 }}
              >
                <Icon name="activity" size={14} strokeWidth={2} />
                {(settings.lite || settings.powerSaver) ? 'Lite mode on — glass blur off' : 'Full glass effects'}
              </button>
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 6, lineHeight: 1.4 }}>
                Drops the frosted-glass blur and ambient glow animations. Big GPU
                saver on laptops or when running a busy agent swarm.{settings.powerSaver ? ' (Included in Power saver.)' : ''}
              </div>
            </Row>
            <Row>
              <Label>Restore session history</Label>
              <button
                onClick={() => set('persistScrollback', settings.persistScrollback === false)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: settings.persistScrollback !== false ? rgba(accent, 0.1) : 'var(--surface-2)', border: `1px solid ${settings.persistScrollback !== false ? rgba(accent, 0.4) : 'var(--border-2)'}`, color: settings.persistScrollback !== false ? accent : 'var(--text-3)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, width: '100%' }}
              >
                <Icon name="clock" size={14} strokeWidth={2} />
                {settings.persistScrollback !== false ? 'Replaying recent output on reopen' : 'History restore off'}
              </button>
            </Row>
            <Row>
              <Label>Resume agent sessions on launch</Label>
              <button
                onClick={() => set('resumeAgents', settings.resumeAgents === false)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: settings.resumeAgents !== false ? rgba(accent, 0.1) : 'var(--surface-2)', border: `1px solid ${settings.resumeAgents !== false ? rgba(accent, 0.4) : 'var(--border-2)'}`, color: settings.resumeAgents !== false ? accent : 'var(--text-3)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, width: '100%' }}
              >
                <Icon name="terminal" size={14} strokeWidth={2} />
                {settings.resumeAgents !== false ? 'Re-launching agents (claude --continue, …)' : 'Restored tabs open a bare shell'}
              </button>
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 6, lineHeight: 1.4 }}>
                When on, a restored Claude/Codex tab re-runs its CLI in resume mode so the
                previous conversation continues. Applies on next launch.
              </div>
            </Row>
            <WallpaperRow accent={accent} settings={settings} set={set} />
          </Section>

          {/* Profile */}
          <Section title="Sush Profile" accent={accent}>
            <Row>
              <Label>Suggest aliases from habits</Label>
              <button
                onClick={() => set('autoAlias', settings.autoAlias === false)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: settings.autoAlias !== false ? rgba(accent, 0.1) : 'var(--surface-2)', border: `1px solid ${settings.autoAlias !== false ? rgba(accent, 0.4) : 'var(--border-2)'}`, color: settings.autoAlias !== false ? accent : 'var(--text-3)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, width: '100%' }}
              >
                <Icon name="sparkles" size={14} strokeWidth={2} />
                {settings.autoAlias !== false ? 'Offering aliases for repeated commands' : 'Alias suggestions off'}
              </button>
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 6, lineHeight: 1.4 }}>
                Run a command ~15× and Sush offers to save it as a short alias in
                your .sushrc. Nothing is written until you accept.
              </div>
            </Row>
            <Row>
              <Label>.sushrc — aliases, env, startup</Label>
              <button
                onClick={() => onEditSushrc?.()}
                className="sush-btn"
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 9, background: 'var(--surface-2)', border: `1px solid ${rgba(accent, 0.3)}`, color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, width: '100%' }}
              >
                <Icon name="fileText" size={14} color={accent} strokeWidth={2} />
                Edit .sushrc profile
                <Icon name="arrowRight" size={13} color="var(--text-4)" style={{ marginLeft: 'auto' }} />
              </button>
            </Row>
            <BackupRow accent={accent} settings={settings} onChange={onChange} />
          </Section>

          {/* Theme */}
          <Section title="Theme" accent={accent}>
            <Row>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.values(themes).map(t => (
                  <button key={t.id} onClick={() => set('themeId', t.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, cursor: 'pointer', background: (settings.themeId ?? 'pink') === t.id ? rgba(t.ui.accent, 0.1) : 'var(--surface-2)', border: `1px solid ${(settings.themeId ?? 'pink') === t.id ? t.ui.accent : 'var(--border-2)'}`, color: 'var(--text-2)', fontSize: 13, textAlign: 'left' }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: t.ui.accent, flexShrink: 0, boxShadow: `0 0 6px ${t.ui.accent}` }} />
                    {t.label}
                    {(settings.themeId ?? 'pink') === t.id && <Icon name="check" size={13} color={t.ui.accent} style={{ marginLeft: 'auto' }} />}
                  </button>
                ))}
              </div>
            </Row>
          </Section>

          {/* Window */}
          <Section title="Window" accent={accent}>
            <Row>
              <Label>Window opacity</Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="range" min={70} max={100} value={settings.opacity ?? 100} onChange={e => set('opacity', Number(e.target.value))} style={{ flex: 1, accentColor: accent }} />
                <span style={{ color: 'var(--text-2)', fontSize: 12, width: 36, textAlign: 'right', fontWeight: 700 }}>{settings.opacity ?? 100}%</span>
              </div>
            </Row>
            <Row>
              <Label>Minimize to tray</Label>
              <button
                onClick={() => set('minimizeToTray', !settings.minimizeToTray)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: settings.minimizeToTray ? rgba(accent, 0.1) : 'var(--surface-2)', border: `1px solid ${settings.minimizeToTray ? rgba(accent, 0.4) : 'var(--border-2)'}`, color: settings.minimizeToTray ? accent : 'var(--text-3)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
              >
                {settings.minimizeToTray ? 'On - minimize hides Sush into the tray' : 'Off - minimize goes to the taskbar'}
              </button>
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 5, lineHeight: 1.5 }}>
                When on, the minimize dot tucks Sush into the system tray. Click the tray icon to bring it back.
              </div>
            </Row>
            <Row>
              <Label>Hush dictation</Label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => set('hushEnabled', settings.hushEnabled === false ? true : false)}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: settings.hushEnabled !== false ? rgba(accent, 0.1) : 'var(--surface-2)', border: `1px solid ${settings.hushEnabled !== false ? rgba(accent, 0.4) : 'var(--border-2)'}`, color: settings.hushEnabled !== false ? accent : 'var(--text-3)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
                >
                  {settings.hushEnabled !== false ? 'On - mic button + Ctrl+Shift+S' : 'Off'}
                </button>
                {settings.hushEnabled !== false && (
                  <button
                    onClick={() => set('hushAutoSend', settings.hushAutoSend === false ? true : false)}
                    title="Whether dictation presses Enter for you"
                    style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
                  >
                    {settings.hushAutoSend !== false ? 'Sends automatically' : 'Review before send'}
                  </button>
                )}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 5, lineHeight: 1.5 }}>
                Hush types what you say into the focused terminal and presses Enter (switch to review mode to check before sending). Pure dictation, separate from Seducia.
              </div>
            </Row>
            <Row>
              <Label>Agent notifications</Label>
              <button
                onClick={() => set('agentNotifications', settings.agentNotifications === false)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: settings.agentNotifications !== false ? rgba(accent, 0.1) : 'var(--surface-2)', border: `1px solid ${settings.agentNotifications !== false ? rgba(accent, 0.4) : 'var(--border-2)'}`, color: settings.agentNotifications !== false ? accent : 'var(--text-3)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, width: '100%' }}
              >
                <Icon name="activity" size={14} strokeWidth={2} />
                {settings.agentNotifications !== false ? 'Notify when an agent needs you / finishes' : 'Agent notifications off'}
              </button>
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 5, lineHeight: 1.5 }}>
                A desktop notification when a session needs input, errors, or finishes while Sush is in the background. Never fires while the window is focused.
              </div>
            </Row>
            <Row>
              <Label>Sleep after inactivity</Label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[0, 5, 10, 20, 30].map(mins => {
                  const current = settings.idleSleepMinutes ?? 10
                  const on = current === mins
                  return (
                    <button
                      key={mins}
                      onClick={() => set('idleSleepMinutes', mins)}
                      style={{ padding: '7px 13px', borderRadius: 8, border: `1px solid ${on ? rgba(accent, 0.5) : 'var(--border-2)'}`, background: on ? rgba(accent, 0.12) : 'var(--surface-2)', color: on ? accent : 'var(--text-3)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                    >
                      {mins === 0 ? 'Off' : `${mins} min`}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 5, lineHeight: 1.5 }}>
                No input for this long and Sush dims, freezes animations, and stops every poll - terminals and agents keep running. Any key or click wakes it.
              </div>
            </Row>
          </Section>
          </div>
        </div>
      </div>
    </div>
  )
}
