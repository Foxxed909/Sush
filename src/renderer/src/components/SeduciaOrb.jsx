import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba, accentVars } from '../lib/ui'
import { useSeducia } from '../hooks/useSeducia'

const QUICK = [
  { label: 'Status', send: 'status' },
  { label: 'Gather thoughts', send: 'gather thoughts' },
  { label: 'Build team', send: 'build team here' },
  { label: '3x Claude', send: '3 claude here' }
]

const STATE_LABEL = {
  idle: 'Idle',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking'
}

// A single waveform bar with a per-index delay so the equalizer looks organic.
function Bars({ color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 18 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <span key={i} className="seducia-bar" style={{ height: '100%', background: color, animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  )
}

export default function SeduciaOrb({
  accent, open, onOpenChange,
  tabs = [], recentSessions = [], activeCwd,
  scope = { kind: 'main' }, controls = {},
  onLaunch, onRun, onPrompt, onFocus, onOpenLauncher,
  settings = {}, working = 0,
  // false: the host chrome has its own Seducia button (Nightly topbar), so the
  // orb only appears while she is listening/speaking, and the card anchors
  // under the topbar instead of floating over the composer.
  launcher = true
}) {
  const brain = useSeducia({ tabs, activeCwd, recentSessions, settings, scope, controls, onLaunch, onRun, onPrompt, onFocus, onOpenLauncher })
  const { log, streaming, handle, stop, approval, voiceState, partial, listen, aiEnabled, hasAI, micSupported, voiceError } = brain

  // A pending approval must be seen: open the card if she asked while collapsed.
  useEffect(() => { if (approval && !open) onOpenChange(true) }, [approval]) // eslint-disable-line react-hooks/exhaustive-deps

  const [value, setValue] = useState('')
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  // Draggable: the whole orb+card stack can be grabbed by the card header.
  // null = default bottom-right anchor; {x,y} = user-placed (persisted).
  const [pos, setPos] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sush-seducia-pos') || 'null')
      if (!saved || typeof saved.x !== 'number' || typeof saved.y !== 'number') return null
      // Re-clamp on restore — a saved spot from a bigger monitor must not
      // strand the orb off-screen.
      return {
        x: Math.min(Math.max(saved.x, 8), window.innerWidth - 100),
        y: Math.min(Math.max(saved.y, 8), window.innerHeight - 100)
      }
    } catch { return null }
  })
  const containerRef = useRef(null)
  const dragRef = useRef(null)

  const startDrag = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onDrag = (e) => {
    if (!dragRef.current) return
    const x = Math.min(Math.max(e.clientX - dragRef.current.dx, 8), window.innerWidth - 100)
    const y = Math.min(Math.max(e.clientY - dragRef.current.dy, 8), window.innerHeight - 100)
    setPos({ x, y })
  }
  const endDrag = () => {
    if (!dragRef.current) return
    dragRef.current = null
    setPos(p => {
      try { p ? localStorage.setItem('sush-seducia-pos', JSON.stringify(p)) : localStorage.removeItem('sush-seducia-pos') } catch {}
      return p
    })
  }
  const resetPos = () => {
    setPos(null)
    try { localStorage.removeItem('sush-seducia-pos') } catch {}
  }

  useEffect(() => { if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [log, open, partial])
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 60) }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onOpenChange(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  // The orb pops open on its own when a voice command lands, so you see the reply.
  useEffect(() => {
    if ((voiceState === 'listening' || voiceState === 'thinking') && !open) onOpenChange(true)
  }, [voiceState, open, onOpenChange])

  const submit = (text) => { const v = (text ?? value).trim(); if (!v) return; setValue(''); handle(v) }

  const speaking = voiceState === 'speaking'
  const listeningNow = voiceState === 'listening'
  const orbState = voiceState === 'idle' ? 'seducia-idle' : (listeningNow ? 'seducia-listening' : 'seducia-idle')

  // ---- Collapsed orb (glossy pseudo-3D sphere) ----
  const orb = (
    <button
      onClick={() => onOpenChange(!open)}
      title="Seducia (Ctrl+K)"
      className={`flex items-center justify-center ${orbState}${speaking ? ' seducia-speaking' : ''}`}
      style={{
        position: 'relative', width: 58, height: 58, borderRadius: '50%', cursor: 'pointer',
        border: `1px solid ${rgba(accent, 0.6)}`,
        background: [
          'radial-gradient(circle at 30% 22%, rgba(255,255,255,0.6), rgba(255,255,255,0) 36%)',
          `radial-gradient(circle at 34% 30%, ${rgba(accent, 0.98)}, ${rgba(accent, 0.4)} 64%, rgba(5,7,11,0.92) 100%)`
        ].join(', '),
        boxShadow: `0 10px 30px ${rgba(accent, 0.45)}, inset 0 -7px 14px rgba(0,0,0,0.4), inset 0 2px 6px rgba(255,255,255,0.35)`,
        color: '#05070b', flexShrink: 0
      }}
    >
      {voiceState === 'listening' && (
        <>
          <span className="seducia-ring" />
          <span className="seducia-ring r2" />
          <span className="seducia-ring r3" />
        </>
      )}
      {speaking ? <Bars color="#05070b" />
        : voiceState === 'thinking'
          ? <Icon name="sparkles" size={22} strokeWidth={2} className="sush-spin" />
          : <Icon name="sparkles" size={22} strokeWidth={2} />}
    </button>
  )

  // ---- Status pill (BridgeAgent-style: live state + agent activity) ----
  const busyVoice = voiceState !== 'idle'
  const pillVisible = busyVoice || streaming || working > 0
  const pillLabel = busyVoice
    ? (STATE_LABEL[voiceState] || 'Busy')
    : streaming ? 'Thinking...' : `${working} agent${working === 1 ? '' : 's'} working`
  const pillColor = speaking ? accent : busyVoice || streaming ? accent : '#5fd3a8'
  const pill = pillVisible ? (
    <div
      className="seducia-pill flex items-center"
      data-glass
      style={{ gap: 8, padding: '7px 13px', borderRadius: 999, background: 'rgba(8,10,14,0.88)', border: `1px solid ${rgba(accent, 0.35)}`, boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}
    >
      <span className="sush-pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: pillColor, '--pulse': rgba(pillColor, 0.6), flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{pillLabel}</span>
      {working > 0 && busyVoice && (
        <span style={{ fontSize: 8.5, fontWeight: 900, color: '#0a0a0c', background: '#5fd3a8', borderRadius: 999, padding: '2px 7px', letterSpacing: 0.6, whiteSpace: 'nowrap' }}>
          AGENT WORKING
        </span>
      )}
    </div>
  ) : null

  return (
    <div
      ref={containerRef}
      style={{
        ...accentVars(accent),
        position: 'fixed',
        ...(pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : launcher ? { right: 18, bottom: 40 } : { right: 12, top: 54 }),
        zIndex: 360, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12
      }}
    >
      {open && (
        <div
          className="seducia-card sush-glass-ui flex flex-col"
          data-glass
          style={{
            width: 'min(380px, 92vw)', height: 'min(560px, 74vh)',
            borderRadius: 18, overflow: 'hidden',
            border: `1px solid ${rgba(accent, 0.3)}`,
            background: `radial-gradient(540px 200px at 100% 0%, ${rgba(accent, 0.14)}, transparent 60%), rgba(8,10,14,0.92)`,
            boxShadow: '0 24px 70px rgba(0,0,0,0.62)'
          }}
        >
          {/* Header (drag handle: grab to move the whole stack; double-click resets) */}
          <div
            className="flex items-center justify-between"
            onPointerDown={startDrag}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={resetPos}
            title="Drag to move - double-click to reset position"
            style={{ padding: '14px 16px', borderBottom: `1px solid ${rgba(accent, 0.12)}`, cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
          >
            <div className="flex items-center" style={{ gap: 11 }}>
              <span className={`flex items-center justify-center ${voiceState === 'idle' ? 'seducia-idle' : ''}`} style={{ width: 34, height: 34, borderRadius: '50%', background: `radial-gradient(circle at 32% 28%, ${rgba(accent, 0.95)}, ${rgba(accent, 0.3)})`, color: '#05070b' }}>
                {speaking ? <Bars color="#05070b" /> : <Icon name="sparkles" size={16} strokeWidth={2} className={voiceState === 'thinking' ? 'sush-spin' : undefined} />}
              </span>
              <div>
                <div className="flex items-center" style={{ gap: 6 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 900, color: 'var(--text-1)', letterSpacing: 0.2 }}>Seducia</span>
                  {aiEnabled && hasAI && <span style={{ fontSize: 8.5, fontWeight: 800, color: accent, background: rgba(accent, 0.16), border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 99, padding: '1px 6px', letterSpacing: 0.5 }}>AI</span>}
                  <span
                    title={scope.kind === 'project' ? `Project scope - actions stay inside "${scope.label}"` : 'Main scope - whole-app control'}
                    style={{ fontSize: 8.5, fontWeight: 800, color: scope.kind === 'project' ? '#5fd3a8' : 'var(--text-3)', background: scope.kind === 'project' ? 'rgba(95,211,168,0.12)' : 'rgba(255,255,255,0.06)', border: `1px solid ${scope.kind === 'project' ? 'rgba(95,211,168,0.3)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 99, padding: '1px 7px', letterSpacing: 0.5, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {scope.kind === 'project' ? scope.label : 'MAIN'}
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: voiceState === 'idle' ? 'var(--text-3)' : accent, marginTop: 1, fontWeight: voiceState === 'idle' ? 400 : 700 }}>
                  {STATE_LABEL[voiceState] || 'Idle'}
                </div>
              </div>
            </div>
            <div className="flex items-center" style={{ gap: 6 }}>
              <button onClick={() => onOpenChange(false)} title="Minimize to orb" style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="minus" size={15} />
              </button>
              <button onClick={() => onOpenChange(false)} title="Close (Esc)" style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="x" size={15} />
              </button>
            </div>
          </div>

          {/* Notices */}
          {!hasAI && (
            <div style={{ margin: '10px 12px 0', padding: '8px 12px', borderRadius: 10, background: rgba(accent, 0.07), border: `1px solid ${rgba(accent, 0.18)}`, fontSize: 11, color: 'var(--text-2)' }}>
              Tip: set <strong style={{ color: accent }}>Settings -&gt; AI</strong> to <strong style={{ color: accent }}>Claude CLI</strong> for AI replies without a key.
            </div>
          )}
          {voiceError && (
            <div style={{ margin: '10px 12px 0', padding: '8px 12px', borderRadius: 10, background: 'rgba(255,83,112,0.08)', border: '1px solid rgba(255,83,112,0.25)', fontSize: 11, color: '#ffb3c0' }}>{voiceError}</div>
          )}

          {/* Transcript */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto sush-scroll flex flex-col" style={{ padding: 14, gap: 10 }}>
            {log.map(entry => (
              <div key={entry.id} className={`flex ${entry.role === 'you' ? 'justify-end' : 'justify-start'}`}>
                {entry.role === 'seducia' && (
                  <span className="flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginRight: 8, marginTop: 2, background: rgba(accent, 0.16), border: `1px solid ${rgba(accent, 0.32)}`, color: accent }}>
                    <Icon name="sparkles" size={12} strokeWidth={2} />
                  </span>
                )}
                <div style={{ maxWidth: '84%', fontSize: 12.5, lineHeight: 1.55, padding: '8px 12px', borderRadius: 13, border: entry.role === 'you' ? `1px solid ${rgba(accent, 0.35)}` : '1px solid rgba(255,255,255,0.06)', background: entry.role === 'you' ? rgba(accent, 0.13) : 'rgba(255,255,255,0.035)', color: entry.role === 'you' ? 'var(--text-1)' : 'var(--text-2)', borderTopRightRadius: entry.role === 'you' ? 4 : 13, borderTopLeftRadius: entry.role === 'you' ? 13 : 4, whiteSpace: 'pre-wrap' }}>
                  {entry.text}
                  {entry.streaming && <span style={{ display: 'inline-block', width: 7, height: 12, background: accent, borderRadius: 2, marginLeft: 3, verticalAlign: 'middle', animation: 'sush-blink 0.8s step-start infinite' }} />}
                </div>
              </div>
            ))}
            {partial && (
              <div className="flex justify-end">
                <div style={{ maxWidth: '84%', fontSize: 12.5, lineHeight: 1.5, padding: '8px 12px', borderRadius: 13, border: `1px dashed ${rgba(accent, 0.4)}`, background: rgba(accent, 0.06), color: rgba(accent, 0.95), fontStyle: 'italic' }}>{partial}</div>
              </div>
            )}
          </div>

          {approval && (
            <div className="seducia-approval" role="alertdialog" aria-label="Seducia needs your approval">
              <div className="seducia-approval-head">
                <Icon name="bell" size={14} />
                <strong>Seducia wants to</strong>
                <small>from model output — review first</small>
              </div>
              <ul>
                {approval.items.map((item, i) => (
                  <li key={i}>
                    <span>{item.kind}</span>
                    <code className={item.mono ? 'is-command' : undefined}>{item.text}</code>
                    {item.detail && <small>{item.detail}</small>}
                  </li>
                ))}
              </ul>
              <div className="seducia-approval-actions">
                <button type="button" onClick={() => approval.resolve(false)}>Skip</button>
                <button type="button" className="is-primary" onClick={() => approval.resolve(true)} autoFocus>Approve{approval.items.length > 1 ? ' all' : ''}</button>
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="flex" style={{ gap: 6, flexWrap: 'wrap', padding: '0 14px 10px' }}>
            {QUICK.map(q => (
              <button key={q.label} onClick={() => submit(q.send)} disabled={streaming}
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', background: 'rgba(255,255,255,0.03)', border: `1px solid ${rgba(accent, 0.2)}`, borderRadius: 999, padding: '4px 11px', cursor: streaming ? 'default' : 'pointer', opacity: streaming ? 0.5 : 1 }}>
                {q.label}
              </button>
            ))}
          </div>

          {/* Composer */}
          <div style={{ padding: '0 14px 14px' }}>
            <div className="sush-omni flex items-center" style={{ height: 46, gap: 8, borderRadius: 13 }}>
              <Icon name="sparkles" size={15} color={streaming ? accent : 'var(--text-4)'} className={streaming ? 'sush-spin' : undefined} />
              <input
                ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
                placeholder={voiceState === 'listening' ? 'Listening...' : streaming ? 'Seducia is thinking...' : 'Ask, launch, or command...'}
                disabled={streaming} spellCheck={false}
                style={{ flex: 1, minWidth: 0, height: '100%', background: 'transparent', border: 'none', color: 'var(--text-1)', outline: 'none', fontSize: 13 }}
              />
              {micSupported && (
                <button onClick={listen} title={voiceState === 'listening' ? 'Stop' : 'Push to talk'}
                  className="flex items-center justify-center"
                  style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${voiceState === 'listening' ? 'transparent' : rgba(accent, 0.3)}`, background: voiceState === 'listening' ? '#ff5370' : 'rgba(255,255,255,0.04)', color: voiceState === 'listening' ? '#05070b' : accent, cursor: 'pointer', flexShrink: 0 }}>
                  <Icon name="mic" size={15} strokeWidth={2} />
                </button>
              )}
              {streaming ? (
                <button onClick={stop} title="Stop" style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(255,83,112,0.4)', background: 'rgba(255,83,112,0.1)', color: '#ff5370', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="stop" size={13} />
                </button>
              ) : (
                <button onClick={() => submit()} disabled={!value.trim()} style={{ width: 32, height: 32, borderRadius: 9, border: 'none', background: value.trim() ? accent : 'rgba(255,255,255,0.05)', color: value.trim() ? '#05070b' : 'var(--text-4)', cursor: value.trim() ? 'pointer' : 'default', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="send" size={15} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {(launcher || busyVoice) && (
        <div className="flex items-center" style={{ gap: 10 }}>
          {launcher && pill}
          {orb}
        </div>
      )}
    </div>
  )
}
