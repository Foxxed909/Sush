import React, { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'
import { speechRecognitionSupported } from '../lib/voice'

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

// Hush — Sush's voice-to-text tool. Tap the mic (or Ctrl+Shift+S anywhere,
// including inside a terminal), speak, and the words are typed into the
// focused terminal and SENT (auto-send; settings.hushAutoSend=false keeps a
// review step instead). Separate from Seducia on purpose: Hush is dictation,
// not an assistant — your words go in verbatim, nothing is interpreted.
const ERROR_HINTS = {
  'not-allowed': 'Microphone permission denied - allow it for Sush in Windows settings.',
  'service-not-allowed': 'Speech service unavailable on this machine.',
  'no-speech': "Didn't hear anything - try again, a touch louder.",
  'audio-capture': 'No microphone found.',
  'aborted': '',  // user-initiated stop, not an error
  'network': 'Speech service needs internet - are you online?'
}

export default function Hush({ accent, enabled = true, autoSend = true, onInsert }) {
  const [state, setState] = useState('idle')   // idle | listening | flash | error
  const [partial, setPartial] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const recRef = useRef(null)
  const timersRef = useRef([])
  const manualStopRef = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state

  // Every transient state flip goes through here so unmount can clear them —
  // a fire-and-forget setTimeout used to setState on an unmounted component.
  const later = useCallback((fn, ms) => {
    timersRef.current.push(setTimeout(fn, ms))
  }, [])

  const stop = useCallback(() => {
    // A deliberate stop is not a failure: without this flag, onend fired the
    // "Didn't catch that / wake word" warning every time you tapped the mic
    // off before a final result landed.
    manualStopRef.current = true
    setPartial('')
    setState('idle')
    try { recRef.current?.stop() } catch {}
  }, [])

  const fail = useCallback((msg) => {
    setPartial('')
    if (!msg) { setState('idle'); return }
    setErrMsg(msg)
    setState('error')
    later(() => { setErrMsg(''); setState('idle') }, 2600)
  }, [later])

  const start = useCallback(() => {
    if (!SR || stateRef.current === 'listening') return
    // Kill any straggler before binding a new recognizer — a replaced
    // instance kept live handlers and could ghost-insert into the terminal.
    try { recRef.current?.abort() } catch {}
    manualStopRef.current = false
    const rec = new SR()
    rec.lang = navigator.language || 'en-US'
    rec.interimResults = true
    rec.continuous = false
    let got = false
    rec.onresult = (e) => {
      const text = Array.from(e.results).map(r => r[0].transcript).join('').trim()
      setPartial(text)
      if (e.results[e.results.length - 1].isFinal && text) {
        got = true
        onInsert?.(text)
        setState('flash')
        later(() => { setPartial(''); setState('idle') }, 1100)
      }
    }
    rec.onerror = (e) => {
      got = true
      fail(ERROR_HINTS[e?.error] ?? `Speech recognition error: ${e?.error || 'unknown'}`)
    }
    rec.onend = () => {
      // Ended without a final result OR an error event (Chrome does this when
      // the mic is held by another recognizer, e.g. Seducia's wake word).
      if (!got && !manualStopRef.current && stateRef.current === 'listening') {
        fail("Didn't catch that. If Seducia's wake word is on, turn it off - only one listener can hold the mic.")
      }
    }
    recRef.current = rec
    setPartial('')
    setErrMsg('')
    setState('listening')
    try { rec.start() } catch { fail('Could not start the microphone.') }
  }, [onInsert, fail, later])

  const toggle = useCallback(() => {
    if (stateRef.current === 'listening') stop()
    else start()
  }, [start, stop])

  // App-level hotkey (Ctrl+Shift+S) arrives as a window event so terminals,
  // modals, and the home screen all reach the same toggle. Routed through a
  // ref so the listener is subscribed exactly once.
  const toggleRef = useRef(toggle)
  toggleRef.current = toggle
  useEffect(() => {
    const handler = () => toggleRef.current()
    window.addEventListener('sush:hush-toggle', handler)
    return () => window.removeEventListener('sush:hush-toggle', handler)
  }, [])

  useEffect(() => () => {
    try { recRef.current?.abort() } catch {}
    timersRef.current.forEach(clearTimeout)
  }, [])

  if (!enabled || !speechRecognitionSupported) return null
  const listening = state === 'listening'
  const flash = state === 'flash'
  const errored = state === 'error'

  return (
    <div style={{ position: 'fixed', left: 14, bottom: 36, zIndex: 340, display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={toggle}
        title={listening ? 'Stop dictation' : 'Hush - speak into the focused terminal (Ctrl+Shift+S)'}
        className={`flex items-center justify-center${listening ? ' sush-orb' : ''}`}
        style={{
          width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
          border: `1px solid ${listening ? 'transparent' : rgba(accent, 0.3)}`,
          background: listening ? '#ff5370' : flash ? '#5fd3a8' : errored ? '#ffb74d' : 'rgba(10,13,17,0.85)',
          color: listening || flash || errored ? '#05070b' : '#8a939c',
          boxShadow: listening ? '0 8px 24px rgba(255,83,112,0.4)' : '0 6px 18px rgba(0,0,0,0.4)'
        }}
      >
        <Icon name={flash ? 'check' : errored ? 'x' : 'mic'} size={15} strokeWidth={2.2} />
      </button>
      {(listening || flash || errored) && (
        <div
          data-glass
          className="seducia-pill"
          style={{ maxWidth: 'min(420px, 56vw)', padding: '8px 13px', borderRadius: 12, background: 'rgba(8,10,14,0.9)', border: `1px solid ${errored ? 'rgba(255,183,77,0.4)' : rgba(accent, 0.3)}`, boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}
        >
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1, color: flash ? '#5fd3a8' : errored ? '#ffb74d' : accent, marginBottom: 2 }}>
            {flash ? (autoSend ? 'SENT TO TERMINAL' : 'TYPED - PRESS ENTER TO SEND') : errored ? 'HUSH' : 'HUSH - LISTENING'}
          </div>
          <div style={{ fontSize: 12, color: '#e6ebef', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {errored ? errMsg : partial || 'Speak now...'}
          </div>
        </div>
      )}
    </div>
  )
}
