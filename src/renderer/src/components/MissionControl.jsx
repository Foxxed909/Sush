import React, { useEffect, useMemo, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'
import { STATES } from '../lib/agentActivity'
import { agentById } from '../lib/agents'

// Mission Control — a live board of every session, grouped by workspace (swarm),
// each showing its inferred state (working / needs-you / idle / error / done).
// Read-only over the session list; all actions route back through the same App
// handlers the rest of the shell uses (focus, close, prompt).

const STATE_ORDER = ['waiting', 'error', 'working', 'booting', 'idle', 'done']

function StatePill({ stateId }) {
  const s = STATES[stateId] || STATES.idle
  const pulse = stateId === 'working' || stateId === 'waiting'
  return (
    <span className="flex items-center" style={{ gap: 6, flexShrink: 0 }}>
      <span
        className={pulse ? 'sush-pulse-dot' : undefined}
        style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, '--pulse': rgba(s.color, 0.6) }}
      />
      <span style={{ fontSize: 11, fontWeight: 800, color: s.color, letterSpacing: 0.2 }}>{s.label}</span>
    </span>
  )
}

function fmtMem(mb) {
  const n = Number(mb) || 0
  if (n >= 1024) return `${(n / 1024).toFixed(1)}GB`
  return `${Math.round(n)}MB`
}

function ResourcePill({ metric }) {
  if (!metric) return null
  const cpu = Math.max(0, Math.round(metric.cpu || 0))
  const mem = metric.memRss || 0
  return (
    <span className="flex items-center" style={{ gap: 6, flexShrink: 0, color: 'var(--text-3)', fontSize: 10.5, fontWeight: 800 }}>
      <Icon name="cpu" size={12} strokeWidth={2} />
      <span style={{ color: cpu >= 70 ? '#ffcb6b' : 'var(--text-3)' }}>{cpu}%</span>
      <span style={{ color: 'var(--text-5)' }}>/</span>
      <span>{fmtMem(mem)}</span>
    </span>
  )
}

