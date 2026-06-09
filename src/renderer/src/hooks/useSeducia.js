import { useEffect, useRef, useState, useCallback } from 'react'
import { getStreamer, parseAIResponse } from '../lib/ai'
import { can } from '../lib/plan'
import { VoiceEngine, speechRecognitionSupported } from '../lib/voice'
import {
  pathLabel, runningTargets, targetName, describeSessions,
  parseIntent, summarize
} from '../lib/seducia'

const INTRO = "I'm Seducia. Say my name or tap the orb, then tell me what to do -- 'build a team here', 'tell claude to run the tests', or 'focus codex'."

// The Seducia brain: conversation state, AI/intent dispatch, action execution,
// and the voice loop. Shared by the ambient orb (and reusable by any docked view).
export function useSeducia({
  tabs = [], activeCwd, recentSessions = [], settings = {}, planId = 'free',
  onLaunch, onRun, onPrompt, onFocus, onOpenLauncher
}) {
  const dirs = [
    ...(activeCwd ? [{ cwd: activeCwd, label: pathLabel(activeCwd) }] : []),
    ...recentSessions.map(s => ({ cwd: s.cwd, label: s.label }))
  ]

  const [log, setLog] = useState([{ id: 0, role: 'seducia', text: INTRO, streaming: false }])
  const [aiMessages, setAiMessages] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [voiceState, setVoiceState] = useState('idle') // idle|wake|listening|thinking|speaking
  const [partial, setPartial] = useState('')
  const [wakeEnabled, setWakeEnabled] = useState(false)
  const [voiceError, setVoiceError] = useState('')

  const idRef = useRef(1)
  const abortRef = useRef(null)
  const engineRef = useRef(null)
  const handleRef = useRef(null)
  // Latest state mirrored into refs so the engine's callbacks never go stale.
  const stateRef = useRef({})
  stateRef.current = { tabs, activeCwd, dirs, settings, planId, aiMessages }

  const aiEnabled = can(planId, 'seduciaAI') && !!getStreamer(settings)
  const voiceMode = can(planId, 'voiceMode')
  const hasAI = settings.seduciaProvider === 'cli' || !!(settings.anthropicKey || settings.openaiKey)
  const ttsOn = voiceMode && settings.ttsEnabled !== false && (!!settings.elevenLabsKey || settings.ttsEnabled)

  const push = useCallback((role, text, extra = {}) => {
    const id = idRef.current++
    setLog(prev => [...prev, { id, role, text, ...extra }])
    return id
  }, [])
  const updateMsg = useCallback((id, patch) => {
    setLog(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }, [])

  const applyIntent = useCallback((intent) => {
    const { tabs } = stateRef.current
    if (intent.type === 'status') return describeSessions(tabs)
    if (intent.type === 'prompt') {
      const targets = runningTargets(tabs, intent.target)
      if (!targets.length) return `No ${targetName(intent.target)} running -- say "${intent.target === 'all' ? 'build team here' : intent.target + ' here'}" first.`
      onPrompt?.({ target: intent.target, text: intent.text })
      const where = targets.length > 1 ? ` (${targets.length} sessions)` : ''
      return `Sent to ${targetName(intent.target)}${where}: "${intent.text}"`
    }
    if (intent.type === 'focus') {
      const targets = runningTargets(tabs, intent.target)
      if (!targets.length) return `No ${targetName(intent.target)} running.`
      onFocus?.(intent.target)
      return `Jumped to ${targetName(intent.target)}.`
    }
    if (intent.type === 'launch') {
      onLaunch?.({ cwd: intent.cwd, agents: intent.agents, groupLabel: intent.groupLabel })
      return `Spinning up ${summarize(intent.agents)} in ${pathLabel(intent.cwd)}.`
    }
    if (intent.type === 'open-launcher') { onOpenLauncher?.(); return 'Opening the launcher.' }
    if (intent.type === 'run') { onRun?.(intent.input); return `Running "${intent.input}".` }
    return null
  }, [onPrompt, onFocus, onLaunch, onOpenLauncher, onRun])

  const speakReply = useCallback((text) => {
    const engine = engineRef.current
    if (ttsOn && engine) engine.speak(text)
    else engine?.setThinking(false)
  }, [ttsOn])

  const runAI = useCallback(async (command) => {
    const { settings, tabs, activeCwd, aiMessages } = stateRef.current
    const streamer = getStreamer(settings)
    if (!streamer) return false

    const history = [...aiMessages, { role: 'user', content: command }]
    setAiMessages(history)
    const msgId = push('seducia', '', { streaming: true })
    setStreaming(true)
    engineRef.current?.setThinking(true)

    const abort = new AbortController()
    abortRef.current = abort
    let full = ''
    try {
      const gen = streamer(history.map(m => ({ role: m.role, content: m.content })), { tabs, activeCwd })
      for await (const chunk of gen) {
        if (abort.signal.aborted) break
        full += chunk
        updateMsg(msgId, { text: full.replace(/ACTION:[^\n]*/g, '').trim(), streaming: true })
      }
    } catch (e) {
      const msg = e.message?.includes('401') ? 'Invalid API key -- check Settings.' : `AI error: ${e.message}`
      updateMsg(msgId, { text: msg, streaming: false })
      setStreaming(false)
      engineRef.current?.setThinking(false)
      return true
    }

    const { message, action } = parseAIResponse(full)
    const display = message || full
    if (action) applyIntent(action)
    updateMsg(msgId, { text: display, streaming: false })
    setStreaming(false)
    setAiMessages([...history, { role: 'assistant', content: full }])
    speakReply(display)
    return true
  }, [push, updateMsg, applyIntent, speakReply])

  const handle = useCallback(async (input) => {
    const command = String(input || '').trim()
    if (!command || streaming) return
    push('you', command)
    setPartial('')

    if (aiEnabled) { await runAI(command); return }

    // Deterministic fallback when no AI provider is configured.
    const { activeCwd, dirs, tabs } = stateRef.current
    const intent = parseIntent(command, activeCwd, dirs)
    let reply
    if (intent.type === 'status') reply = describeSessions(tabs)
    else reply = applyIntent(intent) || `Running "${command}".`
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
      onError: (msg) => { setVoiceError(msg); setWakeEnabled(false) }
    })
    engineRef.current = engine
    return () => engine.destroy()
    // handle is stable enough via refs; we intentionally mount once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the engine's config in sync with settings.
  useEffect(() => {
    engineRef.current?.configure({
      elevenLabsKey: settings.elevenLabsKey,
      elevenLabsVoice: settings.elevenLabsVoice,
      elevenLabsModel: settings.elevenLabsModel || 'eleven_flash_v2_5',
      webSpeechVoice: settings.ttsVoice,
      rate: settings.ttsRate
    })
  }, [settings.elevenLabsKey, settings.elevenLabsVoice, settings.elevenLabsModel, settings.ttsVoice, settings.ttsRate])

  const toggleWake = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return
    setWakeEnabled(prev => {
      const next = !prev
      if (next) { setVoiceError(''); engine.startWakeWord() } else engine.stopWakeWord()
      return next
    })
  }, [])

  const listen = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return
    if (voiceState === 'listening') engine.cancelListen()
    else engine.listenOnce()
  }, [voiceState])

  return {
    log, streaming, handle, stop, applyIntent,
    voiceState, partial, wakeEnabled, toggleWake, listen,
    aiEnabled, hasAI, voiceMode, ttsOn, voiceError,
    micSupported: speechRecognitionSupported
  }
}
