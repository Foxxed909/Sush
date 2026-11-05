import React, { useMemo } from 'react'
import StatusIcon, { toneForState } from './StatusIcon'
import Icon from './Icons'
import { STATES } from '../lib/agentActivity'
import { agentById } from '../lib/agents'
import { rgba } from '../lib/ui'
import ProviderLogo from './ProviderLogo'
import { pickerModelLabel } from '../lib/nightlyModels'
import { groupByWorkspace } from '../lib/workspaces'

function memLabel(mb) {
  const n = Number(mb) || 0
  return n >= 1024 ? `${(n / 1024).toFixed(1)} GB` : `${Math.round(n)} MB`
}

// Agents board: every session sorted into what it needs from you. Columns
// are fixed (Needs you · Working · Idle) so a card only moves when its state
// does. Whole cards open the session; limited ones offer a hand-off inline.
const COLUMNS = [
  { id: 'needs', label: 'Needs you', empty: 'Nothing waiting on you.' },
  { id: 'working', label: 'Working', empty: 'No agent is busy right now.' },
  { id: 'idle', label: 'Idle', empty: 'Idle sessions land here.' }
]

function relTime(at) {
  const t = Number(at)
  if (!Number.isFinite(t) || t <= 0) return ''
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

function columnFor(stateId, limited) {
  if (limited || stateId === 'waiting' || stateId === 'error') return 'needs'
  if (stateId === 'working' || stateId === 'booting') return 'working'
  return 'idle'
}

function AgentCard({ tab, stateId, limited, metric, project, accent, onFocus, onHandoff }) {
  const agent = agentById(tab.agentId) || agentById('shell')
  const state = STATES[stateId] || STATES.idle
  const color = agent?.color || accent
  const tone = limited ? 'limit' : stateId
  const statusLabel = limited ? 'Usage limit' : stateId === 'waiting' ? 'Needs input' : stateId === 'error' ? 'Stopped' : state.label
  return (
    <article
      style={{ '--agent': color }}
      className={`ag-card is-${tone}`}
      role="button"
      tabIndex={0}
      onClick={() => onFocus?.(tab.id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFocus?.(tab.id) } }}
      aria-label={`${tab.label}, ${statusLabel}. Open session`}
    >
      <header className="ag-card-head">
        <span className="ag-avatar">
          <span className="ag-mark" style={{ color, background: rgba(color, 0.14), boxShadow: `inset 0 0 0 1px ${rgba(color, 0.3)}` }}>
            <ProviderLogo provider={tab.agentId} size={16} title={agent?.label} />
          </span>
        </span>
        <span className="ag-title">
          <strong>{tab.label}</strong>
          <small>{project}</small>
        </span>
        <Icon name="arrowRight" size={13} className="ag-open" />
      </header>
      <div className="ag-status">
        <StatusIcon tone={tone === 'limit' ? 'warning' : toneForState(tone)} size={13} />
        <span>{statusLabel}</span>
        <span className="ag-flex" />
        <span className="ag-time">{relTime(tab.lastActiveAt)}</span>
      </div>
      <footer className="ag-meta">
        <span className="ag-chip">{agent?.label || 'Terminal'}</span>
        {tab.model && <span className="ag-chip">{pickerModelLabel(tab.agentId, tab.model)}</span>}
        {tab.effort && <span className="ag-chip">{tab.effort}</span>}
        {metric && (
          <span className="ag-chip is-mono" title="CPU · memory">
            {Math.max(0, Math.round(metric.cpu || 0))}% · {memLabel(metric.memRss)}
          </span>
        )}
      </footer>
      {limited && onHandoff && (
        <button type="button" className="ag-action" onClick={e => { e.stopPropagation(); onHandoff(tab.id) }}>
          <Icon name="send" size={12} /> Hand off to another account
        </button>
      )}
      <div className="ag-quick" aria-hidden={false}>
        <button type="button" onClick={e => { e.stopPropagation(); onFocus?.(tab.id) }}><Icon name="arrowRight" size={12} /> Open</button>
        {onHandoff && tab.agentId && tab.agentId !== 'shell' && !limited && (
          <button type="button" onClick={e => { e.stopPropagation(); onHandoff(tab.id) }}><Icon name="send" size={12} /> Hand off</button>
        )}
      </div>
      {tone === 'working' && <span className="ag-shimmer" aria-hidden />}
    </article>
  )
}

