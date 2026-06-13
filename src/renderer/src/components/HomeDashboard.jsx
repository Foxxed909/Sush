import React, { useState, useEffect } from 'react'
import Icon from './Icons'
import { rgba, accentVars } from '../lib/ui'

function stripAnsi(value) {
  return String(value ?? '').replace(/\x1b\[[0-9;]*m/g, '')
}

function formatTime(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function greeting(h) {
  if (h < 5) return { hi: 'Still up', sub: "The terminal's ready when you are." }
  if (h < 12) return { hi: 'Good morning', sub: 'A fresh shell awaits.' }
  if (h < 18) return { hi: 'Good afternoon', sub: 'Pick up where you left off.' }
  return { hi: 'Good evening', sub: "Let's get something running." }
}

function useLiveClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

function SectionLabel({ icon, children, accent }) {
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 14 }}>
      {icon && <Icon name={icon} size={13} color={accent} strokeWidth={2.4} />}
      <span style={{ color: '#8a939c', fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase' }}>
        {children}
      </span>
      <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${rgba(accent, 0.22)}, transparent)` }} />
    </div>
  )
}

export default function HomeDashboard({
  tabs,
  recentSessions,
  smartResult,
  accent,
  userName,
  pinnedProjects = [],
  onTogglePin,
  onRun,
  onOpenRecent,
  onOpenTab,
  onNewSession,
  onSeducia
}) {
  const now = useLiveClock()
  const greet = greeting(now.getHours())
  const clockStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const active = tabs.find(tab => tab.status === 'running') || tabs[0]
  const cwdItems = [
    active?.cwd && { label: active.label, path: active.cwd },
    ...recentSessions.map(item => ({ label: item.label, path: item.cwd }))
  ].filter(Boolean)
  const uniqueCwds = cwdItems
    .filter((item, index, list) => list.findIndex(other => other.path === item.path) === index)
    .slice(0, 5)

  const quick = [
    { icon: 'terminal', label: 'Terminal', sub: 'New shell session', run: () => onOpenTab() },
    { icon: 'serve', label: 'Serve', sub: 'Run dev server', run: () => onRun('serve') },
    { icon: 'ports', label: 'Ports', sub: 'Listening TCP', run: () => onRun('ports') },
    { icon: 'doctor', label: 'Doctor', sub: 'Environment check', run: () => onRun('doctor') }
  ]

  return (
    <div
      className="absolute inset-0 overflow-y-auto sush-scroll"
      style={{
        ...accentVars(accent),
        // Base is transparent so the app-level wallpaper (already dimmed in
        // App.jsx) shows through the home view like it does behind terminals.
        // With no wallpaper, the parent paints theme.xterm.background — same
        // dark as before. The accent glows still stack on top either way.
        background: `radial-gradient(1100px 460px at 12% -8%, ${rgba(accent, 0.12)}, transparent 70%), radial-gradient(900px 500px at 100% 0%, ${rgba(accent, 0.06)}, transparent 60%), transparent`,
        color: '#e8edf1',
        padding: '32px clamp(18px, 4vw, 48px) 44px'
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto' }} className="sush-fade-up">
        {/* Hero */}
        <div className="flex items-start justify-between gap-4" style={{ marginBottom: 34 }}>
          <div className="flex items-center" style={{ gap: 16, minWidth: 0 }}>
            <div
              className="flex items-center justify-center"
              style={{
                width: 54,
                height: 54,
                borderRadius: 14,
                flexShrink: 0,
                background: `linear-gradient(150deg, ${rgba(accent, 0.28)}, ${rgba(accent, 0.05)})`,
                border: `1px solid ${rgba(accent, 0.45)}`,
                boxShadow: `0 10px 30px ${rgba(accent, 0.22)}, inset 0 1px 0 ${rgba('#ffffff', 0.08)}`,
                color: accent
              }}
            >
              <Icon name="terminal" size={26} strokeWidth={2.4} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 34,
                  lineHeight: 1.05,
                  color: '#f3f6f8',
                  letterSpacing: -0.5
                }}
              >
                {greet.hi}{userName ? `, ${userName}` : ''} <span style={{ color: accent, textShadow: `0 0 32px ${rgba(accent, 0.45)}` }}>·</span> Sush
              </div>
              <div className="flex items-center" style={{ gap: 10, marginTop: 6 }}>
                <span style={{ fontSize: 13.5, color: '#8a939c', fontWeight: 600 }}>{greet.sub}</span>
                <span style={{ fontSize: 12, color: rgba(accent, 0.6), fontWeight: 800, background: rgba(accent, 0.08), borderRadius: 6, padding: '2px 8px', border: `1px solid ${rgba(accent, 0.15)}` }}>{clockStr}</span>
              </div>
              <div className="flex items-center" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <span
                  className="flex items-center"
                  style={{
                    gap: 6,
                    fontSize: 11.5,
                    color: '#aab3bb',
                    background: '#11151a',
                    border: '1px solid #20272e',
                    borderRadius: 999,
                    padding: '4px 11px',
                    maxWidth: 380,
                    overflow: 'hidden'
                  }}
                  title={active?.cwd || ''}
                >
                  <Icon name="folder" size={12} color={accent} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {active?.cwd || active?.profileLabel || 'Workspace'}
                  </span>
                </span>
                <span
                  className="flex items-center"
                  style={{
                    gap: 6,
                    fontSize: 11.5,
                    color: '#aab3bb',
                    background: '#11151a',
                    border: '1px solid #20272e',
                    borderRadius: 999,
                    padding: '4px 11px'
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent, boxShadow: `0 0 8px ${accent}` }} />
                  {tabs.length} session{tabs.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center" style={{ gap: 10, flexShrink: 0 }}>
            {onSeducia && (
              <button
                onClick={onSeducia}
                className="sush-btn flex items-center"
                title="Open Seducia (Ctrl+K)"
                style={{
                  gap: 8,
                  height: 40,
                  borderRadius: 10,
                  border: `1px solid ${rgba(accent, 0.45)}`,
                  background: rgba(accent, 0.1),
                  color: accent,
                  padding: '0 15px',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: 13
                }}
              >
                <Icon name="sparkles" size={16} strokeWidth={2.3} color={accent} />
                Ask Seducia
              </button>
            )}
            <button
              onClick={() => (onNewSession ? onNewSession() : onOpenTab())}
              className="sush-btn flex items-center"
              style={{
                gap: 8,
                height: 40,
                border: 'none',
                borderRadius: 10,
                background: accent,
                color: '#0a0a0a',
                padding: '0 16px',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: 13,
                boxShadow: `0 8px 22px ${rgba(accent, 0.35)}`
              }}
            >
              <Icon name="plus" size={16} strokeWidth={2.6} color="#0a0a0a" />
              New workspace
            </button>
          </div>
        </div>

        {/* Quick actions */}
        <section style={{ marginBottom: 30 }}>
          <SectionLabel icon="spark" accent={accent}>Quick actions</SectionLabel>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 14
            }}
          >
            {quick.map(item => (
              <button
                key={item.label}
                onClick={item.run}
                className="sush-tile flex items-center"
                style={{
                  gap: 13,
                  textAlign: 'left',
                  border: '1px solid #1d242b',
                  borderRadius: 13,
                  background: 'linear-gradient(180deg, #12161b, #0d1115)',
                  color: '#e6ebef',
                  padding: '15px 16px',
                  cursor: 'pointer'
                }}
              >
                <span
                  className="sush-tile-icon flex items-center justify-center"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    flexShrink: 0,
                    background: rgba(accent, 0.12),
                    border: `1px solid ${rgba(accent, 0.28)}`,
                    color: accent
                  }}
                >
                  <Icon name={item.icon} size={19} strokeWidth={2.1} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>{item.label}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#76808a', marginTop: 2 }}>{item.sub}</span>
                </span>
                <Icon name="arrowRight" size={15} color="#3f4852" className="sush-tile-arrow" />
              </button>
            ))}
          </div>
        </section>

        {/* Pinned projects — star a workdir below to keep it here */}
        {pinnedProjects.length > 0 && (
          <section style={{ marginBottom: 30 }}>
            <SectionLabel icon="star" accent={accent}>Pinned</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {pinnedProjects.map(item => (
                <div
                  key={item.cwd}
                  className="sush-row flex items-center"
                  title={item.cwd}
                  style={{
                    gap: 9,
                    border: `1px solid ${rgba(accent, 0.25)}`,
                    borderRadius: 10,
                    background: rgba(accent, 0.05),
                    padding: '8px 6px 8px 13px',
                    maxWidth: 280
                  }}
                >
                  <button
                    onClick={() => onRun(`work "${item.cwd}"`)}
                    className="flex items-center"
                    style={{ gap: 8, background: 'none', border: 'none', color: '#e6ebef', cursor: 'pointer', fontSize: 12.5, fontWeight: 800, minWidth: 0, padding: 0 }}
                  >
                    <Icon name="star" size={13} color={accent} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                  </button>
                  <button
                    onClick={() => onTogglePin?.(item)}
                    title="Unpin"
                    className="flex items-center justify-center"
                    style={{ width: 20, height: 20, borderRadius: 6, background: 'none', border: 'none', color: '#5a646d', cursor: 'pointer', flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#ff8aa0' }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#5a646d' }}
                  >
                    <Icon name="x" size={12} strokeWidth={2.2} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* npm Scripts quick-run (if package.json present) */}
        <NpmScriptsSection accent={accent} cwd={active?.cwd} onRun={onRun} />

        {/* Workdirs + Recent */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 26,
            alignItems: 'start'
          }}
        >
          <section style={{ minWidth: 0 }}>
            <SectionLabel icon="folder" accent={accent}>Workdirs</SectionLabel>
            <div className="flex flex-col" style={{ gap: 9 }}>
              {uniqueCwds.length ? uniqueCwds.map(item => (
                <button
                  key={item.path}
                  title={item.path}
                  onClick={() => onRun(`work "${item.path}"`)}
                  className="sush-row flex items-center"
                  style={{
                    gap: 12,
                    width: '100%',
                    textAlign: 'left',
                    border: '1px solid #1b2127',
                    borderRadius: 11,
                    background: '#0f1318',
                    color: '#d8dee4',
                    padding: '11px 13px',
                    cursor: 'pointer'
                  }}
                >
                  <Icon name="folder" size={17} color={accent} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.label}
                    </span>
                    <span style={{ display: 'block', fontSize: 10.5, color: '#69737d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3 }}>
                      {item.path}
                    </span>
                  </span>
                  {onTogglePin && (
                    <span
                      role="button"
                      title={pinnedProjects.some(p => p.cwd === item.path) ? 'Unpin from Home' : 'Pin to Home'}
                      onClick={(e) => { e.stopPropagation(); onTogglePin({ cwd: item.path, label: item.label }) }}
                      className="flex items-center justify-center"
                      style={{ width: 22, height: 22, borderRadius: 6, color: pinnedProjects.some(p => p.cwd === item.path) ? accent : '#3f4852', flexShrink: 0 }}
                    >
                      <Icon name="star" size={13} strokeWidth={2} />
                    </span>
                  )}
                  <Icon name="arrowRight" size={14} color="#3f4852" className="sush-row-arrow" />
                </button>
              )) : (
                <EmptyState icon="folder" accent={accent}>No directories yet</EmptyState>
              )}
            </div>
          </section>

          <section style={{ minWidth: 0 }}>
            <SectionLabel icon="clock" accent={accent}>Recent workspaces</SectionLabel>
            <div className="flex flex-col" style={{ gap: 9 }}>
              {recentSessions.length ? recentSessions.slice(0, 5).map(item => (
                <button
                  key={`${item.profileId}:${item.shell}:${item.cwd}`}
                  title={item.cwd}
                  onClick={() => onOpenRecent(item)}
                  className="sush-row flex items-center"
                  style={{
                    gap: 12,
                    width: '100%',
                    textAlign: 'left',
                    border: '1px solid #1b2127',
                    borderRadius: 11,
                    background: '#0f1318',
                    color: '#d8dee4',
                    padding: '11px 13px',
                    cursor: 'pointer'
                  }}
                >
                  <Icon name="clock" size={17} color={accent} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="flex items-center justify-between" style={{ gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                      <span style={{ fontSize: 10.5, color: '#69737d', fontWeight: 700, flexShrink: 0 }}>{formatTime(item.updatedAt)}</span>
                    </span>
                    <span style={{ display: 'block', fontSize: 10.5, color: '#69737d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3 }}>
                      {item.cwd}
                    </span>
                  </span>
                </button>
              )) : (
                <EmptyState icon="clock" accent={accent}>No sessions yet</EmptyState>
              )}
            </div>
          </section>
        </div>

        {/* Smart command output */}
        {smartResult?.output && (
          <section style={{ marginTop: 30 }}>
            <SectionLabel accent={accent}>{smartResult.input || 'output'}</SectionLabel>
            <pre
              className="sush-scroll"
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: '#080a0c',
                border: `1px solid ${smartResult.type === 'error' ? 'rgba(255,83,112,0.4)' : rgba(accent, 0.22)}`,
                borderRadius: 11,
                color: smartResult.type === 'error' ? '#ff9aaa' : '#d4dbe1',
                padding: 14,
                maxHeight: 280,
                overflow: 'auto',
                fontSize: 12,
                lineHeight: 1.5,
                boxShadow: '0 10px 30px rgba(0,0,0,0.4)'
              }}
            >
              {stripAnsi(smartResult.output)}
            </pre>
          </section>
        )}
      </div>
    </div>
  )
}

function NpmScriptsSection({ accent, cwd, onRun }) {
  const [scripts, setScripts] = useState(null)

  useEffect(() => {
    if (!cwd) { setScripts(null); return }
    window.sush?.getNpmScripts?.({ cwd })
      .then(res => { if (res?.ok && Object.keys(res.scripts || {}).length) { setScripts(res.scripts) } else { setScripts(null) } })
      .catch(() => setScripts(null))
  }, [cwd])

  if (!scripts) return null
  const keys = Object.keys(scripts).slice(0, 6)

  return (
    <section style={{ marginBottom: 30 }}>
      <SectionLabel icon="rocket" accent={accent}>npm scripts</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {keys.map(name => (
          <button
            key={name}
            onClick={() => onRun(`npm run ${name}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', border: `1px solid ${rgba(accent, 0.25)}`, borderRadius: 8, background: '#0f1318', color: '#cdd5dc', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
          >
            <Icon name="arrowRight" size={12} color={accent} />
            {name}
          </button>
        ))}
      </div>
    </section>
  )
}

function EmptyState({ icon, accent, children }) {
  return (
    <div
      className="flex items-center"
      style={{
        gap: 10,
        color: '#69737d',
        fontSize: 12.5,
        border: '1px dashed #232b32',
        borderRadius: 11,
        background: rgba(accent, 0.03),
        padding: '16px 14px'
      }}
    >
      <Icon name={icon} size={16} color="#4a5560" />
      {children}
    </div>
  )
}
