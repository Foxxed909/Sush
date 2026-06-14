import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

// "Continue with Google / GitHub" plus the in-flight UX for both OAuth flows.
// mode='signin' (lock screen) or 'link' (UserManager, requires userId).
// Terminal events bubble to the parent through onResult(event); this
// component only owns the busy/device-code/error presentation.
export default function ProviderButtons({ mode, userId, accent = '#ff6b9d', compact = false, onResult, providers = ['google', 'github'] }) {
  const [busy, setBusy] = useState(null)       // 'google' | 'github' | null
  const [device, setDevice] = useState(null)   // { userCode, verificationUri }
  const [error, setError] = useState('')
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  useEffect(() => {
    const off = window.sush.onOauthEvent?.((ev) => {
      if (!ev) return
      if (ev.phase === 'device-code') {
        setDevice({ userCode: ev.userCode, verificationUri: ev.verificationUri })
        return
      }
      if (ev.phase === 'cancelled') { setBusy(null); setDevice(null); return }
      if (ev.phase === 'error') { setBusy(null); setDevice(null); setError(ev.error || 'Sign-in failed'); return }
      if (ev.phase === 'success') {
        setBusy(null); setDevice(null); setError('')
        if (ev.warning) setError(ev.warning)
        onResultRef.current?.(ev)
      }
    })
    return () => { off?.() }
  }, [])

  const start = async (provider) => {
    if (busy) return
    setError('')
    setBusy(provider)
    const res = provider === 'github'
      ? await window.sush.oauthGitHubStart({ mode, userId })
      : await window.sush.oauthGoogleStart({ mode, userId })
    if (!res?.ok) {
      setBusy(null)
      setError(res?.error || 'Could not start sign-in')
    }
  }

  const cancel = () => {
    if (busy === 'github') window.sush.oauthGitHubCancel?.()
    if (busy === 'google') window.sush.oauthGoogleCancel?.()
    setBusy(null)
    setDevice(null)
  }

  const btnStyle = {
    flex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'var(--text-2)',
    borderRadius: 10,
    padding: compact ? '7px 10px' : '9px 14px',
    fontSize: compact ? 11.5 : 12.5,
    fontWeight: 700,
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.5 : 1
  }

  if (busy === 'github' && device) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>Enter this code on GitHub:</div>
        <div style={{
          fontSize: 24, fontWeight: 900, letterSpacing: 5, color: 'var(--text-1)',
          fontFamily: 'ui-monospace, monospace', marginBottom: 10, userSelect: 'text'
        }}>
          {device.userCode}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            onClick={() => window.sush.openExternal({ url: device.verificationUri })}
            style={{
              ...btnStyle, flex: 'none', opacity: 1, cursor: 'pointer',
              background: rgba(accent, 0.14), border: `1px solid ${rgba(accent, 0.5)}`, color: 'var(--text-1)'
            }}
          >
            <Icon name="github" size={13} /> Open github.com
          </button>
          <button onClick={cancel} style={{ ...btnStyle, flex: 'none', opacity: 1, cursor: 'pointer' }}>Cancel</button>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 8 }}>Waiting for you to approve in the browser...</div>
      </div>
    )
  }

  if (busy === 'google') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700, marginBottom: 8 }}>
          Check your browser to finish signing in with Google
        </div>
        <button onClick={cancel} style={{ ...btnStyle, flex: 'none', opacity: 1, cursor: 'pointer' }}>Cancel</button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        {providers.includes('google') && (
          <button type="button" onClick={() => start('google')} style={btnStyle}>
            <Icon name="google" size={13} /> {compact ? 'Google' : 'Continue with Google'}
          </button>
        )}
        {providers.includes('github') && (
          <button type="button" onClick={() => start('github')} style={btnStyle}>
            <Icon name="github" size={13} /> {compact ? 'GitHub' : 'Continue with GitHub'}
          </button>
        )}
      </div>
      {busy === 'github' && !device && (
        <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 8, textAlign: 'center' }}>Contacting GitHub...</div>
      )}
      {error && (
        <div style={{ color: '#ff8aa0', fontSize: 11.5, fontWeight: 700, marginTop: 8, textAlign: 'center' }}>{error}</div>
      )}
    </div>
  )
}
