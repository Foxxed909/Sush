import React, { useEffect, useState } from 'react'
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
    <div style={{ marginBottom: 24 }}>
      <div style={{ color: accent, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14, paddingBottom: 7, borderBottom: `1px solid ${rgba(accent, 0.18)}` }}>{title}</div>
      {children}
    </div>
  )
}

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

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 340,
        height: '100%',
        background: '#0c0e11',
        borderLeft: `1px solid ${rgba(accent, 0.2)}`,
        padding: '0',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px 14px', borderBottom: '1px solid #171c22', flexShrink: 0 }}>
          <span style={{ color: '#f1f4f6', fontWeight: 900, fontSize: 15, letterSpacing: 0.2 }}>Settings</span>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #20272e', background: '#11151a', color: '#8a939c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div style={{ padding: '18px 20px', flex: 1 }}>
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
              <div style={{ fontSize: 11.5, color: '#76808a', background: rgba(accent, 0.05), border: `1px solid ${rgba(accent, 0.16)}`, borderRadius: 8, padding: '9px 12px', lineHeight: 1.5 }}>
                Seducia drives your logged-in <strong style={{ color: accent }}>claude</strong> CLI — no API key, no extra billing. Run <strong style={{ color: '#e1e6ea' }}>claude</strong> once in a terminal to sign in. Replies arrive as a single message (not streamed token-by-token).
              </div>
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
          </Section>

          {/* Profile */}
          <Section title="Sush Profile" accent={accent}>
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
          </Section>
        </div>
      </div>
    </div>
  )
}
