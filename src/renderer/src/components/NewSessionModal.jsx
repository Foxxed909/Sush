import React, { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icons'
import PathField from './PathField'
import { rgba, accentVars } from '../lib/ui'
import { allAgents, MAX_SESSIONS } from '../lib/agents'
import { useCliAvailability } from '../hooks/useCliAvailability'
import { useEntitlements } from '../hooks/useEntitlements'
import { loadCrews, saveCrew, deleteCrew, parseRepoCrew } from '../lib/crews'
import NightlyModelLaunchSettings from './NightlyModelLaunchSettings'
import { setProviderCapabilities } from '../lib/nightlyModels'

function pathLabel(cwd) {
  if (!cwd) return ''
  const trimmed = String(cwd).replace(/[\\/]+$/, '')
  return trimmed.split(/[\\/]/).filter(Boolean).pop() || trimmed
}

const PRESETS = [
  { label: 'Builder team', sub: 'Claude + Codex + Gemini', counts: { claude: 1, codex: 1, gemini: 1 } },
  { label: 'Review pair', sub: 'Claude + Codex', counts: { claude: 1, codex: 1 } },
  { label: 'Claude trio', sub: '3x Claude', counts: { claude: 3 } },
  { label: 'Codex trio', sub: '3x Codex', counts: { codex: 3 } },
  { label: 'Shell only', sub: 'Clean terminal', counts: { shell: 1 } }
]

const BRIEF_CHIPS = [
  { label: 'FIF', text: 'Find, identify, and fix the highest-impact bugs. Reproduce first, keep changes scoped, and report verification.' },
  { label: 'Review', text: 'Review this workspace for bugs, bloat, missing tests, and risky assumptions. Report findings before editing.' },
  { label: 'Tests', text: 'Run the smallest useful verification for this workspace, fix failures, then broaden checks if needed.' },
  { label: 'Plan', text: 'Inspect the workspace and propose the next concrete implementation step before making changes.' },
  { label: 'Ship', text: 'Prepare this workspace for shipping: fix blockers, verify the build, and summarize remaining risks.' }
]

export default function NewSessionModal({ accent, activeCwd, recentSessions = [], onLaunch, onClose }) {
  // Snapshot built-ins + the user's custom agents once per open.
  const [AGENT_LIST] = useState(() => allAgents())
  const [cwd, setCwd] = useState(activeCwd || '')
  const [cwdValid, setCwdValid] = useState(null)
  const [counts, setCounts] = useState({ shell: 1 })
  const [models, setModels] = useState({})
  const [efforts, setEfforts] = useState({})
  const [sessionName, setSessionName] = useState('')
  const [brief, setBrief] = useState('')
  const [worktrees, setWorktrees] = useState(false)
  const [crews, setCrews] = useState(() => loadCrews())
  const [repoCrew, setRepoCrew] = useState(null)   // .sush/crew.json in the chosen dir
  const { avail, rescan, checking } = useCliAvailability()
  const [capabilities, setCapabilities] = useState({})
  const [capChecking, setCapChecking] = useState(false)
  const [capError, setCapError] = useState('')
  const ent = useEntitlements()
  const developerWorkflows = ent.can('developerWorkflows')

  const loadCapabilities = async (refresh = false) => {
    setCapChecking(true)
    setCapError('')
    try {
      const result = await window.sush?.providerCapabilities?.({ refresh })
      if (!result?.ok) {
        setCapError(result?.error || 'Capability probe unavailable')
        return
      }
      const next = result.providers || {}
      setCapabilities(next)
      // Keep launcher/live-session validators and command construction on the
      // exact same capability snapshot the launcher is showing.
      setProviderCapabilities(next)
    } catch (error) {
      setCapError(error?.message || 'Capability probe unavailable')
    } finally {
      setCapChecking(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    window.sush?.providerCapabilities?.()
      .then(result => {
        if (cancelled || !result?.ok) return
        const next = result.providers || {}
        setCapabilities(next)
        setProviderCapabilities(next)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const unavailable = (id) => capabilities[id]?.installed === false || avail[id] === false
  const providerCapability = (id) => capabilities[id] || null
  const rescanProviders = async () => {
    await Promise.allSettled([rescan(), loadCapabilities(true)])
  }

  // If a saved crew references a CLI that is no longer installed, drop that
  // stale selection once availability is known. Otherwise an invisible missing
  // provider can consume the swarm cap even though launch() correctly skips it.
  useEffect(() => {
    setCounts(prev => {
      let changed = false
      const next = { ...prev }
      for (const [id, count] of Object.entries(next)) {
        if (count > 0 && unavailable(id)) {
          next[id] = 0
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [avail, capabilities])

  // Never carry an entitlement-only setting into a lower-tier launch.
  useEffect(() => {
    if (!developerWorkflows) setWorktrees(false)
  }, [developerWorkflows])

  // Repo crew preset: when the chosen directory ships a .sush/crew.json, offer
  // it as a first-class chip. Forward slashes are fine on Windows too — main
  // resolves the path. Debounced a touch so typing a path doesn't spam reads.
  useEffect(() => {
    const dir = cwd.trim().replace(/[\\/]+$/, '')
    if (!dir) { setRepoCrew(null); return }
    let cancelled = false
    const t = setTimeout(() => {
      window.sush?.readFile?.({ path: `${dir}/.sush/crew.json` })
        .then(r => { if (!cancelled) setRepoCrew(r?.ok ? parseRepoCrew(r.content) : null) })
        .catch(() => { if (!cancelled) setRepoCrew(null) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [cwd])

  const applyCrew = (crew) => {
    setCounts({ ...crew.counts })
    setModels({ ...(crew.models || {}) })
    setEfforts({ ...(crew.efforts || {}) })
    setBrief(crew.brief || '')
    if (crew.name) setSessionName(crew.name)
    if (crew.cwd) setCwd(crew.cwd)
  }
  const saveCurrentCrew = () => {
    const name = sessionName.trim() || pathLabel(cwd) || 'Crew'
    const safeCounts = Object.fromEntries(Object.entries(counts).filter(([id, count]) => count > 0 && !unavailable(id)))
    const r = saveCrew({ name, cwd: cwd.trim() || null, counts: safeCounts, models, efforts, brief: brief.trim() })
    if (r.ok) setCrews(r.crews)
  }
  const removeCrew = (id) => { const r = deleteCrew(id); setCrews(r.crews) }

  // Fall back to the home directory if we don't have an active path yet.
  useEffect(() => {
    if (cwd) return
    let cancelled = false
    window.sush?.homeDir?.().then(dir => { if (!cancelled && dir) setCwd(dir) }).catch(() => {})
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const total = useMemo(
    () => AGENT_LIST.reduce((sum, agent) => sum + (unavailable(agent.id) ? 0 : (counts[agent.id] || 0)), 0),
    [AGENT_LIST, counts, avail, capabilities]
  )
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
      const others = Object.entries(prev).reduce((sum, [key, n]) => key === id || unavailable(key) ? sum : sum + (n || 0), 0)
      const capped = Math.min(next, MAX_SESSIONS - others)
      return { ...prev, [id]: capped }
    })
  }

  const oneEach = () => setCounts(Object.fromEntries(
    AGENT_LIST.filter(a => !unavailable(a.id)).slice(0, MAX_SESSIONS).map(a => [a.id, 1])
  ))
  const clearAll = () => setCounts({})
  const applyPreset = (preset) => {
    const next = {}
    let used = 0
    for (const [id, count] of Object.entries(preset.counts)) {
      const agent = AGENT_LIST.find(a => a.id === id)
      if (!agent || unavailable(id) || used >= MAX_SESSIONS) continue
      const capped = Math.min(count, MAX_SESSIONS - used)
      if (capped > 0) {
        next[id] = capped
        used += capped
      }
    }
    if (used > 0) setCounts(next)
  }

  // cwdValid is null until the first existence check resolves; treat null as
  // "not yet known, allow" so the button isn't disabled on a freshly-prefilled
  // active cwd, but block an explicit "not found" (false).
  const canLaunch = total > 0 && !!cwd.trim() && cwdValid !== false

  const launch = () => {
    if (!canLaunch) return
    const agents = AGENT_LIST
      .filter(a => !unavailable(a.id) && (counts[a.id] || 0) > 0)
      .map(a => ({ ...a, count: counts[a.id], model: String(models[a.id] || '').trim() || null, effort: String(efforts[a.id] || '').trim() || null }))
    onLaunch({ cwd: cwd.trim(), agents, groupLabel: sessionName.trim() || undefined, prompt: brief.trim() || undefined, worktrees: developerWorkflows && worktrees })
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
              <button onClick={rescanProviders} title="Re-check installed CLIs and refresh provider capabilities" className="sush-mini-btn" style={{ ...miniBtn(accent), opacity: checking || capChecking ? 0.5 : 1 }}>
                {checking || capChecking ? 'Scanning...' : 'Re-scan'}
              </button>
            </div>
          </div>

          <div className="flex" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {repoCrew && (
              <button
                onClick={() => {
                  if (!developerWorkflows) return
                  setCounts({ ...repoCrew.counts })
                  setModels({ ...(repoCrew.models || {}) })
                  setEfforts({ ...(repoCrew.efforts || {}) })
                  if (repoCrew.brief) setBrief(repoCrew.brief)
                  if (repoCrew.name) setSessionName(repoCrew.name)
                }}
                disabled={!developerWorkflows}
                title={developerWorkflows
                  ? `This repo ships its own crew (.sush/crew.json)${repoCrew.brief ? ` — “${repoCrew.brief.slice(0, 80)}”` : ''}`
                  : 'Repo crews are available on Dev, Max, and Enterprise.'}
                className="sush-mini-btn"
                style={{
                  ...miniBtn(accent),
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: accent,
                  background: rgba(accent, 0.1),
                  border: `1px solid ${rgba(accent, 0.45)}`,
                  opacity: developerWorkflows ? 1 : 0.52,
                  cursor: developerWorkflows ? 'pointer' : 'not-allowed'
                }}
              >
                <Icon name={developerWorkflows ? 'rocket' : 'lock'} size={12} strokeWidth={2.3} color={accent} />
                {developerWorkflows ? `Repo crew: ${repoCrew.name}` : 'Repo crew · Dev'}
              </button>
            )}
            {PRESETS.map(preset => {
              const disabled = Object.entries(preset.counts).every(([id]) => unavailable(id) || !AGENT_LIST.some(a => a.id === id))
              return (
                <button
                  key={preset.label}
                  onClick={() => applyPreset(preset)}
                  disabled={disabled}
                  title={preset.sub}
                  className="sush-mini-btn"
                  style={{
                    ...miniBtn(accent),
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    opacity: disabled ? 0.45 : 1,
                    cursor: disabled ? 'default' : 'pointer'
                  }}
                >
                  <Icon name="layers" size={12} strokeWidth={2.3} color={disabled ? 'var(--text-4)' : accent} />
                  {preset.label}
                </button>
              )
            })}
          </div>

          {crews.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: 'var(--text-4)', textTransform: 'uppercase', marginBottom: 7 }}>Saved crews</div>
              <div className="flex" style={{ gap: 7, flexWrap: 'wrap' }}>
                {crews.map(crew => {
                  const n = Object.values(crew.counts).reduce((s, c) => s + c, 0)
                  return (
                    <span
                      key={crew.id}
                      className="flex items-center"
                      style={{ gap: 6, fontSize: 11, fontWeight: 800, color: 'var(--text-2)', background: '#11151a', border: `1px solid ${rgba(accent, 0.28)}`, borderRadius: 999, padding: '4px 6px 4px 11px' }}
                    >
                      <button onClick={() => applyCrew(crew)} title={[`${n} session${n === 1 ? '' : 's'}`, crew.cwd ? pathLabel(crew.cwd) : null, ...Object.keys(crew.counts).filter(id => crew.models?.[id]).map(id => `${id}: ${crew.models[id]}${crew.efforts?.[id] ? ` · ${crew.efforts[id]}` : ''}`)].filter(Boolean).join(' · ')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 800, fontSize: 11, padding: 0 }}>
                        <Icon name="layers" size={11} strokeWidth={2.3} color={accent} /> {crew.name} <span style={{ color: 'var(--text-4)' }}>· {n}</span>
                      </button>
                      <button onClick={() => removeCrew(crew.id)} title="Delete crew" style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 2px' }}>×</button>
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 11 }}>
            {AGENT_LIST.map(agent => {
              const count = counts[agent.id] || 0
              const on = count > 0
              const cap = providerCapability(agent.id)
              const locked = unavailable(agent.id)
              const capabilityBits = cap?.installed === true
                ? [
                    cap.version ? `v${cap.version}` : null,
                    cap.resume === true ? 'resume' : cap.resume === false ? 'no resume' : null,
                    cap.reasoning?.flag === true ? 'reasoning' : null
                  ].filter(Boolean)
                : []
              return (
                <div
                  key={agent.id}
                  onClick={() => { if (!locked) setCount(agent.id, on ? 0 : 1) }}
                  className="sush-row flex items-center"
                  title={locked ? `${agent.label} is not installed - install its CLI to launch it here` : undefined}
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
                    {agent.mono}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: 'var(--text-2)' }}>{agent.label}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 2, fontFamily: 'inherit' }}>
                      {locked ? 'Not installed' : agent.command ? `$ ${agent.command}` : agent.desc}
                    </span>
                    {!!capabilityBits.length && (
                      <span style={{ display: 'block', fontSize: 9.5, color: 'var(--text-4)', marginTop: 4, fontFamily: 'monospace' }}>
                        {capabilityBits.join(' · ')}
                      </span>
                    )}
                  </span>
                  {locked ? (
                    // "Not installed", not "LOCKED" — the lock vocabulary is
                    // reserved for tier-gated features (DESIGN.md); a missing
                    // CLI read as a paid add-on.
                    <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: 'var(--text-3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                      NOT INSTALLED
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

          {capError && (
            <div style={{ marginTop: 10, fontSize: 10.5, color: '#ff9aae' }}>
              Provider capability refresh failed: {capError}
            </div>
          )}

          <NightlyModelLaunchSettings
            agents={AGENT_LIST.filter(agent => !unavailable(agent.id))}
            counts={counts}
            models={models}
            efforts={efforts}
            accent={accent}
            onChange={(id, value) => setModels(prev => ({ ...prev, [id]: value }))}
            onEffortChange={(id, value) => setEfforts(prev => ({ ...prev, [id]: value }))}
          />

          <div style={{ marginTop: 22 }}>
            <SectionLabel icon="edit" accent={accent}>Brief</SectionLabel>
            <textarea
              value={brief}
              onChange={e => setBrief(e.target.value.slice(0, 800))}
              placeholder="Optional launch brief for every selected agent"
              spellCheck={false}
              rows={4}
              style={{
                width: '100%',
                resize: 'vertical',
                minHeight: 86,
                borderRadius: 10,
                border: `1px solid ${rgba(accent, 0.18)}`,
                background: '#0f1318',
                color: 'var(--text-1)',
                outline: 'none',
                padding: '10px 11px',
                fontSize: 12.5,
                lineHeight: 1.45,
                fontFamily: 'inherit'
              }}
            />
            <div className="flex" style={{ gap: 7, flexWrap: 'wrap', marginTop: 9 }}>
              {BRIEF_CHIPS.map(chip => (
                <button
                  key={chip.label}
                  onClick={() => setBrief(chip.text)}
                  className="sush-mini-btn"
                  style={miniBtn(accent)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Isolate each session in its own git worktree. No-op when the
              directory isn't a git repo (the launch falls back to the shared
              cwd), so it's safe to leave on. */}
          <div style={{ marginTop: 20 }}>
            <button
              onClick={() => { if (developerWorkflows) setWorktrees(v => !v) }}
              disabled={!developerWorkflows}
              title={developerWorkflows ? undefined : 'Isolated worktrees are available on Dev, Max, and Enterprise.'}
              className="flex items-center"
              style={{ gap: 10, width: '100%', textAlign: 'left', padding: '11px 13px', borderRadius: 10, cursor: developerWorkflows ? 'pointer' : 'not-allowed', opacity: developerWorkflows ? 1 : 0.58, background: worktrees ? rgba(accent, 0.08) : '#0f1318', border: `1px solid ${worktrees ? rgba(accent, 0.45) : '#1b2127'}` }}
            >
              <span className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: rgba(accent, worktrees ? 0.16 : 0.08), border: `1px solid ${rgba(accent, worktrees ? 0.45 : 0.2)}`, color: worktrees ? accent : 'var(--text-3)' }}>
                <Icon name={worktrees ? 'check' : 'grid'} size={15} strokeWidth={2.3} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: worktrees ? accent : 'var(--text-2)' }}>{developerWorkflows ? 'Isolate each session in its own git worktree' : 'Isolated git worktrees · Dev'}</span>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>{developerWorkflows ? <>Each agent gets a private checkout on a <code style={{ fontFamily: 'monospace' }}>sush/…</code> branch so parallel agents never trample each other. Ignored if the directory isn’t a git repo.</> : 'Available on Dev, Max, and Enterprise. Give every agent a private checkout when parallel work would collide.'}</span>
              </span>
            </button>
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
              onClick={saveCurrentCrew}
              disabled={total === 0}
              title="Save this agent mix as a reusable crew"
              className="sush-btn flex items-center"
              style={{ gap: 6, height: 38, padding: '0 14px', border: '1px solid #262d35', borderRadius: 10, background: '#161b21', color: total === 0 ? 'var(--text-4)' : 'var(--text-2)', fontWeight: 800, fontSize: 12.5, cursor: total === 0 ? 'default' : 'pointer' }}
            >
              <Icon name="layers" size={14} strokeWidth={2.2} color={total === 0 ? 'var(--text-4)' : accent} />
              Save crew
            </button>
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