// Crew pulse: a donut of the crew by state. The working arc carries a slow
// orbiting light (a rotated group: compositor-only).
function CrewPulse({ counts, total }) {
  const R = 46, C = 2 * Math.PI * R
  const order = [['waiting', '#ffcb6b'], ['working', 'var(--accent)'], ['idle', '#8f8396'], ['done', '#5fd3a8']]
  let offset = 0
  const arcs = order.map(([k, colour]) => {
    const n = counts[k] || 0
    const len = total ? (n / total) * C : 0
    const gap = n && total > 1 ? 3 : 0
    const arc = { k, colour, dash: `${Math.max(0, len - gap)} ${C}`, offset: -offset }
    offset += len
    return arc
  }).filter(a => counts[a.k])
  return (
    <div className={`ag-pulse${counts.working ? ' is-live' : ''}`} aria-label={`${total} agents`}>
      <svg viewBox="0 0 120 120" width="132" height="132" aria-hidden>
        <circle cx="60" cy="60" r={R} className="ag-pulse-track" />
        {arcs.map(a => (
          <circle key={a.k} cx="60" cy="60" r={R} className={`ag-pulse-arc is-${a.k}`} style={{ stroke: a.colour, strokeDasharray: a.dash, strokeDashoffset: a.offset }} />
        ))}
        <g className="ag-pulse-orbit"><circle cx="60" cy="14" r="3.2" /></g>
      </svg>
      <div className="ag-pulse-centre">
        <strong>{total}</strong>
        <small>{total === 1 ? 'agent' : 'agents'}</small>
      </div>
    </div>
  )
}

