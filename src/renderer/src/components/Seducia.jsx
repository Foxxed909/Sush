import React, { useEffect, useRef, useState, useCallback } from 'react'
import Icon from './Icons'
import { rgba, accentVars } from '../lib/ui'
import { allAgents, agentById } from '../lib/agents'
import { getStreamer, parseAIResponse } from '../lib/ai'
import { applyAction } from '../lib/seduciaActions'

function pathLabel(cwd) {
  if (!cwd) return 'this directory'
  const trimmed = String(cwd).replace(/[\\/]+$/, '')
  return trimmed.split(/[\\/]/).filter(Boolean).pop() || trimmed
}

const SYNONYMS = {
    shell: ['terminal', 'shell', 'pwsh', 'powershell', 'bash'],
  claude: ['claude'],
  codex: ['codex'],
  gemini: ['gemini'],
  opencode: ['opencode', 'open code']
}

function agentIdFromToken(token) {
  const t = String(token || '').toLowerCase().trim()
  if (!t) return null
  if (['all', 'everyone', 'everybody', 'them', 'agents', 'team'].includes(t)) return 'all'
  for (const [id, names] of Object.entries(SYNONYMS)) {
    if (names.some(n => t === n || t.startsWith(n))) return id
  }
  return null
}

function buildTeam() {
  return [
    { ...agentById('claude'), command: 'claude', label: 'Builder', count: 1 },
    { ...agentById('codex'), command: 'codex', label: 'Reviewer', count: 1 },
    { ...agentById('gemini'), command: 'gemini', label: 'Scout', count: 1 }
  ].filter(a => a.id)
}

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

// Deterministic fallback intent parser (used when no API key is configured).
function parseIntent(input, activeCwd, dirs = []) {
  const raw = input.trim()
  const text = raw.toLowerCase()

  if (/^(?:status|sitrep|report)\b/.test(text) ||
      /\b(?:what|who)(?:'s| is| are)?\s+(?:running|on|up|going|live|active|here)\b/.test(text) ||
      /\blist\s+(?:sessions|agents|swarm)\b/.test(text)) {
    return { type: 'status' }
  }

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

  const focus = raw.match(/^\s*(?:focus(?:\s+on)?|switch to|switch|go to|jump to|show me)\s+([a-z]+)\s*$/i)
  if (focus) {
    const id = agentIdFromToken(focus[1])
    if (id) return { type: 'focus', target: id }
  }

  let cwd = activeCwd || null
  const inMatch = raw.match(/\b(?:in|into|at)\s+(.+)$/i)
  if (inMatch) cwd = resolveDir(inMatch[1], dirs, activeCwd)
  if (/\b(here|current|this dir|this directory|this folder)\b/.test(text)) cwd = activeCwd || cwd

  if (/\b(team|squad|crew)\b/.test(text)) {
    return { type: 'launch', cwd, groupLabel: `${pathLabel(cwd)} team`, agents: buildTeam() }
  }

  const agents = []
  for (const agent of allAgents()) {
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

const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

// TTS: speak a message using the Web Speech API, respecting voice settings.
function speak(text, voiceSettings = {}) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utt = new SpeechSynthesisUtterance(text)
  utt.rate = voiceSettings.rate ?? 1.1
  utt.pitch = voiceSettings.pitch ?? 1.0
  utt.volume = voiceSettings.volume ?? 1.0
  if (voiceSettings.voiceURI) {
    const voices = window.speechSynthesis.getVoices()
    const v = voices.find(v => v.voiceURI === voiceSettings.voiceURI)
    if (v) utt.voice = v
  }
  window.speechSynthesis.speak(utt)
}

const QUICK = [
  { label: 'Build team', send: 'build team here' },
  { label: 'Status', send: 'status' },
  { label: '3× Claude', send: '3 claude here' },
  { label: 'Doctor', send: 'doctor' }
]

// Confirm card for AI-proposed launches: shows what Seducia understood and
// auto-proceeds after 5s ("mix of both" — she does it, you get a veto window).
function LaunchCard({ accent, launch, status, onGo, onCancel }) {
  const [left, setLeft] = useState(5)
  // onGo is a fresh closure on every parent render (typing in the composer
  // re-renders the transcript) — keep it in a ref so the countdown's 1s tick
  // isn't torn down and re-armed mid-second, stalling the timer.
  const goRef = useRef(onGo)
  goRef.current = onGo
  useEffect(() => {
    if (status) return
    if (left <= 0) { goRef.current(); return }
    const t = setTimeout(() => setLeft(l => l - 1), 1000)
    return () => clearTimeout(t)
  }, [left, status])
  const total = (launch.agents || []).reduce((sum, a) => sum + Math.max(1, a.count || 1), 0)
  const brief = launch.prompt ? String(launch.prompt) : ''
  return (
    <div style={{ maxWidth: '84%', borderRadius: 12, border: `1px solid ${rgba(accent, 0.4)}`, background: rgba(accent, 0.07), padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 900, color: accent, letterSpacing: 1.2, marginBottom: 6 }}>LAUNCH PLAN</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 700, lineHeight: 1.5 }}>
        {summarize(launch.agents)} in {pathLabel(launch.cwd)}
      </div>
      {brief && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.5 }}>
          brief: "{brief.slice(0, 160)}{brief.length > 160 ? '...' : ''}"
        </div>
      )}
      {!status ? (
        <div className="flex items-center" style={{ gap: 8, marginTop: 10 }}>
          <button
            onClick={onGo}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: accent, color: '#0a0a0c', fontWeight: 900, fontSize: 11.5, cursor: 'pointer' }}
          >
            Launch now
          </button>
          <button
            onClick={onCancel}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: 'var(--text-2)', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-4)', fontWeight: 700 }}>auto in {left}s</span>
        </div>
      ) : (
        <div style={{ marginTop: 8, fontSize: 11, fontWeight: 800, color: status === 'launched' ? '#5fd3a8' : 'var(--text-3)' }}>
          {status === 'launched' ? `Launched ${total} session${total === 1 ? '' : 's'}.` : 'Cancelled.'}
        </div>
      )}
    </div>
  )
}

