import React, { useMemo } from 'react'
import Icon from './Icons'
import { STATES } from '../lib/agentActivity'
import { agentById } from '../lib/agents'
import { rgba } from '../lib/ui'
import ProviderLogo from './ProviderLogo'
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
      className={`ag-card is-${tone}`}
      role="button"
      tabIndex={0}
      onClick={() => onFocus?.(tab.id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFocus?.(tab.id) } }}
      aria-label={`${tab.label}, ${statusLabel}. Open session`}
    >
      <header className="ag-card-head">
        <span className="ag-mark" style={{ color, background: rgba(color, 0.12), boxShadow: `inset 0 0 0 1px ${rgba(color, 0.25)}` }}>
          <ProviderLogo provider={tab.agentId} size={15} title={agent?.label} />
        </span>
        <span className="ag-title">
          <strong>{tab.label}</strong>
          <small>{project}</small>
        </span>
        <Icon name="arrowRight" size={13} className="ag-open" />
      </header>
      <div className="ag-status">
        <span className={`ag-dot is-${tone}`} aria-hidden />
        <span>{statusLabel}</span>
        <span className="ag-flex" />
        <span className="ag-time">{relTime(tab.lastActiveAt)}</span>
      </div>
      <footer className="ag-meta">
        <span className="ag-chip">{agent?.label || 'Terminal'}</span>
        {tab.model && <span className="ag-chip is-mono">{tab.model}</span>}
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
    </article>
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
  onNewSession
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
        <div className="ag-header">
          <div>
            <h1>Agents</h1>
            <p>
              {tabs.length} session{tabs.length === 1 ? '' : 's'} in {workspaces.length} project{workspaces.length === 1 ? '' : 's'}
              {columns.needs.length > 0 && <> · <span className="ag-needs-count">{columns.needs.length} need{columns.needs.length === 1 ? 's' : ''} you</span></>}
            </p>
          </div>
          <button type="button" className="ag-new" onClick={onNewSession}><Icon name="plus" size={14} /> New session</button>
        </div>

        {tabs.length > 0 ? (
          <div className="ag-columns">
            {COLUMNS.map(col => (
              <section key={col.id} className={`ag-col is-${col.id}`} aria-label={col.label}>
                <header className="ag-col-head">
                  <span className={`ag-col-dot is-${col.id}`} aria-hidden />
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
                  {!columns[col.id].length && <div className="ag-col-empty">{col.empty}</div>}
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
