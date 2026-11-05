import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import Icon from './Icons'
import { accentVars } from '../lib/ui'
import { getStreamer, parseAIResponse } from '../lib/ai'
import { applyAction } from '../lib/seduciaActions'
import SushOrb from './SushOrb'
import ProviderLogo from './ProviderLogo'
import { renderMarkdown } from '../lib/markdown'
import { agentById } from '../lib/agents'
import { useMicLevel } from '../hooks/useMicLevel'
import { activeThread, newThread, nextEntryId, updateThread, useSeduciaThreads } from '../lib/seduciaThreads'
import { describeGatedIntent, needsApproval } from '../lib/seduciaSafety'
import { parseIntent as parseSharedIntent, pathLabel as sharedPathLabel, summarize as summarizeAgents } from '../lib/seducia'

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
  // The orb animates while Seducia speaks.
  const signal = on => window.dispatchEvent(new CustomEvent('sush:tts', { detail: { speaking: on } }))
  utt.onstart = () => signal(true)
  utt.onend = () => signal(false)
  utt.onerror = () => signal(false)
  window.speechSynthesis.speak(utt)
}

// Three up front (Ctrl/⌘ 1–3 from the composer), the rest behind "More".
const QUICK = [
  { label: 'Build team', send: 'build team here', icon: 'users', hint: 'Spin up a crew in this project' },
  { label: 'Status', send: 'status', icon: 'activity', hint: 'Sessions, limits, usage' },
  { label: 'Gather thoughts', send: 'gather thoughts', icon: 'sparkles', hint: 'What every agent is doing' },
  { label: '3× Claude', send: '3 claude here', icon: 'rocket', hint: 'Three Claude Code sessions here' },
  { label: 'Doctor', send: 'doctor', icon: 'check', hint: 'Check CLIs and logins' },
  { label: 'Next steps', send: 'what should each agent do next?', icon: 'send', hint: 'Suggestions for the crew' }
]

// Anything a model proposes that changes what runs (launch, run, close) waits
// in a banner attached to the composer and needs a click (seduciaSafety):
// model output can carry text an agent read from the web or a file.
function ApprovalBanner({ items, onResolve }) {
  const goRef = useRef(onResolve)
  goRef.current = onResolve
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); goRef.current(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="sz-banner" role="alertdialog" aria-label="Seducia needs your approval">
      <div className="sz-banner-head">
        <Icon name="shield" size={13} />
        <span>Seducia wants to</span>
      </div>
      {items.map(item => {
        const d = describeGatedIntent(item.intent, { label: id => agentById(id)?.label || id })
        const ids = item.intent.type === 'launch' ? [...new Set((item.intent.agents || []).map(a => a?.id).filter(id => agentById(id)))] : []
        return (
          <div key={item.key} className="sz-banner-item">
            <span className={`sz-banner-kind is-${item.intent.type}`}>
              {ids.length ? ids.slice(0, 3).map(id => <ProviderLogo key={id} provider={id} size={12} />) : <Icon name={item.intent.type === 'run' ? 'terminal' : 'x'} size={12} />}
              {d.kind}
            </span>
            <span className={`sz-banner-what${d.mono ? ' is-mono' : ''}`}>{d.text}{d.detail ? <small>{d.detail}</small> : null}</span>
          </div>
        )
      })}
      <div className="sz-banner-actions">
        <button type="button" className="sz-btn is-quiet" onClick={() => onResolve(false)}>Skip</button>
        <button type="button" className="sz-btn is-primary" onClick={() => onResolve(true)} title="Approve (Ctrl/⌘ Enter)">
          Approve{items.length > 1 ? ' all' : ''} <span className="sz-kbd">{/Mac/i.test(navigator.platform) ? '⌘↵' : 'Ctrl ↵'}</span>
        </button>
      </div>
    </div>
  )
}

