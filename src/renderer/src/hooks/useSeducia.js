import { useEffect, useRef, useState, useCallback } from 'react'
import { getStreamer, parseAIResponse } from '../lib/ai'
import { VoiceEngine, speechRecognitionSupported } from '../lib/voice'
import { applyAction, formatReadout } from '../lib/seduciaActions'
import { pathLabel, describeSessions, parseIntent } from '../lib/seducia'

const INTRO = "I'm Seducia. Say my name or tap the orb, then tell me what to do -- 'build a team here', 'tell claude to run the tests', or 'focus codex'."

function projectIntro(scope) {
  return `Project Seducia for "${scope.label}". I run this workspace -- launch more sessions into it, prompt or close them, or ask me to read their output and report back.`
}

// The Seducia brain: conversation state, AI/intent dispatch, action execution,
// and the voice loop. Shared by the ambient orb (and reusable by any docked view).
//
// Scope: { kind: 'main' } on Home (whole-app control) or
// { kind: 'project', groupId, label, cwd } inside a workspace — Project
// Seducia sees only that workspace's sessions and keeps her own chat history
// per workspace.
export function useSeducia({
  tabs = [], activeCwd, recentSessions = [], settings = {},
  scope = { kind: 'main' }, controls = {},
  onLaunch, onRun, onPrompt, onFocus, onOpenLauncher
}) {
  const scopedTabs = scope?.groupId ? tabs.filter(t => t.groupId === scope.groupId) : tabs
  const scopedCwd = scope?.cwd || activeCwd
  const dirs = [
    ...(scopedCwd ? [{ cwd: scopedCwd, label: pathLabel(scopedCwd) }] : []),
    ...recentSessions.map(s => ({ cwd: s.cwd, label: s.label }))
  ]

  const [log, setLog] = useState([{ id: 0, role: 'seducia', text: INTRO, streaming: false }])
  const [aiMessages, setAiMessages] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [voiceState, setVoiceState] = useState('idle') // idle|listening|thinking|speaking
  const [partial, setPartial] = useState('')
  const [voiceError, setVoiceError] = useState('')

  const idRef = useRef(1)
  const abortRef = useRef(null)
  const engineRef = useRef(null)
  const handleRef = useRef(null)
  const logRef = useRef(log)
  logRef.current = log
  // Latest state mirrored into refs so the engine's callbacks never go stale.
  const stateRef = useRef({})
  stateRef.current = { tabs, scopedTabs, scopedCwd, activeCwd, dirs, settings, aiMessages, scope, controls }

  // One chat per scope: leaving a workspace parks its conversation; coming
  // back restores it. Main has its own thread under the 'main' key.
  const scopeKey = scope?.groupId || 'main'
  const convosRef = useRef(new Map())
  const prevScopeRef = useRef(scopeKey)
  useEffect(() => {
    if (prevScopeRef.current === scopeKey) return
    convosRef.current.set(prevScopeRef.current, {
      log: logRef.current,
      aiMessages: stateRef.current.aiMessages
    })
    const saved = convosRef.current.get(scopeKey)
    setLog(saved?.log || [{
      id: idRef.current++,
      role: 'seducia',
      text: scope?.kind === 'project' ? projectIntro(scope) : INTRO,
      streaming: false
    }])
    setAiMessages(saved?.aiMessages || [])
    prevScopeRef.current = scopeKey
  }, [scopeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const aiEnabled = !!getStreamer(settings)
  const hasAI = aiEnabled  // CLI is the only provider; AI is on whenever the bridge is present
  const ttsOn = !!settings.ttsEnabled

  const push = useCallback((role, text, extra = {}) => {
    const id = idRef.current++
    setLog(prev => [...prev, { id, role, text, ...extra }])
    return id
  }, [])
  const updateMsg = useCallback((id, patch) => {
    setLog(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }, [])

  // Execute one action through the shared executor. Returns { text, readout? }.
  const applyIntent = useCallback(async (intent) => {
    const { scopedTabs, scopedCwd, scope, controls } = stateRef.current
    return applyAction(intent, {
      tabs: scopedTabs,
      scope,
      controls,
      activeCwd: scopedCwd,
      onLaunch, onRun, onPrompt, onFocus, onOpenLauncher
    })
  }, [onPrompt, onFocus, onLaunch, onOpenLauncher, onRun])

  const speakReply = useCallback((text) => {
    const engine = engineRef.current
    if (ttsOn && engine) engine.speak(text)
    else engine?.setThinking(false)
  }, [ttsOn])

  // One AI turn. When the model asks to read session output, the readout is
  // fed back as a hidden user turn and she answers again — a bounded review
  // loop (depth ≤ 2), so "launch 3 codexes, then check on them" really checks.
  const runTurn = useCallback(async (history, depth = 0) => {
    const { settings, scopedTabs, scopedCwd, scope } = stateRef.current
    const streamer = getStreamer(settings)
    if (!streamer) return false

    const msgId = push('seducia', '', { streaming: true })
    setStreaming(true)
    engineRef.current?.setThinking(true)

    const abort = new AbortController()
    abortRef.current = abort
    let full = ''
    try {
      const gen = streamer(history.map(m => ({ role: m.role, content: m.content })), { tabs: scopedTabs, activeCwd: scopedCwd, scope })
      for await (const chunk of gen) {
        if (abort.signal.aborted) break
        full += chunk
        updateMsg(msgId, { text: full.replace(/(?:ACTION|ENGINE):[^\n]*/g, '').trim(), streaming: true })
      }
    } catch (e) {
      const msg = e.message?.includes('401') ? 'Invalid API key -- check Settings.' : `AI error: ${e.message}`
      updateMsg(msgId, { text: msg, streaming: false })
      setStreaming(false)
      engineRef.current?.setThinking(false)
      return true
    }

    const { message, actions: parsedActions, engine } = parseAIResponse(full)
    const display = message || full
    // A stopped stream may be cut mid-ACTION line — never execute actions
    // parsed out of a partial response.
    const actions = abort.signal.aborted ? [] : parsedActions

    const feedback = []
    const readouts = []
    for (const act of actions) {
      const res = await applyIntent(act)
      if (res?.text && res.text !== display) feedback.push(res.text)
      if (res?.readout?.length) readouts.push(...res.readout)
    }

    const finalText = [display, ...feedback].filter(Boolean).join('\n')
    updateMsg(msgId, { text: finalText, streaming: false, engine })
    const nextHistory = [...history, { role: 'assistant', content: full }]

    if (readouts.length && depth < 2 && !abort.signal.aborted) {
      // Hidden turn: the session output goes to the model, not the transcript.
      const followUp = [...nextHistory, { role: 'user', content: formatReadout(readouts) }]
      setAiMessages(followUp)
      return runTurn(followUp, depth + 1)
    }

    setStreaming(false)
    setAiMessages(nextHistory)
    speakReply(display)
    return true
  }, [push, updateMsg, applyIntent, speakReply])

  const runAI = useCallback(async (command) => {
    const { settings, aiMessages } = stateRef.current
    if (!getStreamer(settings)) return false
    const history = [...aiMessages, { role: 'user', content: command }]
    setAiMessages(history)
    return runTurn(history, 0)
  }, [runTurn])

  const handle = useCallback(async (input) => {
    const command = String(input || '').trim()
    if (!command || streaming) return
    push('you', command)
    setPartial('')

    if (aiEnabled) { await runAI(command); return }

    // Deterministic fallback when no AI provider is configured.
    const { scopedCwd, dirs, scopedTabs } = stateRef.current
    const intent = parseIntent(command, scopedCwd, dirs)
    let reply
    if (intent.type === 'status') reply = describeSessions(scopedTabs)
    else reply = (await applyIntent(intent))?.text || `Running "${command}".`
    push('seducia', reply)
    speakReply(reply)
  }, [streaming, aiEnabled, push, runAI, applyIntent, speakReply])
  handleRef.current = handle

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setStreaming(false)
    engineRef.current?.stopSpeaking()
    engineRef.current?.setThinking(false)
  }, [])

  // ---- Voice engine lifecycle ------------------------------------------
  useEffect(() => {
    const engine = new VoiceEngine({
      onState: setVoiceState,
      onPartial: setPartial,
      onCommand: (text) => { setPartial(''); handleRef.current?.(text) },
      onError: (msg) => { setVoiceError(msg) }
    })
    engineRef.current = engine
    return () => engine.destroy()
    // handle is stable enough via refs; we intentionally mount once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the engine's config in sync with settings (system TTS only now).
  useEffect(() => {
    engineRef.current?.configure({
      webSpeechVoice: settings.ttsVoice,
      rate: settings.ttsRate
    })
  }, [settings.ttsVoice, settings.ttsRate])

  const listen = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return
    // Tap again while listening to STOP and transcribe (submit) — matches Hush.
    // Whisper is record-then-transcribe, so a second tap is "send", not "cancel".
    if (voiceState === 'listening') engine.finishListening()
    else engine.listenOnce()
  }, [voiceState])

  return {
    log, streaming, handle, stop, applyIntent,
    voiceState, partial, listen,
    aiEnabled, hasAI, ttsOn, voiceError,
    micSupported: speechRecognitionSupported
  }
}