export default function NightlyOverview({
  tabs = [],
  states = {},
  limits = {},
  metrics = {},
  summary = {},
  accent,
  onFocus,
  onHandoff,
  onNewSession,
  terminalSessions = []
}) {
  const workspaces = useMemo(() => groupByWorkspace(tabs), [tabs])
  const projectOf = useMemo(() => {
    const map = {}
    for (const w of workspaces) for (const t of w.tabs) map[t.id] = w.label
    return map
  }, [workspaces])
  const columns = useMemo(() => {
    const out = { needs: [], working: [], idle: [] }
    for (const tab of tabs) {
      const stateId = tab.status === 'exited' ? 'error' : (states[tab.id] || 'idle')
      out[columnFor(stateId, !!limits[tab.id])].push({ tab, stateId })
    }
    const byStart = (a, b) => (Number(b.tab.startedAt) || 0) - (Number(a.tab.startedAt) || 0)
    Object.values(out).forEach(list => list.sort(byStart))
    return out
  }, [tabs, states, limits])

  return (
    <div className="nightly-overview ag-board sush-scroll">
      <div className="ag-inner">
        <div className="ag-hero">
          <CrewPulse
            total={tabs.length + terminalSessions.length}
            counts={{
              waiting: columns.needs.length + terminalSessions.filter(t => t.state === 'waiting').length,
              working: columns.working.length + terminalSessions.filter(t => t.state === 'working').length,
              idle: columns.idle.length + terminalSessions.filter(t => t.state === 'idle' || t.state === 'running').length,
              done: terminalSessions.filter(t => t.state === 'done').length
            }}
          />
          <div className="ag-hero-copy">
            <h1>Agents</h1>
            <p>
              {tabs.length} session{tabs.length === 1 ? '' : 's'} in {workspaces.length} project{workspaces.length === 1 ? '' : 's'}
              {terminalSessions.length > 0 && <> · {terminalSessions.length} in your terminal</>}
            </p>
            <div className="ag-stats">
              {[
                ['needs', 'Needs you', columns.needs.length],
                ['working', 'Working', columns.working.length],
                ['idle', 'Idle', columns.idle.length]
              ].map(([k, label, n]) => (
                <span key={k} className={`ag-stat is-${k}${n ? ' has' : ''}`}>
                  <StatusIcon tone={{ needs: 'attention', working: 'working', idle: 'idle' }[k]} size={14} /> <b>{n}</b> {label}
                </span>
              ))}
            </div>
          </div>
          <button type="button" className="ag-new" onClick={onNewSession}><Icon name="plus" size={14} /> New session</button>
        </div>

        {terminalSessions.length > 0 && (
          <section className="ag-term" aria-label="In your terminal">
            <header className="ag-col-head">
              <Icon name="terminal" size={13} />
              <span>In your terminal</span>
              <span className="ag-col-count">{terminalSessions.length}</span>
              <span className="ag-term-hint">from Sush Terminal · <code>sush board</code></span>
            </header>
            <div className="ag-term-list">
              {terminalSessions.map(s => {
                const a = agentById(s.agent)
                const tone = s.state === 'waiting' ? 'waiting' : s.state === 'working' ? 'working' : s.state === 'done' ? 'done' : 'idle'
                const label = { waiting: 'Needs you', working: 'Working', done: 'Done', idle: s.state === 'running' ? 'Running' : 'Idle' }[tone]
                return (
                  <div key={s.id} className={`ag-term-row is-${tone}`}>
                    <span className="ag-mark" style={{ color: a?.color || accent, background: rgba(a?.color || accent, 0.12) }}>
                      <ProviderLogo provider={s.agent} size={14} title={a?.label} />
                    </span>
                    <span className="ag-title">
                      <strong>{s.label}</strong>
                      <small>{[s.model ? pickerModelLabel(s.agent, s.model) : null, s.cwd?.split(/[\\/]/).pop()].filter(Boolean).join(' · ')}</small>
                    </span>
                    <span className="ag-status"><StatusIcon tone={toneForState(tone)} size={12} />{label}</span>
                    {s.last && <span className="ag-term-last" title={s.last}>{s.last}</span>}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {tabs.length > 0 ? (
          <div className="ag-columns">
            {COLUMNS.map(col => (
              <section key={col.id} className={`ag-col is-${col.id}`} aria-label={col.label}>
                <header className="ag-col-head">
                  <StatusIcon tone={{ needs: 'attention', working: 'working', idle: 'idle' }[col.id]} size={13} />
                  <span>{col.label}</span>
                  <span className="ag-col-count">{columns[col.id].length}</span>
                </header>
                <div className="ag-col-body">
                  {columns[col.id].map(({ tab, stateId }, i) => (
                    <div key={tab.id} className="ag-card-wrap" style={{ '--i': i }}>
                      <AgentCard
                        tab={tab}
                        stateId={stateId}
                        limited={!!limits[tab.id]}
                        metric={metrics[tab.id]}
                        project={projectOf[tab.id]}
                        accent={accent}
                        onFocus={onFocus}
                        onHandoff={onHandoff}
                      />
                    </div>
                  ))}
                  {!columns[col.id].length && (
                    <div className="ag-col-empty">
                      <Icon name={col.id === 'needs' ? 'check' : col.id === 'working' ? 'moon' : 'coffee'} size={16} />
                      <span>{col.empty}</span>
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="nightly-overview-empty ag-empty">
            <Icon name="layers" size={24} />
            <strong>No agents running</strong>
            <span>Open a project and launch Claude, Codex, Gemini or OpenCode.</span>
            <button type="button" className="ag-new" onClick={onNewSession}><Icon name="plus" size={14} /> New session</button>
          </div>
        )}
      </div>
    </div>
  )
}
