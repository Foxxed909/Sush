import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

// First-run (and "New profile") onboarding: one question per screen.
//   name → PIN (optional, confirmed) → how you sign in → you're set
// Nothing here creates the profile until the last screen, so Back is always
// safe, and a provider sign-in has to finish (or be cancelled) before the
// flow moves on. That was the old bug: the create form sat under the OAuth
// buttons and could be submitted while GitHub was still waiting.

export const PROFILE_COLORS = ['#ff6b9d', '#a78bfa', '#5fd3a8', '#ffcb6b', '#60a5fa', '#f97316', '#38bdf8', '#ef4444']
const STEPS = ['name', 'pin', 'signin', 'done']

function Avatar({ name, color, avatarUrl, size = 72 }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [avatarUrl])
  const initial = (String(name || '').trim()[0] || '?').toUpperCase()
  return (
    <div
      className="onb-avatar"
      style={{
        width: size, height: size, fontSize: size * 0.42,
        background: `linear-gradient(150deg, ${rgba(color, 0.95)}, ${rgba(color, 0.45)})`,
        boxShadow: `0 14px 40px ${rgba(color, 0.32)}, inset 0 1px 0 rgba(255,255,255,0.35)`
      }}
      aria-hidden
    >
      {avatarUrl && !failed
        ? <img src={avatarUrl} alt="" draggable={false} onError={() => setFailed(true)} />
        : <span key={initial} className="onb-avatar-initial">{initial}</span>}
    </div>
  )
}

function Progress({ step }) {
  const index = STEPS.indexOf(step)
  return (
    <div className="onb-progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={index + 1} aria-label={`Step ${index + 1} of ${STEPS.length}`}>
      {STEPS.map((s, i) => <span key={s} data-done={i <= index} />)}
    </div>
  )
}

function PinDots({ value, phase }) {
  const count = Math.max(4, Math.min(8, value.length))
  return (
    <div className="onb-pin-dots" data-phase={phase}>
      {Array.from({ length: count }, (_, i) => <span key={i} data-filled={i < value.length} />)}
    </div>
  )
}

