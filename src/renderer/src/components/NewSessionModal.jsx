import React, { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icons'
import PathField from './PathField'
import { rgba, accentVars } from '../lib/ui'
import { allAgents, MAX_SESSIONS } from '../lib/agents'
import { useCliAvailability } from '../hooks/useCliAvailability'

function pathLabel(cwd) {
  if (!cwd) return ''
  const trimmed = String(cwd).replace(/[\\/]+$/, '')
  return trimmed.split(/[\\/]/).filter(Boolean).pop() || trimmed
}

export default function NewSessionModal({ accent, activeCwd, recentSessions = [], onLaunch, onClose }) {
  // Snapshot built-ins + the user's custom agents once per open.
  const [AGENT_LIST] = useState(() => allAgents())
  const [cwd, setCwd] = useState(activeCwd || '')
  const [cwdValid, setCwdValid] = useState(null)
  const [counts, setCounts] = useState({ shell: 1 })
  const [sessionName, setSessionName] = useState('')
  const { avail, rescan, checking } = useCliAvailability()

  // Fall back to the home directory if we don't have an active path yet.
  useEffect(() => {
    if (cwd) return
    let cancelled = false
    window.sush?.homeDir?.().then(dir => { if (!cancelled && dir) setCwd(dir) }).catch(() => {})
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const total = useMemo(() => Object.values(counts).reduce((sum, n) => sum + (n || 0), 0), [counts])
  const remaining = MAX_SESSIONS - total

  const dirChips = useMemo(() => {
    const seen = new Set()
    const list = []
    const push = (path) => {
      if (!path) return
      const key = String(path).toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      list.push({ path, label: pathLabel(path) })
    }
    push(activeCwd)
    recentSessions.forEach(item => push(item.cwd))
    return list.slice(0, 6)
  }, [activeCwd, recentSessions])

  const setCount = (id, value) => {
    setCounts(prev => {
      const next = Math.max(0, value)
      // Respect the swarm cap across all agents.
      const others = Object.entries(prev).reduce((sum, [key, n]) => key === id ? sum : sum + (n || 0), 0)
      const capped = Math.min(next, MAX_SESSIONS - others)
      return { ...prev, [id]: capped }
    })
  }

  const oneEach = () => setCounts(Object.fromEntries(
    AGENT_LIST.filter(a => avail[a.id] !== false).slice(0, MAX_SESSIONS).map(a => [a.id, 1])
  ))
  const clearAll = () => setCounts({})

  // cwdValid is null until the first existence check resolves; treat null as
  // "not yet known, allow" so the button isn't disabled on a freshly-prefilled
  // active cwd, but block an explicit "not found" (false).
  const canLaunch = total > 0 && !!cwd.trim() && cwdValid !== false

  const launch = () => {
    if (!canLaunch) return
    const agents = AGENT_LIST
      .filter(a => (counts[a.id] || 0) > 0)
      .map(a => ({ ...a, count: counts[a.id] }))
    onLaunch({ cwd: cwd.trim(), agents, groupLabel: sessionName.trim() || undefined })
  }

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); launch() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  return (
    <div
      className="fixed inset-0 flex items-center justify-center sush-backdrop"
      style={{ ...accentVars(accent), zIndex: 400, background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(3px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="sush-pop sush-scroll flex flex-col"
        style={{
          width: 'min(680px, 94vw)',
          maxHeight: '88vh',
          overflow: 'auto',
          background: `radial-gradient(900px 300px at 0% 0%, ${rgba(accent, 0.1)}, transparent 60%), #0c0f12`,
          border: `1px solid ${rgba(accent, 0.28)}`,
          borderRadius: 16,
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: '18px 22px', borderBottom: '1px solid #171c22' }}>
          <div className="flex items-center" style={{ gap: 12 }}>
            <span
              className="flex items-center justify-center"
              style={{ width: 38, height: 38, borderRadius: 11, background: rgba(accent, 0.14), border: `1px solid ${rgba(accent, 0.32)}`, color: accent }}
            >
              <Icon name="rocket" size={19} strokeWidth={2.1} />
            </span>
            <div>
              <input
                value={sessionName}
                onChange={e => setSessionName(e.target.value.slice(0, 40))}
                placeholder="New workspace"
                spellCheck={false}
                title="Name this workspace (optional)"
                style={{
                  fontSize: 16, fontWeight: 900, color: 'var(--text-1)', background: 'transparent',
                  border: 'none', borderBottom: `1px dashed ${sessionName ? rgba(accent, 0.5) : 'rgba(255,255,255,0.12)'}`,
                  outline: 'none', padding: '0 0 2px', width: 240, fontFamily: 'inherit'
                }}
              />
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>Pick a directory, then launch the crew - sessions live inside this workspace</div>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close"
            className="sush-icon-btn flex items-center justify-center"
            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #20272e', background: '#11151a', color: 'var(--text-3)', cursor: 'pointer' }}
          >
            <Icon name="x" size={15} />
          </button>
        </div>

        <div style={{ padding: 22 }}>
          {/* Directory */}
          <SectionLabel icon="folder" accent={accent}>Directory</SectionLabel>
          <div className="flex items-center" style={{ marginBottom: 12 }}>
            <PathField
              value={cwd}
              onChange={setCwd}
              onEnter={launch}
              onValidChange={setCwdValid}
              accent={accent}
              autoFocus
              placeholder="C:\path\to\project -- type to browse"
            />
          </div>
          {dirChips.length > 0 && (
            <div className="flex" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
              {dirChips.map(chip => {
                const selected = cwd.replace(/[\\/]+$/, '').toLowerCase() === chip.path.replace(/[\\/]+$/, '').toLowerCase()
                return (
                  <button
                    key={chip.path}
                    onClick={() => setCwd(chip.path)}
                    title={chip.path}
                    className="sush-icon-btn flex items-center"
                    style={{
                      gap: 6,
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: selected ? accent : 'var(--text-2)',
                      background: selected ? rgba(accent, 0.14) : '#11151a',
                      border: `1px solid ${selected ? rgba(accent, 0.45) : '#20272e'}`,
                      borderRadius: 999,
                      padding: '5px 11px',
                      cursor: 'pointer',
                      maxWidth: 220
                    }}
                  >
                    <Icon name="folder" size={12} color={selected ? accent : 'var(--text-3)'} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chip.label}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Agents and tools */}
          <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
            <SectionLabel icon="spark" accent={accent} flush>Agents & tools</SectionLabel>
            <div className="flex items-center" style={{ gap: 8 }}>
              <button onClick={oneEach} className="sush-mini-btn" style={miniBtn(accent)}>1× each</button>
              <button onClick={clearAll} className="sush-mini-btn" style={miniBtn(accent)}>Clear</button>
              <button onClick={rescan} title="Re-check which CLIs are installed" className="sush-mini-btn" style={{ ...miniBtn(accent), opacity: checking ? 0.5 : 1 }}>
                {checking ? 'Scanning...' : 'Re-scan'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 11 }}>
            {AGENT_LIST.map(agent => {
              const count = counts[agent.id] || 0
              const on = count > 0
              const locked = avail[agent.id] === false
              return (
                <div
                  key={agent.id}
                  onClick={() => { if (!locked) setCount(agent.id, on ? 0 : 1) }}
                  className="sush-row flex items-center"
                  title={locked ? `${agent.label} isn't on your PATH yet${agent.command ? ` — install its CLI (\`${agent.command}\`) to enable this tile` : ''}. This is not a plan limit.` : undefined}
                  style={{
                    gap: 12,
                    cursor: locked ? 'default' : 'pointer',
                    border: `1px solid ${on ? rgba(accent, 0.5) : '#1b2127'}`,
                    background: on ? rgba(accent, 0.07) : '#0f1318',
                    borderRadius: 12,
                    padding: '12px 13px',
                    opacity: locked ? 0.5 : 1,
                    filter: locked ? 'saturate(0.4)' : 'none'
                  }}
                >
                  <span
                    className="flex items-center justify-center"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      flexShrink: 0,
                      fontSize: agent.mono.length > 1 ? 12 : 15,
                      fontWeight: 900,
                      color: locked ? 'var(--text-4)' : agent.color,
                      background: rgba(locked ? 'var(--text-4)' : agent.color, 0.14),
                      border: `1px solid ${rgba(locked ? 'var(--text-4)' : agent.color, 0.4)}`
                    }}
                  >
                    {locked ? <Icon name="lock" size={15} strokeWidth={2.2} /> : agent.mono}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: 'var(--text-2)' }}>{agent.label}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 2, fontFamily: 'inherit' }}>
                      {locked ? 'Not installed' : agent.command ? `$ ${agent.command}` : agent.desc}
                    </span>
                  </span>
                  {locked ? (
                    <span title="Not a plan limit — the CLI just isn't installed" style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: 'var(--text-3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                      INSTALL
                    </span>
                  ) : (
                    <div className="flex items-center" style={{ gap: 4 }} onClick={(e) => e.stopPropagation()}>
                      <StepBtn icon="minus" disabled={count === 0} accent={accent} onClick={() => setCount(agent.id, count - 1)} />
                      <span style={{ width: 22, textAlign: 'center', fontSize: 14, fontWeight: 800, color: on ? accent : 'var(--text-4)' }}>{count}</span>
                      <StepBtn icon="plus" disabled={remaining <= 0} accent={accent} onClick={() => setCount(agent.id, count + 1)} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between"
          style={{ padding: '15px 22px', borderTop: '1px solid #171c22', position: 'sticky', bottom: 0, background: '#0c0f12' }}
        >
          <div className="flex items-center" style={{ gap: 8, color: 'var(--text-3)', fontSize: 12.5 }}>
            <span
              className="flex items-center justify-center"
              style={{ minWidth: 24, height: 24, padding: '0 7px', borderRadius: 7, background: rgba(accent, 0.16), color: accent, fontWeight: 900, fontSize: 13 }}
            >
              {total}
            </span>
            session{total === 1 ? '' : 's'} will open
            {remaining <= 4 && <span style={{ color: 'var(--text-3)', fontSize: 11 }}>· max {MAX_SESSIONS}</span>}
          </div>
          <div className="flex items-center" style={{ gap: 10 }}>
            <button
              onClick={onClose}
              className="sush-btn"
              style={{ height: 38, padding: '0 16px', border: '1px solid #262d35', borderRadius: 10, background: '#161b21', color: 'var(--text-2)', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={launch}
              disabled={!canLaunch}
              className="sush-btn flex items-center"
              style={{
                gap: 8,
                height: 38,
                padding: '0 18px',
                border: 'none',
                borderRadius: 10,
                background: canLaunch ? accent : '#1c2126',
                color: canLaunch ? '#0a0a0a' : 'var(--text-4)',
                fontWeight: 800,
                fontSize: 12.5,
                cursor: canLaunch ? 'pointer' : 'default',
                boxShadow: canLaunch ? `0 8px 22px ${rgba(accent, 0.35)}` : 'none'
              }}
            >
              <Icon name="rocket" size={15} strokeWidth={2.1} color={canLaunch ? '#0a0a0a' : 'var(--text-4)'} />
              Launch
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ icon, children, accent, flush }) {
  return (
    <div className="flex items-center" style={{ gap: 8, marginBottom: flush ? 0 : 12 }}>
      {icon && <Icon name={icon} size={13} color={accent} strokeWidth={2.4} />}
      <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase' }}>{children}</span>
    </div>
  )
}

function StepBtn({ icon, onClick, disabled, accent }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center"
      style={{
        width: 26,
        height: 26,
        borderRadius: 7,
        border: `1px solid ${disabled ? '#1b2127' : rgba(accent, 0.35)}`,
        background: disabled ? '#0d1115' : '#141a20',
        color: disabled ? '#3a434c' : 'var(--text-2)',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background .12s, border-color .12s'
      }}
    >
      <Icon name={icon} size={14} strokeWidth={2.4} />
    </button>
  )
}

const miniBtn = (accent) => ({
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--text-2)',
  background: '#11151a',
  border: `1px solid ${rgba(accent, 0.2)}`,
  borderRadius: 8,
  padding: '4px 10px',
  cursor: 'pointer'
})