export default function Seducia({
  accent,
  tabs = [],
  recentSessions = [],
  activeCwd,
  scope = { kind: 'main' },
  controls = {},
  onLaunch,
  onRun,
  onPrompt,
  onFocus,
  onOpenLauncher,
  onClose,
  docked = false,
  settings = {}
}) {
  // Project scope: only this workspace's sessions, default dir = its cwd.
  const scopedTabs = scope?.groupId ? tabs.filter(t => t.groupId === scope.groupId) : tabs
  const scopedCwd = scope?.cwd || activeCwd
  const dirs = [
    ...(scopedCwd ? [{ cwd: scopedCwd, label: pathLabel(scopedCwd) }] : []),
    ...recentSessions.map(s => ({ cwd: s.cwd, label: s.label }))
  ]

  const [value, setValue] = useState('')
  const [listening, setListening] = useState(false)
  const [handsFree, setHandsFree] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [aiMessages, setAiMessages] = useState([]) // { role: 'user'|'assistant', content: '' }
  const [log, setLog] = useState([
    { id: 0, role: 'seducia', text: "I'm Seducia. I can spin up agents ('build team in Rooms'), prompt them ('tell claude to run the tests'), or jump to one ('focus codex'). Tap the mic for voice.", streaming: false }
  ])
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const idRef = useRef(1)
  const recognitionRef = useRef(null)
  const streamAbortRef = useRef(null)

  const aiEnabled = !!getStreamer(settings)
  const voiceEnabled = !!SpeechRecognition

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    if (docked) return
    const handler = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, docked])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [log])
  useEffect(() => () => {
    try { recognitionRef.current?.stop() } catch {}
    streamAbortRef.current?.abort()
    window.speechSynthesis?.cancel()
  }, [])

  const groups = new Set(scopedTabs.map(t => t.groupId).filter(Boolean)).size

  const push = useCallback((role, text, extra = {}) => {
    setLog(prev => [...prev, { id: idRef.current++, role, text, ...extra }])
    return idRef.current - 1
  }, [])

  const updateLast = useCallback((id, patch) => {
    setLog(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }, [])

  // Shared executor (same one the orb uses): returns { text, readout? }.
  // The docked panel surfaces readouts inline rather than looping the AI.
  const applyIntent = useCallback(async (intent) => {
    const res = await applyAction(intent, {
      tabs: scopedTabs,
      scope,
      controls,
      activeCwd: scopedCwd,
      onLaunch, onRun, onPrompt, onFocus, onOpenLauncher
    })
    if (!res) return null
    if (res.readout?.length) {
      const preview = res.readout
        .map(r => `-- ${r.label} --\n${String(r.text || '').slice(-600)}`)
        .join('\n\n')
      return `${res.text}\n${preview}`
    }
    return res.text
  }, [scopedTabs, scope, controls, scopedCwd, onPrompt, onFocus, onLaunch, onOpenLauncher, onRun])

  // AI-proposed launches go through a confirm card (5s auto-proceed) — a
  // misread request should not silently spawn a swarm. The ref guards the
  // countdown timer and the button from double-firing.
  const firedLaunchesRef = useRef(new Set())
  const resolveLaunch = useCallback((entryId, launch, go) => {
    if (firedLaunchesRef.current.has(entryId)) return
    firedLaunchesRef.current.add(entryId)
    if (go) applyIntent(launch)
    setLog(prev => prev.map(e => e.id === entryId ? { ...e, launchStatus: go ? 'launched' : 'cancelled' } : e))
  }, [applyIntent])

  const handleAI = useCallback(async (command) => {
    const streamer = getStreamer(settings)
    if (!streamer) return false

    const userMsg = { role: 'user', content: command }
    const newHistory = [...aiMessages, userMsg]
    setAiMessages(newHistory)

    const msgId = push('seducia', '', { streaming: true })
    setStreaming(true)

    const abort = new AbortController()
    streamAbortRef.current = abort
    let full = ''

    try {
      const gen = streamer(newHistory.map(m => ({ role: m.role, content: m.content })), { tabs: scopedTabs, activeCwd: scopedCwd, scope })
      for await (const chunk of gen) {
        if (abort.signal.aborted) break
        full += chunk
        updateLast(msgId, { text: full.replace(/(?:ACTION|ENGINE):[^\n]*/g, '').trim(), streaming: true })
      }
    } catch (e) {
      full = e.message?.includes('401') ? "Invalid API key -- check Settings." : `AI error: ${e.message}`
      updateLast(msgId, { text: full, streaming: false })
      setStreaming(false)
      return true
    }

    const { message, actions: parsedActions, engine } = parseAIResponse(full)
    const displayText = message || full

    // A stopped stream may have been cut mid-ACTION line — never execute
    // actions parsed out of a partial response.
    const actions = abort.signal.aborted ? [] : parsedActions

    // Launches wait behind a confirm card; everything else applies now.
    const launches = actions.filter(a => a?.type === 'launch')
    const feedback = []
    for (const act of actions) {
      if (!act || act.type === 'launch') continue
      const fb = await applyIntent(act)
      if (fb && fb !== displayText) feedback.push(fb)
    }

    const finalText = [displayText, ...feedback].filter(Boolean).join('\n')
    updateLast(msgId, { text: finalText, streaming: false, engine })
    launches.forEach(launch => push('seducia', '', { kind: 'launch-card', launch }))
    setStreaming(false)

    // TTS: system voice (ElevenLabs streaming was retired).
    if (voiceEnabled && settings.ttsEnabled) {
      const ttsText = finalText.replace(/ACTION:[^\n]*/g, '').trim()
      speak(ttsText, { rate: settings.ttsRate, pitch: settings.ttsPitch, voiceURI: settings.ttsVoice })
    }

    setAiMessages([...newHistory, { role: 'assistant', content: full }])
    return true
  }, [settings, aiMessages, scopedTabs, scopedCwd, scope, push, updateLast, applyIntent, voiceEnabled])

  const handle = useCallback(async (input) => {
    const command = input.trim()
    if (!command || streaming) return
    push('you', command)
    setValue('')

    // Try AI first if a key is configured and plan allows.
    if (aiEnabled) {
      await handleAI(command)
      return
    }

    // Deterministic fallback.
    const intent = parseIntent(command, scopedCwd, dirs)
    const response = (await applyIntent(intent)) || `Running "${command}".`

    push('seducia', response)

    if (voiceEnabled && settings.ttsEnabled) {
      speak(response, { rate: settings.ttsRate, pitch: settings.ttsPitch, voiceURI: settings.ttsVoice })
    }
  }, [streaming, aiEnabled, scopedCwd, dirs, push, handleAI, applyIntent, voiceEnabled, settings])

  // Voice dictation
  const toggleVoice = useCallback(() => {
    if (!SpeechRecognition || !voiceEnabled) return
    if (listening) {
      try { recognitionRef.current?.stop() } catch {}
      return
    }
    const rec = new SpeechRecognition()
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = (event) => {
      const text = Array.from(event.results).map(r => r[0].transcript).join('')
      setValue(text)
      if (event.results[event.results.length - 1].isFinal && handsFree) {
        handle(text)
      }
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => {
      setListening(false)
      // Re-arm mic in hands-free mode.
      if (handsFree) setTimeout(() => toggleVoice(), 400)
    }
    recognitionRef.current = rec
    setListening(true)
    try { rec.start() } catch { setListening(false) }
  }, [listening, voiceEnabled, handsFree, handle])

  const hasAIKey = aiEnabled  // CLI-only now

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
      <div className="flex items-center justify-between" style={{ padding: docked ? '12px 14px' : '16px 18px', borderBottom: '1px solid #171c22' }}>
        <div className="flex items-center" style={{ gap: 10 }}>
          <span
            className="flex items-center justify-center sush-orb"
            style={{
              width: docked ? 32 : 38,
              height: docked ? 32 : 38,
              borderRadius: '50%',
              background: `radial-gradient(circle at 30% 30%, ${rgba(accent, 0.9)}, ${rgba(accent, 0.25)})`,
              border: `1px solid ${rgba(accent, 0.6)}`,
              color: '#0a0a0a',
              boxShadow: `0 0 18px ${rgba(accent, 0.5)}`
            }}
          >
            <Icon name="sparkles" size={docked ? 15 : 18} strokeWidth={2} />
          </span>
          <div>
            <div className="flex items-center" style={{ gap: 6 }}>
              <span style={{ fontSize: docked ? 13 : 14.5, fontWeight: 900, color: 'var(--text-1)' }}>Seducia</span>
              {aiEnabled && hasAIKey && (
                <span style={{ fontSize: 9, fontWeight: 800, color: accent, background: rgba(accent, 0.15), border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 99, padding: '1px 6px', letterSpacing: 0.5 }}>AI</span>
              )}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1 }}>
              {scope?.kind === 'project' ? `${scope.label} · ` : ''}{scopedTabs.length} session{scopedTabs.length === 1 ? '' : 's'}{scope?.kind !== 'project' && groups ? ` · ${groups} workspace${groups === 1 ? '' : 's'}` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center" style={{ gap: 6 }}>
          {/* Hands-free toggle */}
          {voiceEnabled && SpeechRecognition && (
            <button
              onClick={() => setHandsFree(prev => !prev)}
              title={handsFree ? 'Disable hands-free mode' : 'Enable hands-free (auto-submit on voice)'}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: `1px solid ${handsFree ? rgba(accent, 0.5) : '#20272e'}`,
                background: handsFree ? rgba(accent, 0.12) : '#11151a',
                color: handsFree ? accent : 'var(--text-4)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Icon name="radio" size={13} strokeWidth={2} />
            </button>
          )}
          {!docked && (
            <button
              onClick={onClose}
              title="Close (Esc)"
              style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #20272e', background: '#11151a', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
      </div>

      {/* No AI key notice */}
      {!hasAIKey && (
        <div style={{ margin: '8px 10px 0', padding: '8px 12px', borderRadius: 8, background: rgba(accent, 0.08), border: `1px solid ${rgba(accent, 0.2)}`, fontSize: 11, color: 'var(--text-2)' }}>
          Add an API key in <strong style={{ color: accent }}>Settings → AI</strong> to enable AI responses.
        </div>
      )}

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto sush-scroll flex flex-col" style={{ padding: 12, gap: 10 }}>
        {log.map(entry => (
          <div key={entry.id} className={`flex ${entry.role === 'you' ? 'justify-end' : 'justify-start'}`}>
            {entry.role === 'seducia' && (
              <span className="flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginRight: 8, marginTop: 2, background: rgba(accent, 0.15), border: `1px solid ${rgba(accent, 0.35)}`, color: accent }}>
                <Icon name="sparkles" size={12} strokeWidth={2} />
              </span>
            )}
            {entry.kind === 'launch-card' ? (
              <LaunchCard
                accent={accent}
                launch={entry.launch}
                status={entry.launchStatus}
                onGo={() => resolveLaunch(entry.id, entry.launch, true)}
                onCancel={() => resolveLaunch(entry.id, entry.launch, false)}
              />
            ) : (
              <div
                style={{
                  maxWidth: '84%',
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  padding: '8px 11px',
                  borderRadius: 12,
                  border: `1px solid ${entry.role === 'you' ? rgba(accent, 0.4) : '#1b2127'}`,
                  background: entry.role === 'you' ? rgba(accent, 0.12) : '#0f1318',
                  color: entry.role === 'you' ? 'var(--text-1)' : 'var(--text-2)',
                  borderTopRightRadius: entry.role === 'you' ? 4 : 12,
                  borderTopLeftRadius: entry.role === 'you' ? 12 : 4,
                  whiteSpace: 'pre-wrap'
                }}
              >
                {entry.text}
                {entry.streaming && <span style={{ display: 'inline-block', width: 8, height: 12, background: accent, borderRadius: 2, marginLeft: 3, verticalAlign: 'middle', animation: 'sush-blink 0.8s step-start infinite' }} />}
                {entry.engine && !entry.streaming && (
                  <span style={{ display: 'block', marginTop: 5, fontSize: 9.5, fontWeight: 800, color: 'var(--text-3)', letterSpacing: 0.5 }}>
                    via {entry.engine} CLI
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex" style={{ gap: 6, flexWrap: 'wrap', padding: '0 12px 10px' }}>
        {QUICK.map(q => (
          <button
            key={q.label}
            onClick={() => handle(q.send)}
            disabled={streaming}
            style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-2)', background: '#11151a', border: `1px solid ${rgba(accent, 0.22)}`, borderRadius: 999, padding: '4px 10px', cursor: streaming ? 'default' : 'pointer', opacity: streaming ? 0.5 : 1 }}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Composer */}
      <div style={{ padding: '0 12px 12px' }}>
        <div className="sush-omni flex items-center" style={{ height: 44, gap: 8 }}>
          <Icon name="sparkles" size={15} color={streaming ? accent : 'var(--text-4)'} className={streaming ? 'sush-spin' : undefined} />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handle(value) }
            }}
            placeholder={listening ? 'Listening...' : streaming ? 'Seducia is thinking...' : 'Launch, prompt, or ask anything...'}
            disabled={streaming}
            spellCheck={false}
            style={{ flex: 1, minWidth: 0, height: '100%', background: 'transparent', border: 'none', color: 'var(--text-1)', outline: 'none', fontSize: 13 }}
          />
          {voiceEnabled && SpeechRecognition && (
            <button
              onClick={toggleVoice}
              title={listening ? 'Stop' : handsFree ? 'Speak (hands-free on)' : 'Dictate'}
              className={`flex items-center justify-center ${listening ? 'sush-orb' : ''}`}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                border: `1px solid ${listening ? 'transparent' : rgba(accent, 0.3)}`,
                background: listening ? '#ff5370' : '#11151a',
                color: listening ? '#0a0a0a' : accent,
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <Icon name="mic" size={14} strokeWidth={2} />
            </button>
          )}
          {streaming ? (
            <button
              onClick={() => { streamAbortRef.current?.abort(); setStreaming(false) }}
              title="Stop"
              style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid rgba(255,83,112,0.4)`, background: 'rgba(255,83,112,0.1)', color: '#ff5370', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="stop" size={13} />
            </button>
          ) : (
            <button
              onClick={() => handle(value)}
              disabled={!value.trim()}
              style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: value.trim() ? accent : '#1c2126', color: value.trim() ? '#0a0a0a' : 'var(--text-4)', cursor: value.trim() ? 'pointer' : 'default', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="send" size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  )

  if (docked) return <div style={{ ...accentVars(accent), height: '100%' }}>{body}</div>

  return (
    <div
      style={{ ...accentVars(accent), position: 'fixed', inset: 0, zIndex: 350, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {body}
    </div>
  )
}
