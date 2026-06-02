import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba, accentVars } from '../lib/ui'
import { AGENTS, agentById } from '../lib/agents'

function pathLabel(cwd) {
  if (!cwd) return 'this directory'
  const trimmed = String(cwd).replace(/[\\/]+$/, '')
  return trimmed.split(/[\\/]/).filter(Boolean).pop() || trimmed
}

// Synonyms Seducia understands for each agent.
const SYNONYMS = {
  shell: ['terminal', 'shell', 'pwsh', 'powershell', 'bash'],
  claude: ['claude'],
  codex: ['codex'],
  gemini: ['gemini'],
  opencode: ['opencode', 'open code', 'oc']
}

// Map a free-text token ("claude", "all", "everyone") to an agent id or 'all'.
function agentIdFromToken(token) {
  const t = String(token || '').toLowerCase().trim()
  if (!t) return null
  if (['all', 'everyone', 'everybody', 'them', 'agents', 'team'].includes(t)) return 'all'
  for (const [id, names] of Object.entries(SYNONYMS)) {
    if (names.some(n => t === n || t.startsWith(n))) return id
  }
  return null
}

// Sessions that are alive and (optionally) match a target agent.
function runningTargets(tabs, target) {
  return tabs.filter(t => t.status !== 'exited' && (target === 'all' || (t.agentId || 'shell') === target))
}

function targetName(id) {
  if (id === 'all') return 'agents'
  return agentById(id)?.label || id
}

// A natural-language summary of what's currently running — Seducia's awareness.
function describeSessions(tabs) {
  const running = tabs.filter(t => t.status !== 'exited')
  if (!running.length) return "Nothing is running yet. Tell me what to launch — e.g. “build team here” or “3 claude”."
  const byAgent = new Map()
  running.forEach(t => {
    const id = t.agentId || 'shell'
    if (!byAgent.has(id)) byAgent.set(id, [])
    byAgent.get(id).push(t)
  })
  const parts = [...byAgent.entries()].map(([id, list]) => `${list.length}× ${agentById(id)?.label || 'Terminal'}`)
  const groups = new Set(running.map(t => t.groupId).filter(Boolean)).size
  const groupNote = groups ? ` across ${groups} workspace${groups === 1 ? '' : 's'}` : ''
  return `${running.length} session${running.length === 1 ? '' : 's'} live${groupNote}: ${parts.join(', ')}. Say “tell claude …” to prompt one, or “focus codex” to jump to it.`
}

// A coordinated "team" — distinct roles, each keeping its CLI + brand colour.
function buildTeam() {
  return [
    { ...agentById('claude'), command: 'claude', label: 'Builder', count: 1 },
    { ...agentById('codex'), command: 'codex', label: 'Reviewer', count: 1 },
    { ...agentById('gemini'), command: 'gemini', label: 'Scout', count: 1 }
  ].filter(a => a.id)
}

