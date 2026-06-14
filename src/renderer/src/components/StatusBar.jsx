import React, { useState, useEffect, useCallback } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'
import { usePolling } from '../hooks/usePolling'

// A persistent bottom status strip: cwd · git branch (+ dirty count) · shell ·
// live cpu/mem. Reuses the existing gitStatus + getSystemStats IPC. Polls on a
// gentle 4s cadence; git is re-read whenever the active cwd changes too.
export default function StatusBar({ accent, activeTab, view, sessionCount, workspaceCount = 0, broadcastMode, gridMode, agentSummary, onOpenMission, battery, saverActive, saverAuto }) {
  const cwd = activeTab?.cwd || null
  const shell = activeTab?.shellLabel || activeTab?.shell || null
  const [git, setGit] = useState(null)
  const [stats, setStats] = useState(null)
  const [clock, setClock] = useState(() => new Date())

  // Bottom-corner clock — refreshed each minute (the strip is always visible).
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Git status follows the active directory.
  useEffect(() => {
    let cancelled = false
    if (!cwd) { setGit(null); return }
    window.sush.gitStatus({ cwd })
      .then(g => { if (!cancelled) setGit(g?.repo ? g : null) })
      .catch(() => { if (!cancelled) setGit(null) })
    return () => { cancelled = true }
  }, [cwd])

  // System stats (lightweight: CPU + mem only) + a periodic git refresh to catch
  // dirty-count changes. Polls only while the window is focused — pauses in the
  // background. Uses the lite IPC so the status bar never spawns OS processes.
  const poll = useCallback(() => {
    window.sush.getSystemStatsLite()
      .then(s => { if (s && !s.error) setStats(s) })
      .catch(() => {})
    if (cwd) {
      window.sush.gitStatus({ cwd })
        .then(g => setGit(g?.repo ? g : null))
        .catch(() => {})
    }
  }, [cwd])
  usePolling(poll, 4000)

  const cpu = stats ? Math.round(stats.cpu?.load ?? 0) : null
  const memPct = stats?.memory?.total
    ? Math.round((stats.memory.used / stats.memory.total) * 100)
    : null
  const dirty = git?.files?.length ?? 0

  const divider = 'var(--border-1)'
  const seg = { display: 'flex', alignItems: 'center', gap: 5, padding: '0 10px', height: '100%', borderRight: `1px solid ${divider}` }
  const segR = { ...seg, borderRight: 'none', borderLeft: `1px solid ${divider}` }
  const dim = 'var(--text-3)'

  const usageColor = (v) => v == null ? dim : v >= 85 ? '#ff5370' : v >= 60 ? '#ffcb6b' : 'var(--text-3)'

  return (
    <div
      data-glass
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 26,
        flexShrink: 0,
        background: 'rgba(8,9,10,0.55)',
        borderTop: '1px solid var(--border-1)',
        fontSize: 'var(--fs-sm)',
        color: dim,
        userSelect: 'none',
        overflow: 'hidden'
      }}
    >
      {/* cwd */}
      <span style={{ ...seg, minWidth: 0, maxWidth: '46%' }}>
        <Icon name={view === 'home' ? 'home' : 'folder'} size={12} color={accent} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left' }}>
          {view === 'home' ? 'Home' : (cwd || activeTab?.label || 'No session')}
        </span>
      </span>

      {/* open cwd in Explorer / VS Code */}
      {cwd && view !== 'home' && (
        <span style={{ ...seg, gap: 2, padding: '0 6px' }}>
          <button
            onClick={() => window.sush.openPath({ path: cwd })}
            title="Reveal in Explorer"
            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: dim, cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}
            onMouseEnter={e => { e.currentTarget.style.color = accent }}
            onMouseLeave={e => { e.currentTarget.style.color = dim }}
          >
            <Icon name="folder" size={11} />
          </button>
          <button
            onClick={() => window.sush.openInEditor({ path: cwd })}
            title="Open in VS Code"
            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: dim, cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}
            onMouseEnter={e => { e.currentTarget.style.color = accent }}
            onMouseLeave={e => { e.currentTarget.style.color = dim }}
          >
            <Icon name="code" size={11} />
          </button>
        </span>
      )}

      {/* git */}
      {git && (
        <span style={seg}>
          <Icon name="gitBranch" size={12} color={dirty ? '#ffcb6b' : 'var(--text-3)'} />
          <span style={{ color: 'var(--text-2)', fontWeight: 700 }}>{git.branch}</span>
          {dirty > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ffcb6b' }} />
              <span style={{ color: '#ffcb6b' }}>{dirty}</span>
            </span>
          )}
        </span>
      )}

      {/* spacer */}
      <span style={{ flex: 1 }} />

      {/* mode chips */}
      {broadcastMode && <span style={{ ...segR, color: '#ff5370', fontWeight: 800, letterSpacing: 0.4 }}>BROADCAST</span>}
      {gridMode && <span style={{ ...segR, color: accent, fontWeight: 800, letterSpacing: 0.4 }}>GRID</span>}

      {/* shell */}
      {shell && view !== 'home' && (
        <span style={segR}>
          <Icon name="terminal" size={12} color="var(--text-3)" />
          <span style={{ color: 'var(--text-2)' }}>{shell}</span>
        </span>
      )}

      {/* agent activity — click to open Mission Control */}
      {(() => {
        const s = agentSummary || {}
        const waiting = s.waiting || 0
        const working = s.working || 0
        const errored = s.error || 0
        if (!waiting && !working && !errored) return null
        const tone = waiting ? '#ffcb6b' : errored ? '#ff5370' : '#5fd3a8'
        const text = waiting ? `${waiting} need you` : errored ? `${errored} error${errored === 1 ? '' : 's'}` : `${working} working`
        return (
          <button
            className="sush-mc-btn"
            onClick={onOpenMission}
            title="Mission Control (Ctrl+Shift+M)"
            style={{ ...segR, color: tone, fontWeight: 800, background: 'transparent', cursor: 'pointer', border: 'none', borderLeft: `1px solid ${divider}`, fontSize: 11 }}
          >
            <span className={waiting || working ? 'sush-pulse-dot' : undefined} style={{ width: 6, height: 6, borderRadius: '50%', background: tone, '--pulse': rgba(tone, 0.6) }} />
            {text}
          </button>
        )
      })()}

      {/* workspaces · sessions */}
      <span style={segR}>
        {workspaceCount > 0 && (
          <>
            <span style={{ color: 'var(--text-2)', fontWeight: 700 }}>{workspaceCount}</span>
            <span>ws</span>
            <span style={{ color: '#3a434c' }}>·</span>
          </>
        )}
        <span style={{ color: 'var(--text-2)', fontWeight: 700 }}>{sessionCount}</span>
        <span>session{sessionCount === 1 ? '' : 's'}</span>
      </span>

      {/* cpu */}
      <span style={segR} title="CPU load">
        <Icon name="cpu" size={12} color="var(--text-3)" />
        <span style={{ color: usageColor(cpu), fontWeight: 700, minWidth: 30, textAlign: 'right' }}>
          {cpu == null ? '—' : `${cpu}%`}
        </span>
      </span>

      {/* mem */}
      <span style={segR} title="Memory used">
        <Icon name="activity" size={12} color="var(--text-3)" />
        <span style={{ color: usageColor(memPct), fontWeight: 700, minWidth: 30, textAlign: 'right' }}>
          {memPct == null ? '—' : `${memPct}%`}
        </span>
      </span>

      {/* power saver chip */}
      {saverActive && (
        <span style={{ ...segR, color: '#5fd3a8', fontWeight: 800, letterSpacing: 0.3 }} title={saverAuto ? 'Power saver on automatically — battery low. Ctrl+Shift+E to override.' : 'Power saver on — animations & effects trimmed. Ctrl+Shift+E to toggle.'}>
          <Icon name="leaf" size={12} color="#5fd3a8" />
          SAVER
        </span>
      )}

      {/* battery */}
      {battery?.hasBattery && (
        <span style={segR} title={battery.charging ? `Battery ${battery.percent}% — charging` : `Battery ${battery.percent}%`}>
          <Icon name="battery" size={13} color={battery.charging ? '#5fd3a8' : battery.percent <= 15 ? '#ff5370' : battery.percent <= 30 ? '#ffcb6b' : 'var(--text-3)'} />
          <span style={{ color: battery.charging ? 'var(--text-2)' : battery.percent <= 15 ? '#ff5370' : battery.percent <= 30 ? '#ffcb6b' : 'var(--text-2)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {battery.percent}%{battery.charging ? '⁺' : ''}
          </span>
        </span>
      )}

      {/* clock */}
      <span style={{ ...segR, paddingRight: 12, color: 'var(--text-2)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} title={clock.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}>
        {clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  )
}
