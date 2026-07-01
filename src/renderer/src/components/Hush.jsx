import React, { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'
import { DictationRecorder, dictationSupported, formatCredits } from '../lib/dictation'

// Hush — Sush's voice-to-text tool. Tap the mic (or Ctrl+Shift+S anywhere,
// including inside a terminal), speak, and the words are typed into the focused
// terminal and SENT (auto-send; settings.hushAutoSend=false keeps a review step
// instead). Separate from Seducia on purpose: Hush is dictation, not an
// assistant — your words go in verbatim, nothing is interpreted.
//
// Engine: Whisper over the user's own key (handled in main). This replaced the
// browser Web Speech API, which doesn't work in Electron (no Google speech
// backend → `network` error). Capture is MediaRecorder; main does transcription
// and meters it against the local Quiet Credits bucket.

const MAX_CLIP_MS = 30000   // safety cap: a forgotten-open mic never burns credits

export default function Hush({ accent, enabled = true, autoSend = true, onInsert }) {
  const [state, setState] = useState('idle')   // idle | listening | transcribing | flash | error
  const [errMsg, setErrMsg] = useState('')
  const [credits, setCredits] = useState(null)   // { remainingSec, allowanceSec, resetAt } | null
  const recRef = useRef(null)
  const timersRef = useRef([])
  const capTimerRef = useRef(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const later = useCallback((fn, ms) => { timersRef.current.push(setTimeout(fn, ms)) }, [])

  const clearCap = useCallback(() => {
    if (capTimerRef.current) { clearTimeout(capTimerRef.current); capTimerRef.current = null }
  }, [])

  // Pull the Quiet Credits balance so the pill can show what's left.
  const refreshCredits = useCallback(async () => {
    try { const c = await window.sush?.creditsGet?.(); if (c) setCredits(c) } catch {}
  }, [])

  useEffect(() => { refreshCredits() }, [refreshCredits])

  const fail = useCallback((msg) => {
    if (!msg) { setState('idle'); return }
    setErrMsg(msg)
    setState('error')
    later(() => { setErrMsg(''); setState('idle') }, 3200)
  }, [later])

  // Stop the active capture, transcribe it, and insert the text.
  const finish = useCallback(async () => {
    clearCap()
    const rec = recRef.current
    if (!rec) { setState('idle'); return }
    recRef.current = null
    setState('transcribing')
    let clip = null
    try { clip = await rec.stop() } catch { clip = null }
    if (!clip || clip.seconds < 0.3) { fail("Didn't catch that — hold the mic a touch longer."); return }
    try {
      const res = await window.sush?.sttTranscribe?.({ audio: clip.base64, mime: clip.mime, seconds: clip.seconds })
      if (res?.credits) setCredits(res.credits)
      if (res?.ok && res.text) {
        onInsert?.(res.text)
        setState('flash')
        later(() => setState('idle'), 1100)
      } else if (res?.error === 'no-key') {
        fail('Add a Whisper key in Settings ▸ Voice to enable dictation.')
      } else if (res?.error === 'out-of-credits') {
        fail('Out of Quiet Credits this month — they refill on the 1st, or upgrade your plan.')
      } else if (res?.error) {
        fail(res.error.length > 90 ? res.error.slice(0, 90) + '…' : res.error)
      } else {
        fail("Didn't catch that. Try again, a touch louder.")
      }
    } catch (e) {
      fail(e?.message || 'Transcription failed.')
    }
  }, [clearCap, fail, later, onInsert])

  const begin = useCallback(async () => {
    if (stateRef.current === 'listening' || stateRef.current === 'transcribing') return
    // Refuse early when the bucket is empty so the mic never opens for nothing.
    if (credits && credits.remainingSec <= 0) {
      fail('Out of Quiet Credits this month — they refill on the 1st, or upgrade your plan.')
      return
    }
    const rec = new DictationRecorder()
    try {
      await rec.start()
    } catch (e) {
      const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
      fail(denied ? 'Microphone permission denied — allow it for Sush in your OS settings.'
                  : (e?.name === 'NotFoundError' ? 'No microphone found.' : 'Could not start the microphone.'))
      return
    }
    recRef.current = rec
    setErrMsg('')
    setState('listening')
    capTimerRef.current = setTimeout(() => { if (stateRef.current === 'listening') finish() }, MAX_CLIP_MS)
  }, [credits, fail, finish])

  const toggle = useCallback(() => {
    if (stateRef.current === 'listening') finish()
    else if (stateRef.current === 'idle' || stateRef.current === 'error') begin()
  }, [begin, finish])

  // App-level hotkey (Ctrl+Shift+S) arrives as a window event so terminals,
  // modals, and the home screen all reach the same toggle. Routed through a ref
  // so the listener is subscribed exactly once.
  const toggleRef = useRef(toggle)
  toggleRef.current = toggle
  useEffect(() => {
    const handler = () => toggleRef.current()
    window.addEventListener('sush:hush-toggle', handler)
    return () => window.removeEventListener('sush:hush-toggle', handler)
  }, [])

  useEffect(() => () => {
    clearCap()
    try { recRef.current?.cancel() } catch {}
    timersRef.current.forEach(clearTimeout)
  }, [clearCap])

  if (!enabled || !dictationSupported) return null
  const listening = state === 'listening'
  const transcribing = state === 'transcribing'
  const flash = state === 'flash'
  const errored = state === 'error'
  const showPill = listening || transcribing || flash || errored
  const lowCredits = credits && credits.remainingSec > 0 && credits.remainingSec <= 60

  return (
    <div style={{ position: 'fixed', left: 14, bottom: 36, zIndex: 340, display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={toggle}
        title={listening ? 'Stop & transcribe' : 'Hush — speak into the focused terminal (Ctrl+Shift+S)'}
        className={`flex items-center justify-center${listening ? ' sush-orb' : ''}`}
        style={{
          width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
          border: `1px solid ${listening ? 'transparent' : rgba(accent, 0.3)}`,
          background: listening ? '#ff5370' : transcribing ? '#7c8aff' : flash ? '#5fd3a8' : errored ? '#ffb74d' : 'rgba(10,13,17,0.85)',
          color: listening || transcribing || flash || errored ? '#05070b' : 'var(--text-3)',
          boxShadow: listening ? '0 8px 24px rgba(255,83,112,0.4)' : '0 6px 18px rgba(0,0,0,0.4)',
          transition: 'background 180ms cubic-bezier(0.22,1,0.36,1), box-shadow 180ms ease, border-color 180ms ease'
        }}
      >
        <Icon name={flash ? 'check' : errored ? 'x' : transcribing ? 'refresh' : 'mic'} size={15} strokeWidth={2.2} className={transcribing ? 'sush-spin' : undefined} />
      </button>
      {showPill && (
        <div
          data-glass
          className="seducia-pill"
          style={{ maxWidth: 'min(420px, 56vw)', padding: '8px 13px', borderRadius: 12, background: 'rgba(8,10,14,0.9)', border: `1px solid ${errored ? 'rgba(255,183,77,0.4)' : rgba(accent, 0.3)}`, boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}
        >
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1, color: flash ? '#5fd3a8' : errored ? '#ffb74d' : transcribing ? '#9aa6ff' : accent, marginBottom: 2 }}>
            {flash ? (autoSend ? 'SENT TO TERMINAL' : 'TYPED — PRESS ENTER TO SEND')
              : transcribing ? 'HUSH — TRANSCRIBING…'
              : errored ? 'HUSH'
              : 'HUSH — LISTENING'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {errored ? errMsg
              : transcribing ? 'Turning your words into text…'
              : listening ? 'Speak now — tap again to send.'
              : 'Done.'}
          </div>
          {credits && !errored && (
            <div style={{ fontSize: 9.5, marginTop: 3, color: lowCredits ? '#ffb74d' : 'var(--text-4)', fontWeight: 600 }}>
              Quiet Credits · {formatCredits(credits.remainingSec)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
