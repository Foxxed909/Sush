import React, { useEffect, useRef, useState, useCallback } from 'react'
import Icon from './Icons'
import { rgba, accentVars } from '../lib/ui'
import { AGENTS, agentById } from '../lib/agents'
import { getStreamer, parseAIResponse } from '../lib/ai'
import { can } from '../lib/plan'

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
  opencode: ['opencode', 'open code'],
  hermes: ['hermes'],
  aipex: ['aipex', 'apx'],
  trident: ['trident'],
  bedrock: ['bedrock'],
  quill: ['quill'],
  razor: ['razor'],
  serenity: ['serenity'],
  sydney: ['sydney'],
  ocp: ['ocp', 'open cli platform'],
  erosion: ['erosion'],
  evm: ['evm', 'environment monitor']
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

function runningTargets(tabs, target) {
  return tabs.filter(t => t.status !== 'exited' && (target === 'all' || (t.agentId || 'shell') === target))
}

function targetName(id) {
  if (id === 'all') return 'agents'
  return agentById(id)?.label || id
}

function describeSessions(tabs) {
  const running = tabs.filter(t => t.status !== 'exited')
  if (!running.length) return "Nothing is running yet. Tell me what to launch -- e.g. 'build team here' or '3 claude'."
  const byAgent = new Map()
  running.forEach(t => {
    const id = t.agentId || 'shell'
    if (!byAgent.has(id)) byAgent.set(id, [])
    byAgent.get(id).push(t)
  })
  const parts = [...byAgent.entries()].map(([id, list]) => `${list.length}× ${agentById(id)?.label || 'Terminal'}`)
  const groups = new Set(running.map(t => t.groupId).filter(Boolean)).size
  const groupNote = groups ? ` across ${groups} workspace${groups === 1 ? '' : 's'}` : ''
  return `${running.length} session${running.length === 1 ? '' : 's'} live${groupNote}: ${parts.join(', ')}. Say "tell claude ..." to prompt one, or "focus codex" to jump to it.`
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

// ElevenLabs TTS: fetch streaming audio and play it.
async function elevenLabsSpeak(text, apiKey, voiceId) {
  if (!text || !apiKey || !voiceId) return
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', 'accept': 'audio/mpeg' },
      body: JSON.stringify({ text: text.slice(0, 500), model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.play()
    audio.onended = () => URL.revokeObjectURL(url)
  } catch {}
}

const QUICK = [
  { label: 'Build team', send: 'build team here' },
  { label: 'Status', send: 'status' },
  { label: '3× Claude', send: '3 claude here' },
  { label: 'Doctor', send: 'doctor' }
]

export default function Seducia({
  accent,
  tabs = [],
  recentSessions = [],
  activeCwd,
  onLaunch,
  onRun,
  onPrompt,
  onFocus,
  onOpenLauncher,
  onClose,
  docked = false,
  settings = {},
  planId = 'free'
}) {
  const dirs = [
    ...(activeCwd ? [{ cwd: activeCwd, label: pathLabel(activeCwd) }] : []),
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

  const aiEnabled = can(planId, 'seduciaAI') && !!getStreamer(settings)
  const voiceEnabled = can(planId, 'voiceMode')

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

  const groups = new Set(tabs.map(t => t.groupId).filter(Boolean)).size

  const push = useCallback((role, text, extra = {}) => {
    setLog(prev => [...prev, { id: idRef.current++, role, text, ...extra }])
    return idRef.current - 1
  }, [])

  const updateLast = useCallback((id, patch) => {
    setLog(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }, [])

  const applyIntent = useCallback((intent) => {
    if (intent.type === 'status') {
      return describeSessions(tabs)
    } else if (intent.type === 'prompt') {
      const targets = runningTargets(tabs, intent.target)
      if (!targets.length) {
        onPrompt && null
        return `No ${targetName(intent.target)} running right now -- say "${intent.target === 'all' ? 'build team here' : intent.target + ' here'}" first.`
      }
      const where = targets.length > 1 ? ` (${targets.length} sessions)` : ''
      onPrompt?.({ target: intent.target, text: intent.text })
      return `Sent to ${targetName(intent.target)}${where}: "${intent.text}"`
    } else if (intent.type === 'focus') {
      const targets = runningTargets(tabs, intent.target)
      if (!targets.length) return `No ${targetName(intent.target)} running.`
      onFocus?.(intent.target)
      return `Jumped to ${targetName(intent.target)}.`
    } else if (intent.type === 'launch') {
      onLaunch({ cwd: intent.cwd, agents: intent.agents, groupLabel: intent.groupLabel })
      return `Spinning up ${summarize(intent.agents)} in ${pathLabel(intent.cwd)}.`
    } else if (intent.type === 'open-launcher') {
      onOpenLauncher()
      return 'Opening the launcher.'
    } else if (intent.type === 'run') {
      onRun(intent.input)
      return `Running "${intent.input}".`
    }
    return null
  }, [tabs, onPrompt, onFocus, onLaunch, onOpenLauncher, onRun])

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
      const gen = streamer(newHistory.map(m => ({ role: m.role, content: m.content })), { tabs, activeCwd })
      for await (const chunk of gen) {
        if (abort.signal.aborted) break
        full += chunk
        updateLast(msgId, { text: full.replace(/ACTION:[^\n]*/g, '').trim(), streaming: true })
      }
    } catch (e) {
      full = e.message?.includes('401') ? "Invalid API key -- check Settings." : `AI error: ${e.message}`
      updateLast(msgId, { text: full, streaming: false })
      setStreaming(false)
      return true
    }

    const { message, action } = parseAIResponse(full)
    const displayText = message || full

    // Apply any action returned by the AI.
    let actionFeedback = ''
    if (action) {
      const fb = applyIntent(action)
      if (fb && fb !== displayText) actionFeedback = ''
    }

    const finalText = actionFeedback ? `${displayText}\n${actionFeedback}` : displayText
    updateLast(msgId, { text: finalText, streaming: false })
    setStreaming(false)

    // TTS: prefer ElevenLabs if configured, fall back to Web Speech API.
    if (voiceEnabled && settings.ttsEnabled) {
      const ttsText = finalText.replace(/ACTION:[^\n]*/g, '').trim()
      if (settings.elevenLabsKey && settings.elevenLabsVoice) {
        elevenLabsSpeak(ttsText, settings.elevenLabsKey, settings.elevenLabsVoice)
      } else {
        speak(ttsText, { rate: settings.ttsRate, pitch: settings.ttsPitch, voiceURI: settings.ttsVoice })
      }
    }

    setAiMessages([...newHistory, { role: 'assistant', content: full }])
    return true
  }, [settings, aiMessages, tabs, activeCwd, push, updateLast, applyIntent, voiceEnabled])

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
    const intent = parseIntent(command, activeCwd, dirs)
    let response = ''

    if (intent.type === 'status') {
      response = describeSessions(tabs)
    } else if (intent.type === 'prompt') {
      const targets = runningTargets(tabs, intent.target)
      if (!targets.length) {
        response = `No ${targetName(intent.target)} running right now -- say "${intent.target === 'all' ? 'build team here' : intent.target + ' here'}" and I'll launch one first.`
      } else {
        const where = targets.length > 1 ? ` (${targets.length} of them)` : ''
        response = `Sending to ${targetName(intent.target)}${where}: "${intent.text}".`
        onPrompt?.({ target: intent.target, text: intent.text })
      }
    } else if (intent.type === 'focus') {
      const targets = runningTargets(tabs, intent.target)
      if (!targets.length) {
        response = `No ${targetName(intent.target)} to focus -- nothing by that name is running.`
      } else {
        response = `Jumping to ${targetName(intent.target)}.`
        onFocus?.(intent.target)
      }
    } else if (intent.type === 'launch') {
      response = `On it -- spinning up ${summarize(intent.agents)} in ${pathLabel(intent.cwd)}. They'll open as a workspace.`
      onLaunch({ cwd: intent.cwd, agents: intent.agents, groupLabel: intent.groupLabel })
    } else if (intent.type === 'open-launcher') {
      response = 'Opening the launcher so you can dial in the swarm.'
      onOpenLauncher()
    } else {
      response = `Running "${intent.input}" in the active session.`
      onRun(intent.input)
    }

    push('seducia', response)

    if (voiceEnabled && settings.ttsEnabled) {
      if (settings.elevenLabsKey && settings.elevenLabsVoice) {
        elevenLabsSpeak(response, settings.elevenLabsKey, settings.elevenLabsVoice)
      } else {
        speak(response, { rate: settings.ttsRate, pitch: settings.ttsPitch, voiceURI: settings.ttsVoice })
      }
    }
  }, [streaming, aiEnabled, activeCwd, dirs, tabs, push, handleAI, onPrompt, onFocus, onLaunch, onOpenLauncher, onRun, voiceEnabled, settings])

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

  const hasAIKey = settings.seduciaProvider === 'cli' || !!(settings.anthropicKey || settings.openaiKey)

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
              <span style={{ fontSize: docked ? 13 : 14.5, fontWeight: 900, color: '#f1f4f6' }}>Seducia</span>
              {aiEnabled && hasAIKey && (
                <span style={{ fontSize: 9, fontWeight: 800, color: accent, background: rgba(accent, 0.15), border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 99, padding: '1px 6px', letterSpacing: 0.5 }}>AI</span>
              )}
            </div>
            <div style={{ fontSize: 10.5, color: '#76808a', marginTop: 1 }}>
              {tabs.length} session{tabs.length === 1 ? '' : 's'}{groups ? ` · ${groups} workspace${groups === 1 ? '' : 's'}` : ''}
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
                color: handsFree ? accent : '#5a646d',
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
              style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #20272e', background: '#11151a', color: '#8a939c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
      </div>

      {/* No AI key notice */}
      {!hasAIKey && can(planId, 'seduciaAI') && (
        <div style={{ margin: '8px 10px 0', padding: '8px 12px', borderRadius: 8, background: rgba(accent, 0.08), border: `1px solid ${rgba(accent, 0.2)}`, fontSize: 11, color: '#aab3bb' }}>
          Add an API key in <strong style={{ color: accent }}>Settings → AI</strong> to enable AI responses.
        </div>
      )}
      {!can(planId, 'seduciaAI') && (
        <div style={{ margin: '8px 10px 0', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,183,77,0.07)', border: '1px solid rgba(255,183,77,0.2)', fontSize: 11, color: '#aab3bb' }}>
          Upgrade to <strong style={{ color: '#ffb74d' }}>Quiet</strong> or higher to enable AI mode.
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
            <div
              style={{
                maxWidth: '84%',
                fontSize: 12.5,
                lineHeight: 1.55,
                padding: '8px 11px',
                borderRadius: 12,
                border: `1px solid ${entry.role === 'you' ? rgba(accent, 0.4) : '#1b2127'}`,
                background: entry.role === 'you' ? rgba(accent, 0.12) : '#0f1318',
                color: entry.role === 'you' ? '#f1f4f6' : '#cdd5dc',
                borderTopRightRadius: entry.role === 'you' ? 4 : 12,
                borderTopLeftRadius: entry.role === 'you' ? 12 : 4,
                whiteSpace: 'pre-wrap'
              }}
            >
              {entry.text}
              {entry.streaming && <span style={{ display: 'inline-block', width: 8, height: 12, background: accent, borderRadius: 2, marginLeft: 3, verticalAlign: 'middle', animation: 'sush-blink 0.8s step-start infinite' }} />}
            </div>
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
            style={{ fontSize: 11, fontWeight: 800, color: '#aab3bb', background: '#11151a', border: `1px solid ${rgba(accent, 0.22)}`, borderRadius: 999, padding: '4px 10px', cursor: streaming ? 'default' : 'pointer', opacity: streaming ? 0.5 : 1 }}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Composer */}
      <div style={{ padding: '0 12px 12px' }}>
        <div className="sush-omni flex items-center" style={{ height: 44, gap: 8 }}>
          <Icon name="sparkles" size={15} color={streaming ? accent : '#5a646d'} className={streaming ? 'sush-spin' : undefined} />
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
            style={{ flex: 1, minWidth: 0, height: '100%', background: 'transparent', border: 'none', color: '#f1f4f6', outline: 'none', fontSize: 13 }}
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
              style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: value.trim() ? accent : '#1c2126', color: value.trim() ? '#0a0a0a' : '#5a646d', cursor: value.trim() ? 'pointer' : 'default', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