// Resolve a directory token: a real path is used as-is, otherwise try to match a
// known directory by name (so "in Rooms" finds C:\Users\WhitePC\Rooms).
function resolveDir(token, dirs, activeCwd) {
  const t = String(token || '').trim().replace(/^["']|["']$/g, '')
  if (!t) return activeCwd || null
  if (/[\\/:]/.test(t)) return t
  const lower = t.toLowerCase()
  const hit =
    dirs.find(d => pathLabel(d.cwd).toLowerCase() === lower) ||
    dirs.find(d => (d.label || '').toLowerCase() === lower)
  return hit ? hit.cwd : t
}

// Deterministic intent parser. Structured so an LLM can slot in later — the rest
// of the app only cares about the {type, ...} it returns. Order matters: control
// intents (status / prompt / focus) are matched before the launch heuristics, so
// "tell claude to ship it" routes a prompt instead of spawning a new Claude.
function parseIntent(input, activeCwd, dirs = []) {
  const raw = input.trim()
  const text = raw.toLowerCase()

  // ── Awareness: "status", "what's running", "who's on" ──
  if (/^(?:status|sitrep|report)\b/.test(text) ||
      /\b(?:what|who)(?:'s| is| are)?\s+(?:running|on|up|going|live|active|here)\b/.test(text) ||
      /\blist\s+(?:sessions|agents|swarm)\b/.test(text)) {
    return { type: 'status' }
  }

  // ── Prompt a running agent ──
  // "claude: do X"  /  "tell|ask|prompt|send|message <agent> [to|that] X"  /  "broadcast X"
  const colon = raw.match(/^\s*([a-z][a-z ]*?)\s*:\s*(.+)$/i)
  if (colon) {
    const id = agentIdFromToken(colon[1])
    if (id) return { type: 'prompt', target: id, text: colon[2].trim() }
  }
  const verb = raw.match(/^\s*(?:tell|ask|prompt|send(?:\s+to)?|message|dm|have)\s+([a-z]+)\s+(.+)$/i)
  if (verb) {
    const id = agentIdFromToken(verb[1])
    if (id) {
      const text2 = verb[2].trim().replace(/^(?:to|that|:)\s+/i, '')
      if (text2) return { type: 'prompt', target: id, text: text2 }
    }
  }
  const bc = raw.match(/^\s*(?:broadcast|announce|tell everyone|tell all)\s+(.+)$/i)
  if (bc) return { type: 'prompt', target: 'all', text: bc[1].trim() }

  // ── Focus / switch to a running agent ──
  const focus = raw.match(/^\s*(?:focus(?:\s+on)?|switch to|switch|go to|jump to|show me)\s+([a-z]+)\s*$/i)
  if (focus) {
    const id = agentIdFromToken(focus[1])
    if (id) return { type: 'focus', target: id }
  }

  // ── Launch (directory + agents) ──
  let cwd = activeCwd || null
  const inMatch = raw.match(/\b(?:in|into|at)\s+(.+)$/i)
  if (inMatch) cwd = resolveDir(inMatch[1], dirs, activeCwd)
  if (/\b(here|current|this dir|this directory|this folder)\b/.test(text)) cwd = activeCwd || cwd

  if (/\b(team|squad|crew)\b/.test(text)) {
    return { type: 'launch', cwd, groupLabel: `${pathLabel(cwd)} team`, agents: buildTeam() }
  }

  const agents = []
  for (const agent of AGENTS) {
    const names = SYNONYMS[agent.id] || [agent.id]
    let count = 0
    for (const name of names) {
      const before = raw.match(new RegExp(`(\\d+)\\s*(?:x|×)?\\s*${name}\\b`, 'i'))
      const after = raw.match(new RegExp(`\\b${name}\\s*(?:x|×)\\s*(\\d+)`, 'i'))
      if (before) count = Math.max(count, parseInt(before[1], 10) || 0)
      else if (after) count = Math.max(count, parseInt(after[1], 10) || 0)
      else if (new RegExp(`\\b${name}\\b`, 'i').test(raw)) count = Math.max(count, 1)
    }
    if (count > 0) agents.push({ ...agent, count })
  }
  if (agents.length) return { type: 'launch', cwd, agents }

  if (/\b(launch|swarm|new session|session|sessions|open launcher|launcher)\b/.test(text)) {
    return { type: 'open-launcher' }
  }
  return { type: 'run', input: raw }
}

function summarize(agents) {
  return agents.map(a => `${a.count}× ${a.label}`).join(', ')
}

const QUICK = [
  { label: 'Build team', send: 'build team here' },
  { label: 'Status', send: 'status' },
  { label: '3× Claude', send: '3 claude here' },
  { label: 'Doctor', send: 'doctor' }
]

const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

export default function Seducia({ accent, tabs = [], recentSessions = [], activeCwd, onLaunch, onRun, onPrompt, onFocus, onOpenLauncher, onClose, docked = false }) {
  const dirs = [
    ...(activeCwd ? [{ cwd: activeCwd, label: pathLabel(activeCwd) }] : []),
    ...recentSessions.map(s => ({ cwd: s.cwd, label: s.label }))
  ]
  const [value, setValue] = useState('')
  const [listening, setListening] = useState(false)
  const [log, setLog] = useState([
    { id: 0, role: 'seducia', text: "I'm Seducia, your session orchestrator. I can spin up agents (“build team in Rooms”, “3 claude here”), tell you what's running (“status”), prompt a live agent (“tell claude to run the tests”), or jump you to one (“focus codex”). Tap the mic to talk." }
  ])
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const idRef = useRef(1)
  const recognitionRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    if (docked) return
    const handler = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, docked])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [log])
  useEffect(() => () => { try { recognitionRef.current?.stop() } catch {} }, [])

  const groups = new Set(tabs.map(t => t.groupId).filter(Boolean)).size

  const push = (role, text) => setLog(prev => [...prev, { id: idRef.current++, role, text }])

  const handle = (input) => {
    const command = input.trim()
    if (!command) return
    push('you', command)
    setValue('')

    const intent = parseIntent(command, activeCwd, dirs)
    if (intent.type === 'status') {
      push('seducia', describeSessions(tabs))
    } else if (intent.type === 'prompt') {
      const targets = runningTargets(tabs, intent.target)
      if (!targets.length) {
        push('seducia', `No ${targetName(intent.target)} running right now — say “${intent.target === 'all' ? 'build team here' : intent.target + ' here'}” and I'll launch one first.`)
      } else if (intent.target === 'all') {
        push('seducia', `Broadcasting to ${targets.length} session${targets.length === 1 ? '' : 's'}: “${intent.text}”.`)
        onPrompt?.({ target: 'all', text: intent.text })
      } else {
        const where = targets.length > 1 ? ` (${targets.length} of them)` : ''
        push('seducia', `Sending to ${targetName(intent.target)}${where}: “${intent.text}”.`)
        onPrompt?.({ target: intent.target, text: intent.text })
      }
    } else if (intent.type === 'focus') {
      const targets = runningTargets(tabs, intent.target)
      if (!targets.length) {
        push('seducia', `No ${targetName(intent.target)} to focus — nothing by that name is running.`)
      } else {
        push('seducia', `Jumping to ${targetName(intent.target)}.`)
        onFocus?.(intent.target)
      }
    } else if (intent.type === 'launch') {
      const where = pathLabel(intent.cwd)
      push('seducia', `On it — spinning up ${summarize(intent.agents)} in ${where}. They'll open as a workspace.`)
      onLaunch({ cwd: intent.cwd, agents: intent.agents, groupLabel: intent.groupLabel })
    } else if (intent.type === 'open-launcher') {
      push('seducia', 'Opening the launcher so you can dial in the swarm.')
      onOpenLauncher()
    } else {
      push('seducia', `Running “${intent.input}” in the active session.`)
      onRun(intent.input)
    }
  }

  // Voice dictation via the Web Speech API. Works where the browser provides a
  // recognition backend; degrades gracefully (button hidden) where it doesn't.
  const toggleVoice = () => {
    if (!SpeechRecognition) return
    if (listening) { try { recognitionRef.current?.stop() } catch {}; return }
    const rec = new SpeechRecognition()
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = (event) => {
      const text = Array.from(event.results).map(r => r[0].transcript).join('')
      setValue(text)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    setListening(true)
    try { rec.start() } catch { setListening(false) }
  }

  const body = (
    <div
      className="sush-fade-up flex flex-col"
      style={{
        width: docked ? '100%' : 'min(400px, 92vw)',
        height: '100%',
        background: docked ? 'transparent' : `radial-gradient(700px 260px at 100% 0%, ${rgba(accent, 0.12)}, transparent 60%), #0b0e11`,
        borderLeft: docked ? 'none' : `1px solid ${rgba(accent, 0.28)}`,
        boxShadow: docked ? 'none' : '-24px 0 60px rgba(0,0,0,0.5)'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between" style={{ padding: docked ? '14px 14px' : '16px 18px', borderBottom: '1px solid #171c22' }}>
        <div className="flex items-center" style={{ gap: 12 }}>
          <span
            className="flex items-center justify-center sush-orb"
            style={{
              width: docked ? 34 : 40,
              height: docked ? 34 : 40,
              borderRadius: '50%',
              background: `radial-gradient(circle at 30% 30%, ${rgba(accent, 0.9)}, ${rgba(accent, 0.25)})`,
              border: `1px solid ${rgba(accent, 0.6)}`,
              color: '#0a0a0a',
              boxShadow: `0 0 22px ${rgba(accent, 0.5)}`
            }}
          >
            <Icon name="sparkles" size={docked ? 17 : 20} strokeWidth={2} />
          </span>
          <div>
            <div style={{ fontSize: docked ? 13.5 : 15, fontWeight: 900, color: '#f1f4f6', letterSpacing: 0.3 }}>Seducia</div>
            <div style={{ fontSize: 11, color: '#76808a', marginTop: 1 }}>
              {tabs.length} session{tabs.length === 1 ? '' : 's'}{groups ? ` · ${groups} workspace${groups === 1 ? '' : 's'}` : ''}
            </div>
          </div>
        </div>
        {!docked && (
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="sush-icon-btn flex items-center justify-center"
            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #20272e', background: '#11151a', color: '#8a939c', cursor: 'pointer' }}
          >
            <Icon name="x" size={15} />
          </button>
        )}
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto sush-scroll flex flex-col" style={{ padding: 14, gap: 12 }}>
        {log.map(entry => (
          <div key={entry.id} className={`flex ${entry.role === 'you' ? 'justify-end' : 'justify-start'}`}>
            {entry.role === 'seducia' && (
              <span className="flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, marginRight: 9, marginTop: 1, background: rgba(accent, 0.15), border: `1px solid ${rgba(accent, 0.35)}`, color: accent }}>
                <Icon name="sparkles" size={13} strokeWidth={2} />
              </span>
            )}
            <div
              style={{
                maxWidth: '84%',
                fontSize: 12.5,
                lineHeight: 1.5,
                padding: '9px 12px',
                borderRadius: 12,
                border: `1px solid ${entry.role === 'you' ? rgba(accent, 0.4) : '#1b2127'}`,
                background: entry.role === 'you' ? rgba(accent, 0.12) : '#0f1318',
                color: entry.role === 'you' ? '#f1f4f6' : '#cdd5dc',
                borderTopRightRadius: entry.role === 'you' ? 4 : 12,
                borderTopLeftRadius: entry.role === 'you' ? 12 : 4
              }}
            >
              {entry.text}
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex" style={{ gap: 7, flexWrap: 'wrap', padding: '0 14px 12px' }}>
        {QUICK.map(q => (
          <button
            key={q.label}
            onClick={() => handle(q.send)}
            className="sush-mini-btn"
            style={{ fontSize: 11, fontWeight: 800, color: '#aab3bb', background: '#11151a', border: `1px solid ${rgba(accent, 0.22)}`, borderRadius: 999, padding: '5px 11px', cursor: 'pointer' }}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Composer */}
      <div style={{ padding: '0 14px 14px' }}>
        <div className="sush-omni flex items-center" style={{ height: 46, gap: 8 }}>
          <Icon name="sparkles" size={16} color={accent} />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handle(value) } }}
            placeholder={listening ? 'Listening…' : 'Launch, prompt, or focus an agent…'}
            spellCheck={false}
            style={{ flex: 1, minWidth: 0, height: '100%', background: 'transparent', border: 'none', color: '#f1f4f6', outline: 'none', fontSize: 13 }}
          />
          {SpeechRecognition && (
            <button
              onClick={toggleVoice}
              title={listening ? 'Stop listening' : 'Dictate (voice)'}
              className={`flex items-center justify-center ${listening ? 'sush-orb' : ''}`}
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                border: `1px solid ${listening ? 'transparent' : rgba(accent, 0.3)}`,
                background: listening ? '#ff5370' : '#11151a',
                color: listening ? '#0a0a0a' : accent,
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <Icon name="mic" size={15} strokeWidth={2} />
            </button>
          )}
          <button
            onClick={() => handle(value)}
            disabled={!value.trim()}
            className="flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              border: 'none',
              background: value.trim() ? accent : '#1c2126',
              color: value.trim() ? '#0a0a0a' : '#5a646d',
              cursor: value.trim() ? 'pointer' : 'default',
              flexShrink: 0
            }}
          >
            <Icon name="send" size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  )

  if (docked) {
    return <div style={{ ...accentVars(accent), height: '100%' }}>{body}</div>
  }

  return (
    <div
      style={{ ...accentVars(accent), position: 'fixed', inset: 0, zIndex: 350, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {body}
    </div>
  )
}