// GitHub: device code. Google: browser loopback. Both report over the shared
// oauth event channel; only events for the provider we started are ours.
function useProviderSignIn({ onSignedIn, onTicket }) {
  const [busy, setBusy] = useState(null) // 'github' | 'google' | null
  const [device, setDevice] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const busyRef = useRef(null)
  busyRef.current = busy
  const cb = useRef({ onSignedIn, onTicket })
  cb.current = { onSignedIn, onTicket }

  useEffect(() => {
    const off = window.sush?.onOauthEvent?.((ev) => {
      if (!ev || !busyRef.current || ev.provider !== busyRef.current) return
      if (ev.mode && ev.mode !== 'signin') return
      if (ev.phase === 'device-code') { setDevice({ userCode: ev.userCode, verificationUri: ev.verificationUri }); return }
      if (ev.phase === 'cancelled') { setBusy(null); setDevice(null); return }
      if (ev.phase === 'error') { setBusy(null); setDevice(null); setError(ev.error || 'Sign-in failed'); return }
      if (ev.phase === 'success') {
        setBusy(null); setDevice(null); setError(ev.warning || '')
        if (ev.user) cb.current.onSignedIn?.(ev.user)
        else if (ev.ticket) cb.current.onTicket?.(ev)
      }
    })
    return () => {
      off?.()
      // Leaving the screen mid-flow must not leave main polling GitHub and
      // later activating someone behind our back.
      if (busyRef.current === 'github') window.sush?.oauthGitHubCancel?.()
      if (busyRef.current === 'google') window.sush?.oauthGoogleCancel?.()
    }
  }, [])

  const start = async (provider) => {
    if (busyRef.current) return
    setError('')
    setDevice(null)
    setBusy(provider)
    busyRef.current = provider
    let res
    try {
      res = provider === 'github'
        ? await window.sush.oauthGitHubStart({ mode: 'signin' })
        : await window.sush.oauthGoogleStart({ mode: 'signin' })
    } catch (err) {
      res = { ok: false, error: err?.message }
    }
    if (!res?.ok) {
      setBusy(null)
      setError(res?.error || 'Could not start sign-in')
      return
    }
    if (provider === 'github' && res.userCode && !device) {
      setDevice({ userCode: res.userCode, verificationUri: res.verificationUri })
    }
  }
  const cancel = () => {
    if (busy === 'github') window.sush?.oauthGitHubCancel?.()
    if (busy === 'google') window.sush?.oauthGoogleCancel?.()
    setBusy(null)
    setDevice(null)
  }
  const copyCode = async () => {
    if (!device?.userCode) return
    try { await window.sush?.copyText?.(device.userCode) } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  return { busy, device, error, setError, start, cancel, copyCode, copied }
}

const METHODS = [
  { id: 'github', label: 'GitHub', icon: 'github', hint: 'Links your repos and the gh CLI' },
  { id: 'google', label: 'Google', icon: 'google', hint: 'Uses your Google account' },
  { id: 'discord', label: 'Discord', icon: 'discord', hint: 'Coming soon', soon: true },
  { id: 'email', label: 'Email', icon: 'mail', hint: 'Coming soon', soon: true }
]

export default function Onboarding({ firstRun = true, initialColor = PROFILE_COLORS[0], seed = null, onCreate, onCancel, onProviderSignedIn }) {
  const [step, setStep] = useState('name')
  const [dir, setDir] = useState('forward')
  // `seed`: a provider sign-in from the profile picker matched no one, so we
  // arrive already linked; the sign-in step is skipped.
  const [form, setForm] = useState(() => ({
    name: '', color: initialColor, pin: '', isolation: 'cli', avatarUrl: '', providerTicket: '', providerLabel: '', providerLogin: '',
    ...(seed || {})
  }))
  const afterPin = () => (form.providerTicket ? 'done' : 'signin')
  const [pinStage, setPinStage] = useState('enter') // 'enter' | 'confirm'
  const [pinDraft, setPinDraft] = useState('')
  const [pinPhase, setPinPhase] = useState('idle')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const nameRef = useRef(null)
  const pinRef = useRef(null)
  const primaryRef = useRef(null)

  const provider = useProviderSignIn({
    onSignedIn: user => onProviderSignedIn?.(user),
    onTicket: ev => {
      const profile = ev.profile || {}
      setForm(f => ({
        ...f,
        // The name the user typed wins; the provider only fills the avatar.
        avatarUrl: f.avatarUrl || profile.picture || profile.avatarUrl || '',
        providerTicket: ev.ticket,
        providerLabel: ev.provider === 'github' ? 'GitHub' : 'Google',
        providerLogin: profile.login || profile.email || profile.name || ''
      }))
      go('done')
    }
  })

  const go = (next) => {
    const from = STEPS.indexOf(step)
    const to = STEPS.indexOf(next)
    setDir(to < from ? 'back' : 'forward')
    setError('')
    setStep(next)
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (step === 'name') nameRef.current?.focus()
      else if (step === 'pin') pinRef.current?.focus()
      else primaryRef.current?.focus()
    }, 60)
    return () => clearTimeout(t)
  }, [step, pinStage])

  const submitName = (e) => {
    e?.preventDefault?.()
    const name = form.name.trim()
    if (!name) { setError('Type a name to continue'); return }
    setForm(f => ({ ...f, name }))
    go('pin')
  }

  const pinValue = pinStage === 'enter' ? form.pin : pinDraft
  const setPinValue = (v) => {
    const digits = v.replace(/\D/g, '').slice(0, 8)
    setError('')
    setPinPhase('idle')
    if (pinStage === 'enter') setForm(f => ({ ...f, pin: digits }))
    else setPinDraft(digits)
  }
  const submitPin = (e) => {
    e?.preventDefault?.()
    if (pinStage === 'enter') {
      if (!form.pin) { go(afterPin()); return }
      if (form.pin.length < 4) { setError('Use 4 to 8 digits'); setPinPhase('error'); return }
      setPinDraft('')
      setPinStage('confirm')
      return
    }
    if (pinDraft !== form.pin) {
      setError("Those PINs don't match. Try again.")
      setPinPhase('error')
      setTimeout(() => { setPinDraft(''); setPinPhase('idle') }, 420)
      return
    }
    setPinPhase('success')
    setTimeout(() => go(afterPin()), 180)
  }
  const backFromPin = () => {
    if (pinStage === 'confirm') { setPinStage('enter'); setPinDraft(''); setError(''); return }
    go('name')
  }

  const finish = async () => {
    if (creating) return
    setCreating(true)
    setError('')
    // The splash already played before onboarding; don't replay it after the
    // reload that activates the new profile.
    try { sessionStorage.setItem('sush-skip-splash', '1') } catch {}
    let res
    try { res = await onCreate?.(form) } catch (err) { res = { ok: false, error: err?.message } }
    if (!res?.ok) {
      setCreating(false)
      const expired = /expired/i.test(res?.error || '')
      if (expired) {
        // The provider ticket lapsed: drop it and send them back to sign in.
        setForm(f => ({ ...f, providerTicket: '', providerLabel: '', providerLogin: '' }))
        go('signin')
      }
      setError(res?.error || 'Could not create your profile')
    }
  }

  const stepIndex = STEPS.indexOf(step)
  const accent = form.color

  return (
    <div className="onb-root" style={{ '--accent': accent, '--onb-accent-soft': rgba(accent, 0.14), '--onb-accent-line': rgba(accent, 0.5) }}>
      <div className="onb-glow" aria-hidden style={{ background: `radial-gradient(closest-side, ${rgba(accent, 0.16)}, transparent 72%)` }} />
      <header className="onb-top">
        <div className="onb-brand"><span className="onb-brand-mark" />Sush</div>
        <Progress step={step} />
        {!firstRun && onCancel
          ? <button type="button" className="onb-link" onClick={onCancel}>Cancel</button>
          : <span className="onb-step-count">{stepIndex + 1} / {STEPS.length}</span>}
      </header>

      <main className="onb-stage">
        <section key={`${step}-${pinStage}`} className="onb-step" data-dir={dir}>
          {step === 'name' && (
            <form onSubmit={submitName} className="onb-form">
              <Avatar name={form.name} color={form.color} avatarUrl={form.avatarUrl} />
              <h1 className="onb-title">{firstRun ? 'Welcome to Sush' : 'New profile'}</h1>
              <p className="onb-sub">What should we call you?</p>
              <input
                ref={nameRef}
                className="onb-input"
                value={form.name}
                maxLength={32}
                placeholder="Your name"
                aria-label="Your name"
                autoComplete="given-name"
                spellCheck={false}
                onChange={e => { setError(''); setForm(f => ({ ...f, name: e.target.value })) }}
              />
              <div className="onb-swatches" role="radiogroup" aria-label="Profile colour">
                {PROFILE_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={form.color === c}
                    aria-label={`Colour ${c}`}
                    className="onb-swatch"
                    style={{ background: c }}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                  />
                ))}
              </div>
              {error && <p className="onb-error" role="alert">{error}</p>}
              <div className="onb-actions">
                {!firstRun && onCancel && <button type="button" className="onb-btn is-ghost" onClick={onCancel}>Back</button>}
                <button type="submit" className="onb-btn is-primary" disabled={!form.name.trim()}>
                  Continue <Icon name="arrowRight" size={14} />
                </button>
              </div>
            </form>
          )}

          {step === 'pin' && (
            <form onSubmit={submitPin} className="onb-form" onClick={() => pinRef.current?.focus()}>
              <div className="onb-icon-badge"><Icon name="lock" size={22} /></div>
              <h1 className="onb-title">{pinStage === 'enter' ? 'Add a PIN?' : 'Confirm your PIN'}</h1>
              <p className="onb-sub">
                {pinStage === 'enter'
                  ? `A 4–8 digit PIN keeps curious eyes out of ${form.name}'s sessions. You can skip this.`
                  : 'Type it once more.'}
              </p>
              <PinDots value={pinValue} phase={pinPhase} />
              <input
                ref={pinRef}
                className="onb-pin-input"
                value={pinValue}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                aria-label={pinStage === 'enter' ? 'PIN' : 'Confirm PIN'}
                onChange={e => setPinValue(e.target.value)}
              />
              {error && <p className="onb-error" role="alert">{error}</p>}
              <div className="onb-actions">
                <button type="button" className="onb-btn is-ghost" onClick={backFromPin}>Back</button>
                <button type="submit" className="onb-btn is-primary" disabled={pinStage === 'confirm' ? pinDraft.length < 4 : (form.pin.length > 0 && form.pin.length < 4)}>
                  {pinStage === 'enter' && !form.pin ? 'Skip for now' : pinStage === 'enter' ? 'Next' : 'Confirm'} <Icon name="arrowRight" size={14} />
                </button>
              </div>
            </form>
          )}

          {step === 'signin' && (
            <div className="onb-form">
              <h1 className="onb-title">How would you like to sign in?</h1>
              <p className="onb-sub">Linking an account brings your avatar and lets you sign back in on this machine. Sush never sees your password.</p>

              {provider.busy ? (
                <div className="onb-wait" role="status">
                  {provider.busy === 'github' && provider.device ? (
                    <>
                      <div className="onb-wait-label">Enter this code on GitHub</div>
                      <button type="button" className="onb-code" onClick={provider.copyCode} title="Copy code">
                        {provider.device.userCode}
                        <span className="onb-code-copy">{provider.copied ? 'Copied' : 'Copy'}</span>
                      </button>
                      <div className="onb-actions is-center">
                        <button
                          type="button"
                          ref={primaryRef}
                          className="onb-btn is-primary"
                          onClick={() => window.sush?.openExternal?.({ url: provider.device.verificationUri })}
                        >
                          <Icon name="github" size={14} /> Open github.com
                        </button>
                        <button type="button" className="onb-btn is-ghost" onClick={provider.cancel}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="onb-spinner" aria-hidden />
                      <div className="onb-wait-label">
                        {provider.busy === 'google' ? 'Finish signing in with Google in your browser' : 'Contacting GitHub…'}
                      </div>
                      <div className="onb-actions is-center">
                        <button type="button" className="onb-btn is-ghost" onClick={provider.cancel}>Cancel</button>
                      </div>
                    </>
                  )}
                  <p className="onb-fine">Sush waits here until you approve. Nothing is created until you finish.</p>
                </div>
              ) : (
                <>
                  <div className="onb-methods">
                    {METHODS.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        className="onb-method"
                        disabled={m.soon}
                        onClick={() => provider.start(m.id)}
                      >
                        <span className="onb-method-icon"><Icon name={m.icon} size={17} /></span>
                        <span className="onb-method-text">
                          <strong>Continue with {m.label}</strong>
                          <small>{m.hint}</small>
                        </span>
                        {m.soon ? <span className="onb-soon">Soon</span> : <Icon name="chevronRight" size={14} />}
                      </button>
                    ))}
                  </div>
                  <div className="onb-or"><span>or</span></div>
                  <button type="button" className="onb-btn is-ghost is-wide" onClick={() => go('done')}>
                    Stay local, no account
                  </button>
                </>
              )}
              {(provider.error || error) && <p className="onb-error" role="alert">{provider.error || error}</p>}
              {!provider.busy && (
                <div className="onb-actions is-left">
                  <button type="button" className="onb-btn is-ghost" onClick={() => { setPinStage('enter'); go('pin') }}>Back</button>
                </div>
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="onb-form">
              <Avatar name={form.name} color={form.color} avatarUrl={form.avatarUrl} size={84} />
              <h1 className="onb-title">You're all set, {form.name}</h1>
              <p className="onb-sub">Here's your profile. Change any of it later in Settings.</p>
              <ul className="onb-summary">
                <li><Icon name="user" size={14} /><span>Name</span><strong>{form.name}</strong></li>
                <li><Icon name="lock" size={14} /><span>PIN</span><strong>{form.pin ? 'On' : 'Off'}</strong></li>
                <li>
                  <Icon name={form.providerLabel === 'GitHub' ? 'github' : form.providerLabel === 'Google' ? 'google' : 'home'} size={14} />
                  <span>Account</span>
                  <strong>{form.providerLabel ? `${form.providerLabel}${form.providerLogin ? ` · ${form.providerLogin}` : ''}` : 'Local only'}</strong>
                </li>
              </ul>
              <div className="onb-seg" role="radiogroup" aria-label="Isolation">
                {[
                  { id: 'cli', label: 'CLI isolation', desc: 'Separate agent logins (recommended)' },
                  { id: 'full', label: 'Full isolation', desc: 'Separate home folder too' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={form.isolation === opt.id}
                    className="onb-seg-btn"
                    onClick={() => setForm(f => ({ ...f, isolation: opt.id }))}
                  >
                    <strong>{opt.label}</strong>
                    <small>{opt.desc}</small>
                  </button>
                ))}
              </div>
              {error && <p className="onb-error" role="alert">{error}</p>}
              <div className="onb-actions">
                <button type="button" className="onb-btn is-ghost" onClick={() => { setPinStage('enter'); go(form.providerTicket ? 'pin' : 'signin') }} disabled={creating}>Back</button>
                <button type="button" ref={primaryRef} className="onb-btn is-primary" onClick={finish} disabled={creating}>
                  {creating ? 'Setting up…' : 'Open Sush'} {!creating && <Icon name="arrowRight" size={14} />}
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
      <footer className="onb-foot">Everything stays on this computer.</footer>
    </div>
  )
}
