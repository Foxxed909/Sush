import React, { useEffect, useRef, useState } from 'react'
import { themes } from '../themes'
import Icon from './Icons'
import { getPlan, loadPlan } from '../lib/plan'
import { rgba } from '../lib/ui'
import { fetchElevenVoices } from '../lib/voice'

const FONTS = ["'Cascadia Code'", "'Fira Code'", "Consolas", "'JetBrains Mono'", "'Courier New'"]
const CURSORS = ['block', 'bar', 'underline']
const TTS_RATES = [0.75, 1.0, 1.1, 1.25, 1.5, 1.75]
const ELEVEN_MODELS = [
  { id: 'eleven_flash_v2_5', label: 'Flash v2.5 (fastest)' },
  { id: 'eleven_turbo_v2_5', label: 'Turbo v2.5 (balanced)' },
  { id: 'eleven_multilingual_v2', label: 'Multilingual v2 (richest)' }
]
const CORNERS = [{ id: 'sharp', label: 'Sharp' }, { id: 'rounded', label: 'Rounded' }, { id: 'pill', label: 'Pill' }]

function Label({ children }) {
  return <div style={{ color: '#76808a', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 7 }}>{children}</div>
}

function Section({ title, accent, children }) {
  return (
    <div data-settings-sec={title} style={{ marginBottom: 28, scrollMarginTop: 12 }}>
      <div style={{ color: accent, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14, paddingBottom: 7, borderBottom: `1px solid ${rgba(accent, 0.18)}` }}>{title}</div>
      {children}
    </div>
  )
}

// Nav entries -> the Section titles they scroll to. Adding a settings page =
// add a <Section title="..."> in the body + one row here.
const SETTINGS_NAV = [
  { label: 'Plan', sec: 'Plan', icon: 'spark' },
  { label: 'Accounts', sec: 'Accounts', icon: 'users' },
  { label: 'AI & Seducia', sec: 'AI -- Seducia', icon: 'sparkles' },
  { label: 'Voice', sec: 'Voice / Jarvis', icon: 'mic' },
  { label: 'Terminal', sec: 'Terminal', icon: 'terminal' },
  { label: 'Appearance', sec: 'Appearance', icon: 'palette' },
  { label: 'Theme', sec: 'Theme', icon: 'layout' },
  { label: 'Sush Profile', sec: 'Sush Profile', icon: 'fileText' },
  { label: 'Window', sec: 'Window', icon: 'layers' }
]

function Row({ children }) {
  return <div style={{ marginBottom: 16 }}>{children}</div>
}

function ApiKeyField({ label, value, onChange, accent, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <Row>
      <Label>{label}</Label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#0f1318', border: `1px solid ${value ? rgba(accent, 0.4) : '#20272e'}`, borderRadius: 8, padding: '0 10px', height: 36, gap: 8 }}>
          <Icon name="key" size={13} color={value ? accent : '#5a646d'} />
          <input
            type={show ? 'text' : 'password'}
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder || 'sk-...'}
            spellCheck={false}
            autoComplete="new-password"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f1f4f6', fontSize: 12.5 }}
          />
        </div>
        <button
          onClick={() => setShow(s => !s)}
          title={show ? 'Hide' : 'Show'}
          style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #20272e', background: '#11151a', color: '#76808a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name={show ? 'eyeOff' : 'eye'} size={14} />
        </button>
        {value && (
          <button
            onClick={() => onChange('')}
            title="Clear"
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,83,112,0.3)', background: 'rgba(255,83,112,0.07)', color: '#ff5370', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="x" size={13} />
          </button>
        )}
      </div>
      {value && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 10.5, color: '#7ee787' }}>
          <Icon name="check" size={11} color="#7ee787" strokeWidth={2.6} />
          Key saved
        </div>
      )}
    </Row>
  )
}

