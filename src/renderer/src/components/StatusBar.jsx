import React, { useState, useEffect } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

// A persistent bottom status strip: cwd · git branch (+ dirty count) · shell ·
// live cpu/mem. Reuses the existing gitStatus + getSystemStats IPC. Polls on a
// gentle 4s cadence; git is re-read whenever the active cwd changes too.
export default function StatusBar({ accent, activeTab, view, sessionCount, broadcastMode, splitMode }) {
  const cwd = activeTab?.cwd || null
  const shell = activeTab?.shellLabel || activeTab?.shell || null
  const [git, setGit] = useState(null)
  const [stats, setStats] = useState(null)

  // Git status follows the active directory.
  useEffect(() => {
    let cancelled = false
    if (!cwd) { setGit(null); return }
    window.sush.gitStatus({ cwd })
      .then(g => { if (!cancelled) setGit(g?.repo ? g : null) })
      .catch(() => { if (!cancelled) setGit(null) })
    return () => { cancelled = true }
  }, [cwd])

  // System stats + a periodic git refresh (to catch dirty-count changes).
  useEffect(() => {
    let alive = true
    const poll = () => {
      window.sush.getSystemStats()
        .then(s => { if (alive && s && !s.error) setStats(s) })
        .catch(() => {})
      if (cwd) {
        window.sush.gitStatus({ cwd })
          .then(g => { if (alive) setGit(g?.repo ? g : null) })
          .catch(() => {})
      }
    }
    poll()
    const id = setInterval(poll, 4000)
    return () => { alive = false; clearInterval(id) }
  }, [cwd])

  const cpu = stats ? Math.round(stats.cpu?.load ?? 0) : null
  const memPct = stats?.memory?.total
    ? Math.round((stats.memory.used / stats.memory.total) * 100)
    : null
  const dirty = git?.files?.length ?? 0

  const seg = { display: 'flex', alignItems: 'center', gap: 5, padding: '0 10px', height: '100%', borderRight: '1px solid #161b21' }
  const segR = { ...seg, borderRight: 'none', borderLeft: '1px solid #161b21' }
  const dim = '#7a838b'

  const usageColor = (v) => v == null ? dim : v >= 85 ? '#ff5370' : v >= 60 ? '#ffcb6b' : '#8a939c'

  return (
    <div
      data-glass
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 24,
        flexShrink: 0,
        background: '#0a0d11',
        borderTop: `1px solid ${rgba(accent, 0.18)}`,
        fontSize: 11,
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

      {/* git */}
      {git && (
        <span style={seg}>
          <Icon name="gitBranch" size={12} color={dirty ? '#ffcb6b' : '#8a939c'} />
          <span style={{ color: '#c6cdd4', fontWeight: 700 }}>{git.branch}</span>
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
      {splitMode && <span style={{ ...segR, color: accent, fontWeight: 800, letterSpacing: 0.4 }}>SPLIT</span>}

      {/* shell */}
      {shell && view !== 'home' && (
        <span style={segR}>
          <Icon name="terminal" size={12} color="#8a939c" />
          <span style={{ color: '#c6cdd4' }}>{shell}</span>
        </span>
      )}

      {/* sessions */}
      <span style={segR}>
        <span style={{ color: '#c6cdd4', fontWeight: 700 }}>{sessionCount}</span>
        <span>session{sessionCount === 1 ? '' : 's'}</span>
      </span>

      {/* cpu */}
      <span style={segR} title="CPU load">
        <Icon name="cpu" size={12} color="#8a939c" />
        <span style={{ color: usageColor(cpu), fontWeight: 700, minWidth: 30, textAlign: 'right' }}>
          {cpu == null ? '—' : `${cpu}%`}
        </span>
      </span>

      {/* mem */}
      <span style={{ ...segR, paddingRight: 12 }} title="Memory used">
        <Icon name="activity" size={12} color="#8a939c" />
        <span style={{ color: usageColor(memPct), fontWeight: 700, minWidth: 30, textAlign: 'right' }}>
          {memPct == null ? '—' : `${memPct}%`}
        </span>
      </span>
    </div>
  )
}
