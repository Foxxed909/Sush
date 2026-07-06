import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'
import { useEntitlements } from '../hooks/useEntitlements'

// Provider Connect — connect provider accounts (Claude / ChatGPT / Google)
// over OAuth, same loopback-PKCE flow as "Continue with Google". Tokens never
// enter the renderer; these cards only drive the flow and show status.
// A Plus+ feature (graduated from Experiments); main enforces the gate on
// connect-start, this component mirrors it so the lock reads instantly.

const CARDS = [
  {
    provider: 'claude',
    title: 'Connect Claude (OAuth)',
    icon: 'sparkles',
    blurb: 'Sign in with your Claude account in the browser. Supports a paste-code fallback if the port is busy.',
    manualFallback: true
  },
  {
    provider: 'codex',
    title: 'Connect ChatGPT / Codex (OAuth)',
    icon: 'terminal',
    blurb: 'Sign in with your ChatGPT account — the same flow the Codex CLI uses. Needs port 1455 free (close any pending "codex login").',
    manualFallback: false
  },
  {
    provider: 'gemini',
    title: 'Connect Google / Gemini (OAuth)',
    icon: 'google',
    blurb: 'Sign in with the Google account you use for Gemini — the same flow the Gemini CLI uses. Any free port works.',
    manualFallback: false
  }
]

function ConnectCard({ card, status, accent, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [test, setTest] = useState(null)

  useEffect(() => {
    const off = window.sush.onOauthEvent?.((ev) => {
      if (ev?.provider !== card.provider) return
      if (ev.phase === 'success') { setBusy(false); setManual(false); setCode(''); setError(''); onChanged() }
      if (ev.phase === 'error') { setBusy(false); setError(ev.error || 'Connect failed') }
      if (ev.phase === 'cancelled') { setBusy(false); setManual(false) }
    })
    return () => { off?.() }
  }, [card.provider, onChanged])

  const start = async (useManual) => {
    setError(''); setTest(null); setBusy(true); setManual(!!useManual)
    const res = await window.sush.connectStart?.({ provider: card.provider, manual: !!useManual })
    if (!res?.ok) {
      setBusy(false)
      setError(res?.error || 'Could not start the connect flow.')
      if (res?.portBusy && card.manualFallback) setManual(true)
    }
  }

  const finish = async () => {
    setError('')
    const res = await window.sush.connectFinish?.({ code })
    if (!res?.ok) setError(res?.error || 'That code did not work.')
  }

  const cancel = () => { window.sush.connectCancel?.(); setBusy(false); setManual(false); setCode('') }

  const disconnect = async () => {
    await window.sush.connectDisconnect?.({ provider: card.provider })
    setTest(null)
    onChanged()
  }

  const runTest = async () => {
    setTest({ running: true })
    const res = await window.sush.connectTest?.({ provider: card.provider })
    setTest(res || { ok: false, error: 'No response.' })
    onChanged()
  }

  const btn = (primary) => ({
    display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px',
    borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    background: primary ? rgba(accent, 0.14) : 'var(--surface-2)',
    border: `1px solid ${primary ? rgba(accent, 0.5) : 'var(--border-2)'}`,
    color: primary ? 'var(--text-1)' : 'var(--text-3)'
  })

  return (
    <div style={{ border: '1px solid var(--border-2)', borderRadius: 10, padding: 14, background: 'var(--surface-1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon name={card.icon} size={14} strokeWidth={2} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-1)' }}>{card.title}</span>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-4)', lineHeight: 1.5, marginBottom: 12 }}>
        {card.blurb} The token is encrypted on this machine, stays in the main
        process, and you can disconnect any time.
      </div>

      {status?.connected ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: status.expired ? '#ffcb6b' : '#5fd3a8' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
              {status.expired ? 'Connected — token expired (will refresh on use)' : `Connected${status.account ? ` as ${status.account}` : ''}`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={runTest} disabled={test?.running} style={{ ...btn(true), opacity: test?.running ? 0.6 : 1 }}>
              <Icon name="activity" size={12} /> {test?.running ? 'Testing…' : 'Test connection'}
            </button>
            <button onClick={disconnect} style={btn(false)}>Disconnect</button>
          </div>
          {test && !test.running && (
            <div style={{ marginTop: 10, fontSize: 11.5, lineHeight: 1.5, color: test.ok ? '#5fd3a8' : '#ff8aa0', fontWeight: 700 }}>
              {test.ok ? test.text : test.error}
            </div>
          )}
        </div>
      ) : busy ? (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700, marginBottom: 10 }}>
            {manual ? 'Approve in the browser, then paste the code it shows you:' : 'Check your browser to approve the connection…'}
          </div>
          {manual && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="code#state"
                spellCheck={false}
                style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)', borderRadius: 8, padding: '7px 10px', fontSize: 12, fontFamily: 'ui-monospace, monospace' }}
              />
              <button onClick={finish} disabled={!code.trim()} style={{ ...btn(true), opacity: code.trim() ? 1 : 0.5 }}>Finish</button>
            </div>
          )}
          <button onClick={cancel} style={btn(false)}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => start(false)} style={btn(true)}>
            <Icon name={card.icon} size={12} /> Connect
          </button>
          {card.manualFallback && (
            <button onClick={() => start(true)} style={btn(false)}>Paste code instead</button>
          )}
        </div>
      )}

      {error && (
        <div style={{ color: '#ff8aa0', fontSize: 11.5, fontWeight: 700, marginTop: 10 }}>{error}</div>
      )}
    </div>
  )
}

export default function AccountConnect({ accent = '#ff6b9d' }) {
  const [status, setStatus] = useState({})
  const ent = useEntitlements()
  const locked = !ent.can('providerConnect')

  const refresh = async () => {
    try {
      const s = await window.sush.connectStatus?.()
      setStatus(s || {})
    } catch {}
  }

  useEffect(() => { refresh() }, [])

  // Tier gate (Plus+). State is written out, per the toggle convention —
  // main enforces the same gate on connect-start, this is just the honest UI.
  if (locked) {
    return (
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('sush:open-plans'))}
        style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '12px 14px', borderRadius: 10, background: 'var(--surface-1)', border: '1px solid var(--border-2)', color: 'var(--text-3)', cursor: 'pointer', textAlign: 'left' }}
      >
        <Icon name="lock" size={14} strokeWidth={2} />
        <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>
          Connect provider accounts (OAuth) is a Plus feature — sign in to Claude, ChatGPT, or Google once and Sush rides your subscription.
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, color: accent, whiteSpace: 'nowrap' }}>See plans →</span>
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {CARDS.map(card => (
        <ConnectCard key={card.provider} card={card} status={status[card.provider]} accent={accent} onChanged={refresh} />
      ))}
    </div>
  )
}