// "Working for 3s" while a reply streams, then "Worked for 4.2s · 2 actions ›"
// folding what Seducia did (T3's activity grammar). Plain-language rows, each
// with an icon; readouts expand under their row.
function useTicker(on) {
  const [, setT] = useState(0)
  useEffect(() => {
    if (!on) return undefined
    const id = setInterval(() => setT(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [on])
}
function fmtSecs(ms) {
  const s = Math.max(0, ms) / 1000
  if (s < 0.1) return 'a moment'
  return s < 10 ? `${s.toFixed(1)}s` : s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}
function ActivityGroup({ entry }) {
  const [open, setOpen] = useState(false)
  const rows = entry.activity || []
  const live = !!entry.streaming
  useTicker(live)
  if (!live && !rows.length) return null
  const took = fmtSecs((entry.doneAt || Date.now()) - (entry.startedAt || Date.now()))
  return (
    <div className={`sz-acts${open ? ' is-open' : ''}${live ? ' is-live' : ''}`}>
      <button type="button" className="sz-acts-head" onClick={() => rows.length && setOpen(v => !v)} aria-expanded={open} disabled={!rows.length}>
        <span className="sz-acts-title">{live ? `Working for ${took}` : `Worked for ${took}`}</span>
        {rows.length > 0 && <span className="sz-acts-count">{rows.length} action{rows.length === 1 ? '' : 's'}</span>}
        {rows.length > 0 && <Icon name="chevronRight" size={12} className="sz-acts-chev" />}
      </button>
      {open && (
        <div className="sz-acts-rows">
          {rows.map((r, i) => (
            <div key={i} className={`sz-act is-${r.tone || 'done'}`}>
              <span className="sz-act-icon"><Icon name={r.icon || 'check'} size={12} /></span>
              <span className="sz-act-text">{r.text}</span>
              {r.detail && <pre className="sz-act-detail sush-scroll">{r.detail}</pre>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// What an action result looks like as an activity row.
function activityRow(res) {
  if (!res) return null
  const text = typeof res === 'string' ? res : res.text
  const detail = typeof res === 'string' ? '' : res.detail || ''
  const first = String(text || '').split('\n')[0].trim()
  if (!first) return null
  const rest = [String(text).split('\n').slice(1).join('\n').trim(), detail].filter(Boolean).join('\n\n')
  const icon = /^(launch|start|spun|spin)/i.test(first) ? 'rocket'
    : /^(focus|jump|switch)/i.test(first) ? 'eye'
      : /^(sent|told|prompt|asked|brief)/i.test(first) ? 'send'
        : /(fail|error|could not|can't|cannot|no )/i.test(first) ? 'x'
          : 'check'
  return { text: first, detail: rest, icon, tone: icon === 'x' ? 'fail' : 'done' }
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
    ...(scopedCwd ? [{ cwd: scopedCwd, label: sharedPathLabel(scopedCwd) }] : []),
    ...recentSessions.map(s => ({ cwd: s.cwd, label: s.label }))
  ]

  const [value, setValue] = useState('')
  const [listening, setListening] = useState(false)
  const [handsFree, setHandsFree] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => {
    const on = e => setSpeaking(!!e.detail?.speaking)
    window.addEventListener('sush:tts', on)
    return () => window.removeEventListener('sush:tts', on)
  }, [])
  const micLevel = useMicLevel(listening)
  // Pick up where you left off: the latest conversation in each project.
  const [recentWork, setRecentWork] = useState([])
  useEffect(() => {
    if (!docked || !window.sush?.recentWork) return
    const cwds = [...new Set([
      ...tabs.map(t => t.workspaceCwd || t.sessionRootCwd || t.cwd),
      ...recentSessions.map(r => r.cwd)
    ].filter(Boolean))]
    if (!cwds.length) return
    let alive = true
    window.sush.recentWork({ cwds }).then(r => { if (alive && r?.ok) setRecentWork(r.items || []) }).catch(() => {})
    return () => { alive = false }
  }, [docked]) // eslint-disable-line react-hooks/exhaustive-deps
  const resumeWork = (w) => {
    const open = tabs.find(t => t.status !== 'exited' && t.agentId === w.agent && (t.workspaceCwd || t.sessionRootCwd || t.cwd) === w.cwd)
    if (open) { onFocus?.(open.label); return }
    const agent = agentById(w.agent)
    onLaunch?.({ cwd: w.cwd, agents: [{ id: w.agent, count: 1, command: agent?.resumeCommand || agent?.command, label: agent?.label }] })
  }
  const orbState = listening ? 'listening' : streaming ? 'thinking' : speaking ? 'speaking' : 'idle'
  // The conversation is the active thread in the shared store (the sidebar
  // lists every thread with its status). Writes are bound to the thread a
  // turn started in, so switching threads mid-reply never cross-posts.
  const threads = useSeduciaThreads()
  const thread = activeThread(threads)
  const threadId = thread.id
  const log = thread.log
  const aiMessages = thread.ai
  const setLog = useCallback(fn => updateThread(threadId, t => ({ ...t, log: fn(t.log) })), [threadId])
  const setAiMessages = useCallback(ai => updateThread(threadId, t => ({ ...t, ai })), [threadId])
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
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
    recognitionRef.current = null
    streamAbortRef.current?.abort()
    window.speechSynthesis?.cancel()
  }, [])

  const groups = new Set(scopedTabs.map(t => t.groupId).filter(Boolean)).size

  const push = useCallback((role, text, extra = {}) => {
    // Take the id now: the state updater runs later, so reading the counter
    // after setLog returned a stale id and replies overwrote older entries.
    const id = nextEntryId()
    setLog(prev => [...prev, { id, role, text, ...extra }])
    return id
  }, [setLog])

  const logRef = useRef(log)
  logRef.current = log

  const updateLast = useCallback((id, patch) => {
    setLog(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }, [setLog])

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
    const detail = res.readout?.length
      ? res.readout.map(r => `── ${r.label} ──\n${String(r.text || '').slice(-600)}`).join('\n\n')
      : ''
    return { text: res.text || '', detail }
  }, [scopedTabs, scope, controls, scopedCwd, onPrompt, onFocus, onLaunch, onOpenLauncher, onRun])

  // Model-proposed launch/run/close actions wait for a click. Resolving runs
  // (or skips) all of a message's pending actions and logs each as activity.
  const resolvingRef = useRef(new Set())
  const resolveApprovals = useCallback(async (entryId, go) => {
    if (resolvingRef.current.has(entryId)) return
    resolvingRef.current.add(entryId)
    const entry = logRef.current.find(e => e.id === entryId)
    const pendingItems = (entry?.approvals || []).filter(a => !a.status)
    const rows = []
    for (const item of pendingItems) {
      const d = describeGatedIntent(item.intent, { label: id => agentById(id)?.label || id })
      if (go) {
        const res = await applyIntent(item.intent)
        const row = activityRow(res) || { text: `${d.kind} ${d.text}`, icon: 'check', tone: 'done' }
        rows.push(item.intent.type === 'launch' ? { ...row, icon: 'rocket' } : row)
      } else {
        rows.push({ text: `Skipped: ${d.kind.toLowerCase()} ${d.text}`, icon: 'x', tone: 'fail' })
      }
    }
    setLog(prev => prev.map(e => e.id === entryId
      ? { ...e, approvals: e.approvals.map(a => ({ ...a, status: a.status || (go ? 'approved' : 'skipped') })), activity: [...(e.activity || []), ...rows] }
      : e))
  }, [applyIntent, setLog])

  const handleAI = useCallback(async (command) => {
    const streamer = getStreamer(settings)
    if (!streamer) return false

    const userMsg = { role: 'user', content: command }
    const newHistory = [...aiMessages, userMsg]
    setAiMessages(newHistory)

    const msgId = push('seducia', '', { streaming: true, startedAt: Date.now() })
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
      full = e.message?.includes('401') ? 'CLI auth failed -- check the selected agent CLI login.' : `AI error: ${e.message}`
      updateLast(msgId, { text: full, streaming: false, doneAt: Date.now(), error: true })
      setStreaming(false)
      return true
    }

    const { message, actions: parsedActions, engine } = parseAIResponse(full)
    const displayText = message || full

    // A stopped stream may have been cut mid-ACTION line — never execute
    // actions parsed out of a partial response.
    const actions = abort.signal.aborted ? [] : parsedActions

    // Gated actions (launch, run, close) wait for a click; the rest apply now.
    const gated = actions.filter(a => a && needsApproval(a))
    const activity = []
    for (const act of actions) {
      if (!act || needsApproval(act)) continue
      const row = activityRow(await applyIntent(act))
      if (row && row.text !== displayText) activity.push(row)
    }

    const finalText = displayText
    updateLast(msgId, {
      text: finalText, streaming: false, engine, activity, doneAt: Date.now(),
      approvals: gated.map((intent, i) => ({ key: `${msgId}:${i}`, intent, status: null }))
    })
    setStreaming(false)

    // TTS: system voice (ElevenLabs streaming was retired).
    if (voiceEnabled && settings.ttsEnabled) {
      const ttsText = finalText.replace(/ACTION:[^\n]*/g, '').trim()
      speak(ttsText, { rate: settings.ttsRate, pitch: settings.ttsPitch, voiceURI: settings.ttsVoice })
    }

    setAiMessages([...newHistory, { role: 'assistant', content: full }])
    return true
  }, [settings, aiMessages, setAiMessages, scopedTabs, scopedCwd, scope, push, updateLast, applyIntent, voiceEnabled])

  const handle = useCallback(async (input) => {
    const command = input.trim()
    if (!command || streaming) return
    push('you', command)
    setValue('')

    // Try the CLI-backed AI path first when an agent bridge is available.
    if (aiEnabled) {
      await handleAI(command)
      return
    }

    // Deterministic fallback.
    const intent = parseSharedIntent(command, scopedCwd, dirs)
    const startedAt = Date.now()
    const res = await applyIntent(intent)
    const response = res?.text || `Running "${command}".`
    const row = res?.detail ? { ...activityRow(res), text: 'Read the latest output', icon: 'eye' } : null

    push('seducia', response, { startedAt, doneAt: Date.now(), activity: row ? [row] : [] })

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
      // Not after the panel has closed (it used to re-arm the mic on a
      // closed panel).
      if (handsFree) setTimeout(() => { if (recognitionRef.current === rec) toggleVoice() }, 400)
    }
    recognitionRef.current = rec
    setListening(true)
    try { rec.start() } catch { setListening(false) }
  }, [listening, voiceEnabled, handsFree, handle])

  const hasCliAI = aiEnabled
  const pending = log.find(e => e.approvals?.some(a => !a.status)) || null
  const fresh = log.length === 0
  const [moreOpen, setMoreOpen] = useState(false)
  const modKey = /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl '

  // Orb, hero to header: on the first message the big welcome orb flies up
  // into the header slot (FLIP with the Web Animations API).
  const heroRef = useRef(null)
  const headOrbRef = useRef(null)
  const heroRect = useRef(null)
  const wasFresh = useRef(fresh)
  if (fresh && heroRef.current) heroRect.current = heroRef.current.getBoundingClientRect()
  useLayoutEffect(() => {
    const from = heroRect.current
    const el = headOrbRef.current
    if (wasFresh.current && !fresh && from && el && !document.documentElement.classList.contains('sush-motion-reduced')) {
      const to = el.getBoundingClientRect()
      if (to.width && from.width) {
        const dx = from.left + from.width / 2 - (to.left + to.width / 2)
        const dy = from.top + from.height / 2 - (to.top + to.height / 2)
        el.animate([
          { transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width})`, opacity: 0.9 },
          { transform: 'translate(0, 0) scale(1)', opacity: 1 }
        ], { duration: 520, easing: 'cubic-bezier(.2, .9, .25, 1)' })
      }
    }
    wasFresh.current = fresh
  }, [fresh])
  const voiceOk = voiceEnabled && !!SpeechRecognition

  // Composer textarea grows with its content up to ~6 lines.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 148)}px`
  }, [value])

  const body = (
    <div className={`sz-pane sush-fade-up${docked ? ' is-docked' : ''}`}>
      <header className="sz-head">
        <span ref={headOrbRef} className={`sz-head-orb${fresh ? ' is-waiting' : ''}`}>
          <SushOrb size={docked ? 28 : 34} state={orbState} levelRef={micLevel} className="is-small" />
        </span>
        <div className="sz-head-text">
          <div className="sz-head-title">
            Seducia
            {hasCliAI && <span className="sz-tag">AI</span>}
          </div>
          <div className="sz-head-sub">
            {scope?.kind === 'project' ? `${scope.label} · ` : ''}{scopedTabs.length} session{scopedTabs.length === 1 ? '' : 's'}{scope?.kind !== 'project' && groups ? ` · ${groups} workspace${groups === 1 ? '' : 's'}` : ''}
          </div>
        </div>
        {!fresh && (
          <button type="button" className="sz-icon-btn" onClick={() => { newThread(); requestAnimationFrame(() => inputRef.current?.focus()) }} title="New chat" aria-label="New chat">
            <Icon name="edit" size={14} />
          </button>
        )}
        {voiceOk && (
          <button
            type="button"
            className={`sz-icon-btn${handsFree ? ' is-on' : ''}`}
            onClick={() => setHandsFree(prev => !prev)}
            title={handsFree ? 'Hands-free is on: voice sends by itself' : 'Hands-free: send when you stop talking'}
            aria-pressed={handsFree}
          >
            <Icon name="radio" size={14} />
          </button>
        )}
        {!docked && (
          <button type="button" className="sz-icon-btn" onClick={onClose} title="Close (Esc)" aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        )}
      </header>

      {!hasCliAI && (
        <div className="sz-notice">
          <Icon name="info" size={13} />
          <span>Seducia thinks with your logged-in Claude, Codex, Gemini or OpenCode CLI. Sign in to one to get AI replies; simple commands work without it.</span>
        </div>
      )}

      <div ref={scrollRef} className="sz-log sush-scroll">
        {fresh && (
          <div className="sz-welcome">
            <span ref={heroRef} className="sz-hero-orb">
              <SushOrb
                size={92}
                state={orbState}
                levelRef={micLevel}
                onClick={voiceOk ? toggleVoice : undefined}
              />
            </span>
            {voiceOk && <span className="sz-orb-hint">{listening ? 'Listening… tap to stop' : 'Tap the orb to talk'}</span>}
            <h2>Hi, I'm Seducia</h2>
            <p>I run your crew. Ask me to start agents, brief them, or check where everything stands.</p>
            {recentWork.length > 0 && (
              <div className="sz-recent">
                <div className="sz-section">Pick up where you left off</div>
                {recentWork.slice(0, 3).map(w => {
                  const a = agentById(w.agent)
                  const ago = Math.max(1, Math.round((Date.now() - w.at) / 60000))
                  const when = ago < 60 ? `${ago}m ago` : ago < 1440 ? `${Math.round(ago / 60)}h ago` : `${Math.round(ago / 1440)}d ago`
                  return (
                    <button key={w.cwd + w.agent} type="button" className={`sz-work${w.question ? ' is-question' : ''}`} onClick={() => resumeWork(w)}>
                      <span className="sz-work-top">
                        <ProviderLogo provider={w.agent} size={14} />
                        <strong>{w.question ? `${a?.label || w.agent} asked you something` : `Continue: ${w.ask || 'your last task'}`}</strong>
                        <small>{sharedPathLabel(w.cwd)} · {when}</small>
                      </span>
                      {w.last && <span className="sz-work-last">{w.last}</span>}
                      <span className="sz-work-meta">
                        {w.files ? `${w.files} file${w.files === 1 ? '' : 's'} touched · ` : ''}{w.question ? 'Answer' : 'Resume'}
                        <Icon name="arrowRight" size={11} />
                      </span>
                    </button>
                  )
                })}
                <div className="sz-section">Or ask me to</div>
              </div>
            )}
            <div className="sz-cards">
              {QUICK.slice(0, 3).map((q, i) => (
                <button key={q.label} type="button" className="sz-card" onClick={() => handle(q.send)} disabled={streaming} title={`${q.hint} (${modKey}${i + 1})`}>
                  <span className="sz-card-top">
                    <span className="sz-card-icon"><Icon name={q.icon} size={15} /></span>
                    <span className="sz-card-key">{modKey}{i + 1}</span>
                  </span>
                  <strong>{q.label}</strong>
                  <small>{q.hint}</small>
                </button>
              ))}
            </div>
            <button type="button" className={`sz-more${moreOpen ? ' is-open' : ''}`} onClick={() => setMoreOpen(v => !v)} aria-expanded={moreOpen}>
              {moreOpen ? 'Fewer' : 'More'} <Icon name="chevronDown" size={12} />
            </button>
            <div className={`sz-more-panel${moreOpen ? ' is-open' : ''}`} aria-hidden={!moreOpen}>
              <div className="sz-more-inner">
                {QUICK.slice(3).map(q => (
                  <button key={q.label} type="button" className="sz-chip-btn" tabIndex={moreOpen ? 0 : -1} onClick={() => handle(q.send)} disabled={streaming}>
                    <Icon name={q.icon} size={13} />{q.label}<small>{q.hint}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {(fresh ? [] : log).map((entry, i, all) => {
          if (entry.role === 'you') {
            return (
              <div key={entry.id} className="sz-msg is-you">
                <div className="sz-you">{entry.text}</div>
              </div>
            )
          }
          // The name row only opens a run of Seducia messages.
          const opensRun = i === 0 || all[i - 1].role !== 'seducia'
          return (
            <div key={entry.id} className={`sz-msg is-her${entry.error ? ' is-error' : ''}`}>
              {opensRun && (
                <div className="sz-her-name">
                  <SushOrb size={18} state={entry.streaming ? 'thinking' : 'idle'} className="is-small is-chip" />
                  <span>Seducia</span>
                </div>
              )}
              <ActivityGroup entry={entry} />
              {entry.text
                ? <div className="sz-md">{renderMarkdown(entry.text, accent)}{entry.streaming && <span className="sz-caret" aria-hidden />}</div>
                : entry.streaming ? <div className="sz-thinking" aria-label="Thinking"><i /><i /><i /></div> : null}
              {entry.engine && !entry.streaming && (
                <div className="sz-via">
                  <ProviderLogo provider={entry.engine} size={11} />
                  <span>via {agentById(entry.engine)?.label || entry.engine}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="sz-dock">
        <div className={`sz-compose${listening ? ' is-listening' : ''}${pending ? ' has-banner' : ''}`}>
          {pending && (
            <ApprovalBanner
              key={pending.id}
              items={pending.approvals.filter(a => !a.status)}
              onResolve={go => resolveApprovals(pending.id, go)}
            />
          )}
          <textarea
            ref={inputRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) { e.preventDefault(); handle(value) }
              // Ctrl/⌘ 1–3 run the welcome cards on a fresh chat.
              if (fresh && (e.metaKey || e.ctrlKey) && !e.altKey && /^[123]$/.test(e.key)) {
                e.preventDefault(); e.stopPropagation()
                handle(QUICK[Number(e.key) - 1].send)
              }
            }}
            placeholder={listening ? 'Listening…' : streaming ? 'Seducia is working…' : 'Launch, brief, or ask anything'}
            disabled={streaming}
            spellCheck={false}
            aria-label="Message Seducia"
          />
          <div className="sz-compose-bar">
            {voiceOk && (
              <button
                type="button"
                className={`sz-icon-btn is-mic${listening ? ' is-live' : ''}`}
                onClick={toggleVoice}
                title={listening ? 'Stop listening' : handsFree ? 'Speak (hands-free on)' : 'Dictate'}
                aria-pressed={listening}
              >
                <Icon name="mic" size={14} />
              </button>
            )}
            {handsFree && <span className="sz-chip"><Icon name="radio" size={11} />Hands-free</span>}
            <span className="sz-compose-hint">{streaming ? '' : 'Enter to send · Shift+Enter for a new line'}</span>
            {streaming ? (
              <button
                type="button"
                className="sz-send is-stop"
                onClick={() => { streamAbortRef.current?.abort(); setStreaming(false) }}
                title="Stop"
                aria-label="Stop"
              >
                <span className="sz-stop-square" />
              </button>
            ) : (
              <button
                type="button"
                className="sz-send"
                onClick={() => handle(value)}
                disabled={!value.trim()}
                title="Send"
                aria-label="Send"
              >
                <Icon name="arrowUp" size={15} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  if (docked) return <div className="sz-root" style={accentVars(accent)}>{body}</div>

  return (
    <div
      className="sz-root sz-overlay"
      style={accentVars(accent)}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {body}
    </div>
  )
}