// Custom wallpaper: picked image -> downscaled JPEG data URL in settings
// (localStorage, per user). Shows behind glass surfaces and the home screen;
// the dim slider keeps text readable over busy images.
function WallpaperRow({ accent, settings, set }) {
  const fileRef = useRef(null)
  const [err, setErr] = useState('')

  const onFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr('')
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const maxW = 1600
        const scale = Math.min(1, maxW / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78)
        if (dataUrl.length > 2_500_000) setErr('That image is too large even after compression - try a smaller one.')
        else set('bgImage', dataUrl)
      } catch (e2) {
        setErr(e2.message)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url); setErr('Could not read that image') }
    img.src = url
  }

  return (
    <Row>
      <Label>Background wallpaper</Label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => fileRef.current?.click()}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#0f1318', border: `1px solid ${rgba(accent, 0.3)}`, color: '#d4dbe1', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
        >
          <Icon name="palette" size={14} color={accent} strokeWidth={2} />
          {settings.bgImage ? 'Change image' : 'Choose image'}
        </button>
        {settings.bgImage && (
          <>
            <img src={settings.bgImage} alt="" style={{ width: 56, height: 32, objectFit: 'cover', borderRadius: 6, border: '1px solid #20272e' }} />
            <button onClick={() => set('bgImage', '')} style={{ background: 'none', border: 'none', color: '#7a838b', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
              remove
            </button>
          </>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      {settings.bgImage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <span style={{ fontSize: 11, color: '#76808a', fontWeight: 700 }}>Dim</span>
          <input type="range" min={20} max={92} value={settings.bgDim ?? 62} onChange={e => set('bgDim', Number(e.target.value))} style={{ flex: 1, accentColor: accent }} />
          <span style={{ color: '#e1e6ea', fontSize: 12, width: 36, textAlign: 'right', fontWeight: 700 }}>{settings.bgDim ?? 62}%</span>
        </div>
      )}
      {err && <div style={{ color: '#ff8aa0', fontSize: 11, fontWeight: 700, marginTop: 6 }}>{err}</div>}
      <div style={{ fontSize: 10.5, color: '#5a646d', marginTop: 6, lineHeight: 1.5 }}>
        Shows through the glass chrome and the home screen (glass themes show the most). Stored per user.
      </div>
    </Row>
  )
}

// The account switcher. One row per signed-in account, per CLI: "Account 1"
// is the identity's own login, extra accounts get their own isolated config
// dir. Adding one opens a session running that CLI so its normal browser
// sign-in (Google and friends) takes over — Sush never sees the credentials,
// it only points the CLI at the right slot. The OAuth plumbing that used to
// live here (GitHub/Google client status) is an app concern, not a user one,
// so it no longer has UI.
function AccountsSection({ accent, settings, set }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [limits, setLimits] = useState(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    window.sush.accountsList?.().then(r => { if (r?.ok) setData(r.providers) }).catch(() => {})
    window.sush.claudeLimitsGet?.().then(r => { if (r?.limits) setLimits(r.limits) }).catch(() => {})
  }, [])

  const checkLimits = async () => {
    setChecking(true)
    setErr('')
    const r = await window.sush.claudeLimitsCheck?.()
    if (r?.ok && r.limits) setLimits(r.limits)
    else if (r?.error) setErr(r.error)
    setChecking(false)
  }

  const call = async (fn) => {
    setBusy(true)
    setErr('')
    const r = await fn()
    if (r?.ok) setData(r.providers)
    // Every failure is shown — a swallowed 'no-user' here let "+ Add account"
    // fail invisibly and the user think the slot feature was a no-op.
    else setErr(r?.error === 'no-user' ? 'No Sush profile is signed in - sign in first.' : (r?.error || 'Something went wrong'))
    setBusy(false)
  }

  const providers = [
    ['claude', 'Claude', 'Claude Pro / Max subscription'],
    ['codex', 'Codex', 'ChatGPT subscription']
  ]
  const slotName = (slot, i) => slot.id === 'default' ? 'Account 1' : (slot.label || `Account ${i + 1}`)

  return (
    <Section title="Accounts" accent={accent}>
      <div style={{ fontSize: 11, color: '#76808a', lineHeight: 1.6, marginBottom: 14 }}>
        Each account is a separate CLI login. Add a second one and Sush can hop
        over when the first hits its session limit. Sign-in happens in the
        CLI's own browser flow (Google sign-in supported) — Sush never sees
        your credentials.
      </div>
      {!data && (
        <div className="flex items-center" style={{ gap: 8, color: '#5a646d', fontSize: 11.5, fontWeight: 700, padding: '6px 0 14px' }}>
          <span className="sush-spinner" style={{ width: 13, height: 13 }} />
          Loading accounts…
        </div>
      )}
      {data && providers.map(([p, label, sub]) => {
        const st = data[p] || { active: 'default', slots: [] }
        return (
          <div key={p} style={{ marginBottom: 14, borderRadius: 'var(--r-lg)', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
            <div className="flex items-center" style={{ gap: 9, padding: '10px 13px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: '#e6ebef' }}>{label}</div>
                <div style={{ fontSize: 10, color: '#5a646d', marginTop: 1 }}>{sub}</div>
              </div>
              <button
                onClick={() => call(async () => {
                  const r = await window.sush.accountsAdd({ provider: p })
                  // Hand the user straight to the sign-in: the new slot is
                  // already active, so a fresh session of this CLI prompts
                  // its own login flow (browser OAuth) — no manual steps.
                  if (r?.ok) window.dispatchEvent(new CustomEvent('sush:open-login-session', { detail: { provider: p } }))
                  return r
                })}
                disabled={busy}
                className="sush-mini-btn"
                style={{ fontSize: 10.5, fontWeight: 800, color: accent, background: rgba(accent, 0.08), border: `1px solid ${rgba(accent, 0.28)}`, borderRadius: 999, padding: '4px 12px', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
              >
                + Add account
              </button>
            </div>
            {st.slots.map((slot, i) => {
              const on = st.active === slot.id
              return (
                <div key={slot.id} className="flex items-center sush-row-hover" style={{ gap: 10, padding: '8px 13px' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: on ? '#5fd3a8' : 'rgba(255,255,255,0.16)', boxShadow: on ? '0 0 7px rgba(95,211,168,0.6)' : 'none' }} />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: on ? '#e6ebef' : '#8a939c' }}>{slotName(slot, i)}</span>
                  {on ? (
                    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, color: '#5fd3a8' }}>ACTIVE</span>
                  ) : (
                    <button
                      onClick={() => call(() => window.sush.accountsSwitch({ provider: p, slotId: slot.id }))}
                      disabled={busy}
                      style={{ fontSize: 10.5, fontWeight: 800, color: '#aab3bb', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 999, padding: '3px 11px', cursor: 'pointer' }}
                    >
                      Switch
                    </button>
                  )}
                  {slot.id !== 'default' && (
                    <button onClick={() => call(() => window.sush.accountsRemove({ provider: p, slotId: slot.id }))} disabled={busy} title="Remove this account" style={{ background: 'none', border: 'none', color: '#5a646d', cursor: 'pointer', padding: '0 2px', fontSize: 13, lineHeight: 1 }}>
                      ×
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Claude limit previewer — passive capture from panel runs + an active probe */}
      <div className="flex items-center" style={{ gap: 10, marginBottom: 12, padding: '9px 13px', borderRadius: 'var(--r-lg)', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <Icon name="activity" size={13} color={limits?.status === 'allowed' ? '#5fd3a8' : limits ? '#ffb74d' : '#5a646d'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#c6cdd4' }}>
            {!limits
              ? 'Claude limit: unknown'
              : limits.status === 'allowed'
                ? 'Claude limit: OK'
                : `Claude limit: ${limits.status}`}
          </div>
          <div style={{ fontSize: 10.5, color: '#69737d', marginTop: 1 }}>
            {limits?.resetsAt
              ? `${limits.rateLimitType ? limits.rateLimitType.replace(/_/g, ' ') + ' window - ' : ''}resets ${new Date(limits.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Use the Claude panel once, or check now.'}
          </div>
        </div>
        <button
          onClick={checkLimits}
          disabled={checking}
          className="flex items-center"
          style={{ gap: 6, fontSize: 10.5, fontWeight: 800, color: accent, background: rgba(accent, 0.1), border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 999, padding: '3px 11px', cursor: 'pointer', opacity: checking ? 0.6 : 1 }}
        >
          {checking && <span className="sush-spinner" style={{ width: 10, height: 10 }} />}
          {checking ? 'Checking…' : 'Check now'}
        </button>
      </div>

      <Row>
        <Label>When an account hits its limit</Label>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['never', 'Never switch'], ['ask', 'Ask me'], ['auto', 'Auto switch']].map(([val, lbl]) => {
            const current = settings.cliLimitPolicy || 'ask'
            const on = current === val
            return (
              <button
                key={val}
                onClick={() => set('cliLimitPolicy', val)}
                style={{ flex: 1, padding: '7px 0', borderRadius: 'var(--r-sm)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', background: on ? accent : '#0f1318', color: on ? '#0a0a0a' : '#8a939c', border: `1px solid ${on ? accent : '#20272e'}` }}
              >
                {lbl}
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: 10.5, color: '#5a646d', marginTop: 5, lineHeight: 1.5 }}>
          With a second account added: keep failing, tell you a switch is available, or hop accounts and retry automatically.
        </div>
      </Row>
      {err && <div style={{ color: '#ff8aa0', fontSize: 11, fontWeight: 700, marginTop: 4 }}>{err}</div>}
    </Section>
  )
}

export default function Settings({ settings, onChange, onClose, accent, onUpgrade, onEditSushrc }) {
  const set = (key, val) => onChange({ ...settings, [key]: val })
  const plan = getPlan(loadPlan())
  const [voices, setVoices] = useState([])
  const [elevenVoices, setElevenVoices] = useState([])
  const [loadingVoices, setLoadingVoices] = useState(false)

  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis?.getVoices() ?? [])
    load()
    window.speechSynthesis?.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', load)
  }, [])

  const loadElevenVoices = async (key) => {
    if (!key) { setElevenVoices([]); return }
    setLoadingVoices(true)
    const list = await fetchElevenVoices(key)
    setElevenVoices(list)
    setLoadingVoices(false)
  }
  // Pull the voice list once if a key is already saved.
  useEffect(() => { if (settings.elevenLabsKey) loadElevenVoices(settings.elevenLabsKey) }, [])

  // Standalone settings page: left nav scrolls the content pane to the
  // matching section.
  const bodyRef = useRef(null)
  const [activeSec, setActiveSec] = useState(SETTINGS_NAV[0].sec)
  const goTo = (sec) => {
    setActiveSec(sec)
    bodyRef.current?.querySelector(`[data-settings-sec="${sec}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sush-page-in" style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', background: '#08090c' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 26px', borderBottom: '1px solid #171c22', flexShrink: 0 }}>
        <div className="flex items-center" style={{ gap: 11 }}>
          <span className="flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 9, background: rgba(accent, 0.12), border: `1px solid ${rgba(accent, 0.3)}`, color: accent }}>
            <Icon name="settings" size={16} strokeWidth={2} />
          </span>
          <span style={{ color: '#f1f4f6', fontWeight: 900, fontSize: 16, letterSpacing: 0.2 }}>Settings</span>
        </div>
        <button onClick={onClose} title="Back (Esc)" className="flex items-center" style={{ gap: 7, height: 32, padding: '0 13px', borderRadius: 9, border: '1px solid #20272e', background: '#11151a', color: '#aab3bb', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
          <Icon name="x" size={13} /> Close
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Section nav */}
        <nav style={{ width: 190, flexShrink: 0, borderRight: '1px solid #171c22', padding: '14px 10px', overflowY: 'auto' }} className="sush-scroll">
          {SETTINGS_NAV.map(item => {
            const on = activeSec === item.sec
            return (
              <button
                key={item.sec}
                onClick={() => goTo(item.sec)}
                className="flex items-center"
                style={{ gap: 9, width: '100%', padding: '8px 11px', marginBottom: 2, borderRadius: 9, border: 'none', textAlign: 'left', background: on ? rgba(accent, 0.12) : 'transparent', color: on ? accent : '#8a939c', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
              >
                <Icon name={item.icon} size={14} strokeWidth={2} color={on ? accent : '#5a646d'} />
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Content */}
        <div ref={bodyRef} className="sush-scroll" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '22px 30px' }}>
          <div style={{ maxWidth: 640 }}>
          {/* Plan */}
          <Section title="Plan" accent={accent}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, background: rgba(plan.color, 0.08), border: `1px solid ${rgba(plan.color, 0.25)}` }}>
              <div className="flex items-center" style={{ gap: 9 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: plan.color, boxShadow: `0 0 8px ${plan.color}` }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#f1f4f6' }}>{plan.name}</div>
                  <div style={{ fontSize: 10.5, color: '#76808a' }}>{plan.price === 0 ? 'Free forever' : `$${plan.price}/mo`}</div>
                </div>
              </div>
              <button
                onClick={onUpgrade}
                style={{ fontSize: 11, fontWeight: 800, color: accent, background: rgba(accent, 0.1), border: `1px solid ${rgba(accent, 0.35)}`, borderRadius: 8, padding: '5px 11px', cursor: 'pointer' }}
              >
                {plan.id === 'king' ? 'Manage' : 'Upgrade'}
              </button>
            </div>
          </Section>

          {/* AI */}
          <Section title="AI -- Seducia" accent={accent}>
            {!plan.features.seduciaAI && (
              <div style={{ fontSize: 11.5, color: '#76808a', background: 'rgba(255,183,77,0.06)', border: '1px solid rgba(255,183,77,0.18)', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
                AI mode requires <strong style={{ color: '#ffb74d' }}>Quiet</strong> plan or higher.{' '}
                <span onClick={onUpgrade} style={{ color: accent, cursor: 'pointer', fontWeight: 700 }}>Upgrade →</span>
              </div>
            )}
            <Row>
              <Label>Provider</Label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['key', 'API key'], ['cli', 'Claude CLI']].map(([val, lbl]) => {
                  const current = settings.seduciaProvider === 'cli' ? 'cli' : 'key'
                  const on = current === val
                  return (
                    <button
                      key={val}
                      onClick={() => set('seduciaProvider', val)}
                      style={{ flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: on ? accent : '#0f1318', color: on ? '#0a0a0a' : '#8a939c', border: `1px solid ${on ? accent : '#20272e'}` }}
                    >
                      {lbl}
                    </button>
                  )
                })}
              </div>
            </Row>
            {settings.seduciaProvider === 'cli' ? (
              <>
                <Row>
                  <Label>CLI engine</Label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[['auto', 'Auto'], ['claude', 'Claude'], ['codex', 'Codex'], ['gemini', 'Gemini']].map(([val, lbl]) => {
                      const current = settings.seduciaCliEngine || 'auto'
                      const on = current === val
                      return (
                        <button
                          key={val}
                          onClick={() => set('seduciaCliEngine', val)}
                          style={{ flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', background: on ? accent : '#0f1318', color: on ? '#0a0a0a' : '#8a939c', border: `1px solid ${on ? accent : '#20272e'}` }}
                        >
                          {lbl}
                        </button>
                      )
                    })}
                  </div>
                </Row>
                <div style={{ fontSize: 11.5, color: '#76808a', background: rgba(accent, 0.05), border: `1px solid ${rgba(accent, 0.16)}`, borderRadius: 8, padding: '9px 12px', lineHeight: 1.5 }}>
                  Seducia drives your logged-in agent CLIs — no API key, no extra billing. <strong style={{ color: accent }}>Auto</strong> tries claude first and rolls over to codex, then gemini when one is limited or missing (handy for Claude session limits). Replies arrive as a single message. Manage logins and limit behaviour under <strong style={{ color: accent }}>Accounts</strong>.
                </div>
              </>
            ) : (
              <>
                <ApiKeyField
                  label="Anthropic API key"
                  value={settings.anthropicKey ?? ''}
                  onChange={v => set('anthropicKey', v)}
                  accent={accent}
                  placeholder="sk-ant-..."
                />
                <ApiKeyField
                  label="OpenAI API key"
                  value={settings.openaiKey ?? ''}
                  onChange={v => set('openaiKey', v)}
                  accent={accent}
                  placeholder="sk-..."
                />
              </>
            )}
          </Section>

          {/* Accounts — the Claude/Codex account switcher */}
          <AccountsSection accent={accent} settings={settings} set={set} />

          {/* Voice */}
          <Section title="Voice / Jarvis" accent={accent}>
            {!plan.features.voiceMode && (
              <div style={{ fontSize: 11.5, color: '#76808a', background: 'rgba(255,183,77,0.06)', border: '1px solid rgba(255,183,77,0.18)', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
                Voice mode requires <strong style={{ color: '#ffb74d' }}>Quiet</strong> plan or higher.
              </div>
            )}
            <Row>
              <Label>Text-to-speech (Seducia speaks back)</Label>
              <button
                onClick={() => set('ttsEnabled', !settings.ttsEnabled)}
                disabled={!plan.features.voiceMode}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: settings.ttsEnabled ? rgba(accent, 0.1) : '#0f1318', border: `1px solid ${settings.ttsEnabled ? rgba(accent, 0.4) : '#20272e'}`, color: settings.ttsEnabled ? accent : '#76808a', cursor: plan.features.voiceMode ? 'pointer' : 'default', fontSize: 12.5, fontWeight: 700, opacity: plan.features.voiceMode ? 1 : 0.5 }}
              >
                <Icon name="volume2" size={14} strokeWidth={2} />
                {settings.ttsEnabled ? 'TTS enabled' : 'TTS disabled'}
              </button>
            </Row>
            {settings.ttsEnabled && plan.features.voiceMode && (
              <>
                <Row>
                  <Label>Speech rate</Label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {TTS_RATES.map(r => (
                      <button key={r} onClick={() => set('ttsRate', r)} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: (settings.ttsRate ?? 1.1) === r ? accent : '#0f1318', color: (settings.ttsRate ?? 1.1) === r ? '#0a0a0a' : '#8a939c', border: `1px solid ${(settings.ttsRate ?? 1.1) === r ? accent : '#20272e'}` }}>
                        {r}×
                      </button>
                    ))}
                  </div>
                </Row>
                {voices.length > 0 && (
                  <Row>
                    <Label>System voice (fallback)</Label>
                    <select value={settings.ttsVoice ?? ''} onChange={e => set('ttsVoice', e.target.value)} style={{ width: '100%', background: '#0f1318', border: `1px solid #20272e`, color: '#e1e6ea', borderRadius: 8, padding: '7px 10px', fontSize: 12 }}>
                      <option value="">System default</option>
                      {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                    </select>
                  </Row>
                )}

                {/* ElevenLabs -- the real Jarvis voice */}
                <div style={{ marginTop: 4, marginBottom: 14, paddingTop: 14, borderTop: '1px solid #1a1f25' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#cdd5dc', marginBottom: 4 }}>ElevenLabs voice</div>
                  <div style={{ fontSize: 11, color: '#76808a', lineHeight: 1.5, marginBottom: 12 }}>
                    Give Seducia a real, low-latency voice. Add a key, load voices, and pick one. Falls back to the system voice above if unset.
                  </div>
                  <ApiKeyField
                    label="ElevenLabs API key"
                    value={settings.elevenLabsKey ?? ''}
                    onChange={v => { set('elevenLabsKey', v) }}
                    accent={accent}
                    placeholder="sk_..."
                  />
                  <Row>
                    <button
                      onClick={() => loadElevenVoices(settings.elevenLabsKey)}
                      disabled={!settings.elevenLabsKey || loadingVoices}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 8, background: settings.elevenLabsKey ? rgba(accent, 0.1) : '#0f1318', border: `1px solid ${settings.elevenLabsKey ? rgba(accent, 0.4) : '#20272e'}`, color: settings.elevenLabsKey ? accent : '#5a646d', cursor: settings.elevenLabsKey && !loadingVoices ? 'pointer' : 'default', fontSize: 12, fontWeight: 700 }}
                    >
                      <Icon name={loadingVoices ? 'sparkles' : 'volume2'} size={13} strokeWidth={2} className={loadingVoices ? 'sush-spin' : undefined} />
                      {loadingVoices ? 'Loading voices...' : elevenVoices.length ? `Reload voices (${elevenVoices.length})` : 'Load voices'}
                    </button>
                  </Row>
                  {elevenVoices.length > 0 && (
                    <Row>
                      <Label>ElevenLabs voice</Label>
                      <select value={settings.elevenLabsVoice ?? ''} onChange={e => set('elevenLabsVoice', e.target.value)} style={{ width: '100%', background: '#0f1318', border: `1px solid ${settings.elevenLabsVoice ? rgba(accent, 0.4) : '#20272e'}`, color: '#e1e6ea', borderRadius: 8, padding: '7px 10px', fontSize: 12 }}>
                        <option value="">Select a voice...</option>
                        {elevenVoices.map(v => <option key={v.id} value={v.id}>{v.name}{v.category ? ` (${v.category})` : ''}</option>)}
                      </select>
                    </Row>
                  )}
                  <Row>
                    <Label>Model</Label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {ELEVEN_MODELS.map(m => {
                        const on = (settings.elevenLabsModel ?? 'eleven_flash_v2_5') === m.id
                        return (
                          <button key={m.id} onClick={() => set('elevenLabsModel', m.id)} title={m.label}
                            style={{ flex: 1, padding: '6px 4px', borderRadius: 6, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', background: on ? accent : '#0f1318', color: on ? '#05070b' : '#8a939c', border: `1px solid ${on ? accent : '#20272e'}`, lineHeight: 1.2 }}>
                            {m.label.split(' (')[0]}
                          </button>
                        )
                      })}
                    </div>
                  </Row>
                  <div style={{ fontSize: 10.5, color: '#5a646d', lineHeight: 1.5 }}>
                    Tip: enable the wake word from the Seducia orb (the radio icon), then just say <strong style={{ color: '#aab3bb' }}>"Seducia"</strong> followed by a command. She'll stop talking the moment you speak.
                  </div>
                </div>
              </>
            )}
          </Section>

          {/* Terminal */}
          <Section title="Terminal" accent={accent}>
            <Row>
              <Label>Font size</Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="range" min={8} max={28} value={settings.fontSize ?? 14} onChange={e => set('fontSize', Number(e.target.value))} style={{ flex: 1, accentColor: accent }} />
                <span style={{ color: '#e1e6ea', fontSize: 12, width: 24, textAlign: 'right', fontWeight: 700 }}>{settings.fontSize ?? 14}</span>
              </div>
            </Row>
            <Row>
              <Label>Font family</Label>
              <select value={settings.fontFamily ?? FONTS[0]} onChange={e => set('fontFamily', e.target.value)} style={{ width: '100%', background: '#0f1318', border: `1px solid #20272e`, color: '#e1e6ea', borderRadius: 8, padding: '7px 10px', fontSize: 12 }}>
                {FONTS.map(f => <option key={f} value={f}>{f.replace(/'/g, '')}</option>)}
              </select>
            </Row>
            <Row>
              <Label>Cursor style</Label>
              <div style={{ display: 'flex', gap: 6 }}>
                {CURSORS.map(c => (
                  <button key={c} onClick={() => set('cursorStyle', c)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700, background: (settings.cursorStyle ?? 'block') === c ? accent : '#0f1318', color: (settings.cursorStyle ?? 'block') === c ? '#000' : '#8a939c', border: `1px solid ${(settings.cursorStyle ?? 'block') === c ? accent : '#20272e'}` }}>
                    {c}
                  </button>
                ))}
              </div>
            </Row>
          </Section>

          {/* Appearance */}
          <Section title="Appearance" accent={accent}>
            <Row>
              <Label>Reduce effects (performance)</Label>
              <button
                onClick={() => set('lite', !settings.lite)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: settings.lite ? rgba(accent, 0.1) : '#0f1318', border: `1px solid ${settings.lite ? rgba(accent, 0.4) : '#20272e'}`, color: settings.lite ? accent : '#76808a', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, width: '100%' }}
              >
                <Icon name="activity" size={14} strokeWidth={2} />
                {settings.lite ? 'Lite mode on — glass blur off' : 'Full glass effects'}
              </button>
              <div style={{ fontSize: 10.5, color: '#5a646d', marginTop: 6, lineHeight: 1.4 }}>
                Drops the frosted-glass blur and ambient glow animations. Big GPU
                saver on laptops or when running a busy agent swarm.
              </div>
            </Row>
            <Row>
              <Label>Corners</Label>
              <div style={{ display: 'flex', gap: 6 }}>
                {CORNERS.map(c => {
                  const on = (settings.cornerStyle ?? 'rounded') === c.id
                  const demo = c.id === 'sharp' ? 2 : c.id === 'pill' ? 999 : 9
                  return (
                    <button
                      key={c.id}
                      onClick={() => set('cornerStyle', c.id)}
                      style={{ flex: 1, padding: '8px 0', fontSize: 12, cursor: 'pointer', fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: on ? rgba(accent, 0.1) : '#0f1318', color: on ? accent : '#8a939c', border: `1px solid ${on ? accent : '#20272e'}`, borderRadius: 9 }}
                    >
                      <span style={{ width: 26, height: 16, background: on ? rgba(accent, 0.3) : '#2a333c', borderRadius: Math.min(demo, 8), border: `1px solid ${on ? accent : '#3a444e'}` }} />
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </Row>
            <Row>
              <Label>Restore session history</Label>
              <button
                onClick={() => set('persistScrollback', settings.persistScrollback === false)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: settings.persistScrollback !== false ? rgba(accent, 0.1) : '#0f1318', border: `1px solid ${settings.persistScrollback !== false ? rgba(accent, 0.4) : '#20272e'}`, color: settings.persistScrollback !== false ? accent : '#76808a', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, width: '100%' }}
              >
                <Icon name="clock" size={14} strokeWidth={2} />
                {settings.persistScrollback !== false ? 'Replaying recent output on reopen' : 'History restore off'}
              </button>
            </Row>
            <Row>
              <Label>Resume agent sessions on launch</Label>
              <button
                onClick={() => set('resumeAgents', settings.resumeAgents === false)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: settings.resumeAgents !== false ? rgba(accent, 0.1) : '#0f1318', border: `1px solid ${settings.resumeAgents !== false ? rgba(accent, 0.4) : '#20272e'}`, color: settings.resumeAgents !== false ? accent : '#76808a', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, width: '100%' }}
              >
                <Icon name="terminal" size={14} strokeWidth={2} />
                {settings.resumeAgents !== false ? 'Re-launching agents (claude --continue, …)' : 'Restored tabs open a bare shell'}
              </button>
              <div style={{ fontSize: 10.5, color: '#5a646d', marginTop: 6, lineHeight: 1.4 }}>
                When on, a restored Claude/Codex tab re-runs its CLI in resume mode so the
                previous conversation continues. Applies on next launch.
              </div>
            </Row>
            <WallpaperRow accent={accent} settings={settings} set={set} />
          </Section>

          {/* Profile */}
          <Section title="Sush Profile" accent={accent}>
            <Row>
              <Label>Suggest aliases from habits</Label>
              <button
                onClick={() => set('autoAlias', settings.autoAlias === false)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: settings.autoAlias !== false ? rgba(accent, 0.1) : '#0f1318', border: `1px solid ${settings.autoAlias !== false ? rgba(accent, 0.4) : '#20272e'}`, color: settings.autoAlias !== false ? accent : '#76808a', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, width: '100%' }}
              >
                <Icon name="sparkles" size={14} strokeWidth={2} />
                {settings.autoAlias !== false ? 'Offering aliases for repeated commands' : 'Alias suggestions off'}
              </button>
              <div style={{ fontSize: 10.5, color: '#5a646d', marginTop: 6, lineHeight: 1.4 }}>
                Run a command ~15× and Sush offers to save it as a short alias in
                your .sushrc. Nothing is written until you accept.
              </div>
            </Row>
            <Row>
              <Label>.sushrc — aliases, env, startup</Label>
              <button
                onClick={() => onEditSushrc?.()}
                className="sush-btn"
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 9, background: '#0f1318', border: `1px solid ${rgba(accent, 0.3)}`, color: '#d4dbe1', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, width: '100%' }}
              >
                <Icon name="fileText" size={14} color={accent} strokeWidth={2} />
                Edit .sushrc profile
                <Icon name="arrowRight" size={13} color="#5a646d" style={{ marginLeft: 'auto' }} />
              </button>
            </Row>
          </Section>

          {/* Theme */}
          <Section title="Theme" accent={accent}>
            <Row>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.values(themes).map(t => (
                  <button key={t.id} onClick={() => set('themeId', t.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, cursor: 'pointer', background: (settings.themeId ?? 'pink') === t.id ? rgba(t.ui.accent, 0.1) : '#0f1318', border: `1px solid ${(settings.themeId ?? 'pink') === t.id ? t.ui.accent : '#20272e'}`, color: '#e1e6ea', fontSize: 13, textAlign: 'left' }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: t.ui.accent, flexShrink: 0, boxShadow: `0 0 6px ${t.ui.accent}` }} />
                    {t.label}
                    {(settings.themeId ?? 'pink') === t.id && <Icon name="check" size={13} color={t.ui.accent} style={{ marginLeft: 'auto' }} />}
                  </button>
                ))}
              </div>
            </Row>
          </Section>

          {/* Window */}
          <Section title="Window" accent={accent}>
            <Row>
              <Label>Background opacity</Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="range" min={70} max={100} value={settings.opacity ?? 100} onChange={e => set('opacity', Number(e.target.value))} style={{ flex: 1, accentColor: accent }} />
                <span style={{ color: '#e1e6ea', fontSize: 12, width: 36, textAlign: 'right', fontWeight: 700 }}>{settings.opacity ?? 100}%</span>
              </div>
            </Row>
            <Row>
              <Label>Minimize to tray</Label>
              <button
                onClick={() => set('minimizeToTray', !settings.minimizeToTray)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: settings.minimizeToTray ? rgba(accent, 0.1) : '#0f1318', border: `1px solid ${settings.minimizeToTray ? rgba(accent, 0.4) : '#20272e'}`, color: settings.minimizeToTray ? accent : '#76808a', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
              >
                {settings.minimizeToTray ? 'On - minimize hides Sush into the tray' : 'Off - minimize goes to the taskbar'}
              </button>
              <div style={{ fontSize: 10.5, color: '#5a646d', marginTop: 5, lineHeight: 1.5 }}>
                When on, the minimize dot tucks Sush into the system tray. Click the tray icon to bring it back.
              </div>
            </Row>
            <Row>
              <Label>Hush dictation</Label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => set('hushEnabled', settings.hushEnabled === false ? true : false)}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: settings.hushEnabled !== false ? rgba(accent, 0.1) : '#0f1318', border: `1px solid ${settings.hushEnabled !== false ? rgba(accent, 0.4) : '#20272e'}`, color: settings.hushEnabled !== false ? accent : '#76808a', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
                >
                  {settings.hushEnabled !== false ? 'On - mic button + Ctrl+Shift+S' : 'Off'}
                </button>
                {settings.hushEnabled !== false && (
                  <button
                    onClick={() => set('hushAutoSend', settings.hushAutoSend === false ? true : false)}
                    title="Whether dictation presses Enter for you"
                    style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: '#0f1318', border: '1px solid #20272e', color: '#aab3bb', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
                  >
                    {settings.hushAutoSend !== false ? 'Sends automatically' : 'Review before send'}
                  </button>
                )}
              </div>
              <div style={{ fontSize: 10.5, color: '#5a646d', marginTop: 5, lineHeight: 1.5 }}>
                Hush types what you say into the focused terminal and presses Enter (switch to review mode to check before sending). Pure dictation, separate from Seducia. Note: only one voice listener can hold the mic - turn off Seducia's wake word to use Hush.
              </div>
            </Row>
            <Row>
              <Label>Sleep after inactivity</Label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[0, 5, 10, 20, 30].map(mins => {
                  const current = settings.idleSleepMinutes ?? 10
                  const on = current === mins
                  return (
                    <button
                      key={mins}
                      onClick={() => set('idleSleepMinutes', mins)}
                      style={{ padding: '7px 13px', borderRadius: 8, border: `1px solid ${on ? rgba(accent, 0.5) : '#20272e'}`, background: on ? rgba(accent, 0.12) : '#0f1318', color: on ? accent : '#76808a', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                    >
                      {mins === 0 ? 'Off' : `${mins} min`}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: 10.5, color: '#5a646d', marginTop: 5, lineHeight: 1.5 }}>
                No input for this long and Sush dims, freezes animations, and stops every poll - terminals and agents keep running. Any key or click wakes it.
              </div>
            </Row>
          </Section>
          </div>
        </div>
      </div>
    </div>
  )
}