function SessionRow({ tab, stateId, limited, canSwitch, accent, metric, onFocus, onClose, onPrompt, onSwitchResume, onLimitHandoff }) {
  const agent = agentById(tab.agentId) || agentById('shell')
  const waiting = stateId === 'waiting'
  const LIMIT = '#ff9f43'
  return (
    <div
      className="flex items-center sush-mc-row"
      style={{ gap: 10, padding: '8px 12px', borderRadius: 'var(--r-md, 10px)', border: `1px solid ${limited ? rgba(LIMIT, 0.35) : rgba(accent, 0.08)}` }}
    >
      {/* Agent monogram */}
      <span style={{
        width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 900, color: agent?.color || 'var(--text-3)',
        background: rgba(agent?.color || 'var(--text-3)', 0.12), border: `1px solid ${rgba(agent?.color || 'var(--text-3)', 0.3)}`
      }}>
        {agent?.mono || '>_'}
      </span>

      {/* Label + cwd */}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tab.label}
        </span>
        <span style={{ display: 'block', fontSize: 11, color: '#6b7787', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tab.cwd || tab.profileLabel || tab.shell}
        </span>
      </span>

      {limited ? (
        <span className="flex items-center" style={{ gap: 6, flexShrink: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: LIMIT }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: LIMIT, letterSpacing: 0.2 }}>Limit reached</span>
        </span>
      ) : (
        <StatePill stateId={stateId} />
      )}

      <ResourcePill metric={metric} />

      {/* Limit hit + another account exists → switch & resume in one click. */}
      {limited && canSwitch && (
        <button className="sush-mc-btn" title="Switch to your other account for this CLI and resume the conversation here"
          onClick={() => onSwitchResume(tab.id)}
          style={{ fontSize: 11, fontWeight: 800, color: LIMIT, background: rgba(LIMIT, 0.12), border: `1px solid ${rgba(LIMIT, 0.4)}`, borderRadius: 6, padding: '3px 9px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
          Switch &amp; resume
        </button>
      )}

      {/* Limit hit → continue the task on ANOTHER model: summary + fresh agent. */}
      {limited && onLimitHandoff && (
        <button className="sush-mc-btn" title="Summarize this session and continue the task with another model (Codex/Gemini)"
          onClick={() => onLimitHandoff(tab.id)}
          style={{ fontSize: 11, fontWeight: 800, color: '#82aaff', background: rgba('#82aaff', 0.12), border: `1px solid ${rgba('#82aaff', 0.4)}`, borderRadius: 6, padding: '3px 9px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
          Hand off →
        </button>
      )}

      {/* Quick answers for agents blocked on a prompt */}
      {waiting && (
        <span className="flex items-center" style={{ gap: 4, flexShrink: 0 }}>
          <button className="sush-mc-btn" title="Send y + Enter" onClick={() => onPrompt(tab.id, 'y\r')}
            style={{ fontSize: 11, fontWeight: 800, color: STATES.waiting.color, background: rgba(STATES.waiting.color, 0.12), border: `1px solid ${rgba(STATES.waiting.color, 0.35)}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
            y ↵
          </button>
          <button className="sush-mc-btn" title="Send Enter" onClick={() => onPrompt(tab.id, '\r')}
            style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', background: rgba('var(--text-3)', 0.1), border: `1px solid ${rgba('var(--text-3)', 0.25)}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
            ↵
          </button>
        </span>
      )}

      {/* Focus + close */}
      <button className="sush-mc-btn" title="Focus session" onClick={() => onFocus(tab.id)}
        style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-3)', background: 'transparent', border: `1px solid ${rgba(accent, 0.12)}`, borderRadius: 7, cursor: 'pointer' }}>
        <Icon name="eye" size={14} strokeWidth={2} />
      </button>
      <button className="sush-mc-btn" title="Close session" onClick={() => onClose(tab.id)}
        style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#7a8492', background: 'transparent', border: `1px solid ${rgba(accent, 0.12)}`, borderRadius: 7, cursor: 'pointer' }}>
        <Icon name="x" size={14} strokeWidth={2} />
      </button>
    </div>
  )
}

export default function MissionControl({ accent, tabs, states, limits = {}, summary, metrics = {}, onFocus, onClose, onCloseGroup, onPrompt, onSwitchResume, onLimitHandoff, onDismiss }) {
  // Which CLIs have a second account to switch to — so the "Switch & resume"
  // action only appears when it can actually do something. Fetched once on open.
  const [altProviders, setAltProviders] = useState(() => new Set())
  const [promptingGroup, setPromptingGroup] = useState(null)
  const [groupPrompt, setGroupPrompt] = useState('')
  useEffect(() => {
    let live = true
    window.sush.accountsList?.().then(r => {
      if (!live || !r?.ok) return
      const set = new Set()
      for (const [p, st] of Object.entries(r.providers || {})) {
        if ((st.slots?.length || 0) >= 2) set.add(p)
      }
      setAltProviders(set)
    }).catch(() => {})
    return () => { live = false }
  }, [])

  // Group sessions by workspace; solo sessions collect under one bucket.
  const groups = useMemo(() => {
    const byId = new Map()
    const solo = []
    for (const tab of tabs) {
      if (tab.groupId) {
        if (!byId.has(tab.groupId)) byId.set(tab.groupId, { id: tab.groupId, label: tab.groupLabel || 'Workspace', tabs: [] })
        byId.get(tab.groupId).tabs.push(tab)
      } else {
        solo.push(tab)
      }
    }
    const order = (t) => STATE_ORDER.indexOf(states[t.id] || 'idle')
    const sortTabs = (arr) => [...arr].sort((a, b) => order(a) - order(b))
    const list = [...byId.values()].map(g => ({ ...g, tabs: sortTabs(g.tabs) }))
    if (solo.length) list.push({ id: null, label: 'Solo sessions', tabs: sortTabs(solo) })
    return list
  }, [tabs, states])

  const chips = [
    { id: 'waiting', n: summary.waiting },
    { id: 'working', n: summary.working },
    { id: 'error', n: summary.error },
    { id: 'idle', n: summary.idle + summary.booting },
    { id: 'done', n: summary.done }
  ].filter(c => c.n > 0)

  const sendGroupPrompt = (group) => {
    const text = groupPrompt.trim()
    if (!text) return
    group.tabs
      .filter(tab => tab.status !== 'exited')
      .forEach(tab => onPrompt?.(tab.id, `${text}\r`))
    setGroupPrompt('')
    setPromptingGroup(null)
  }

  return (
    <div
      className="sush-backdrop"
      style={{ position: 'fixed', inset: 0, zIndex: 480, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(5px)', paddingTop: '9vh' }}
      onClick={e => { if (e.target === e.currentTarget) onDismiss() }}
    >
      <div
        className="sush-pop sush-scroll"
        style={{ width: '100%', maxWidth: 720, maxHeight: '78vh', overflowY: 'auto', background: rgba('#0b0e13', 0.94), border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 'var(--r-xl, 16px)', boxShadow: `0 28px 70px rgba(0,0,0,0.7), 0 0 0 1px ${rgba(accent, 0.08)}` }}
      >
        {/* Header */}
        <div className="flex items-center" style={{ gap: 12, padding: '14px 18px', borderBottom: `1px solid ${rgba(accent, 0.12)}`, position: 'sticky', top: 0, background: rgba('#0b0e13', 0.96), backdropFilter: 'blur(8px)', zIndex: 2 }}>
          <Icon name="activity" size={17} color={accent} strokeWidth={2.2} />
          <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-1)', letterSpacing: 0.2 }}>Mission Control</span>
          <span style={{ fontSize: 11, color: '#6b7787', fontWeight: 700 }}>{tabs.length} session{tabs.length === 1 ? '' : 's'}</span>
          <span className="flex items-center" style={{ gap: 8, marginLeft: 'auto' }}>
            {chips.map(c => {
              const s = STATES[c.id]
              return (
                <span key={c.id} className="flex items-center" style={{ gap: 5, fontSize: 11, fontWeight: 800, color: s.color }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
                  {c.n} {s.label}
                </span>
              )
            })}
            <button title="Close (Esc)" onClick={onDismiss}
              style={{ marginLeft: 6, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7a8492', background: 'transparent', border: `1px solid ${rgba(accent, 0.14)}`, borderRadius: 7, cursor: 'pointer' }}>
              <Icon name="x" size={14} strokeWidth={2} />
            </button>
          </span>
        </div>

        {/* Groups */}
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tabs.length === 0 && (
            <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
              No active sessions. Launch a swarm to see it light up here.
            </div>
          )}
          {groups.map(group => (
            <div key={group.id || 'solo'}>
              <div className="flex items-center" style={{ gap: 8, padding: '0 4px 8px', flexWrap: 'wrap' }}>
                <Icon name={group.id ? 'layers' : 'terminal'} size={13} color={rgba(accent, 0.8)} strokeWidth={2} />
                <span style={{ fontSize: 12, fontWeight: 800, color: '#aeb8c4', textTransform: 'uppercase', letterSpacing: 0.6 }}>{group.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-4)', fontWeight: 700 }}>{group.tabs.length}</span>
                {promptingGroup === (group.id || 'solo') ? (
                  <span className="flex items-center" style={{ gap: 6, marginLeft: 'auto' }}>
                    <input
                      value={groupPrompt}
                      onChange={e => setGroupPrompt(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendGroupPrompt(group) } }}
                      autoFocus
                      placeholder="Prompt this workspace"
                      style={{
                        width: 'min(220px, 44vw)',
                        height: 26,
                        borderRadius: 7,
                        border: `1px solid ${rgba(accent, 0.2)}`,
                        background: '#0f1318',
                        color: 'var(--text-1)',
                        outline: 'none',
                        padding: '0 8px',
                        fontSize: 11.5,
                        fontFamily: 'inherit'
                      }}
                    />
                    <button title="Send to all live sessions" onClick={() => sendGroupPrompt(group)}
                      style={{ fontSize: 11, fontWeight: 800, color: accent, background: rgba(accent, 0.12), border: `1px solid ${rgba(accent, 0.32)}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                      Send
                    </button>
                    <button title="Cancel" onClick={() => { setPromptingGroup(null); setGroupPrompt('') }}
                      style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7a8492', background: 'transparent', border: `1px solid ${rgba(accent, 0.12)}`, borderRadius: 6, cursor: 'pointer' }}>
                      <Icon name="x" size={12} strokeWidth={2} />
                    </button>
                  </span>
                ) : (
                  <button title="Prompt all live sessions in this group" onClick={() => setPromptingGroup(group.id || 'solo')}
                    style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: accent, background: rgba(accent, 0.08), border: `1px solid ${rgba(accent, 0.18)}`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
                    Prompt all
                  </button>
                )}
                {group.id && (
                  <button title="Close workspace" onClick={() => onCloseGroup(group.id)}
                    style={{ fontSize: 11, fontWeight: 700, color: '#7a8492', background: 'transparent', border: `1px solid ${rgba(accent, 0.12)}`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
                    Close all
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.tabs.map(tab => (
                  <SessionRow
                    key={tab.id}
                    tab={tab}
                    stateId={states[tab.id] || 'idle'}
                    limited={!!limits[tab.id]}
                    canSwitch={altProviders.has(tab.agentId)}
                    metric={metrics[tab.id]}
                    accent={accent}
                    onFocus={onFocus}
                    onClose={onClose}
                    onPrompt={onPrompt}
                    onSwitchResume={onSwitchResume}
                    onLimitHandoff={onLimitHandoff}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
