import React, { useEffect, useState } from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { formatCredits } from '../../lib/dictation'
import { Section, Row, Label, Hint, Segment, Toggle, inputStyle } from './primitives'

// Voice & Dictation — everything spoken, in one place. TTS (Seducia speaks)
// and Hush (you speak) live together now, INCLUDING Hush's master toggle,
// which used to hide in "Window" two sections away from its own settings.

// Play a base64 audio clip once (used by the "Test" button).
function playB64(base64, mime) {
  try {
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'audio/mpeg' }))
    const a = new Audio(url)
    a.onended = () => URL.revokeObjectURL(url)
    a.play().catch(() => URL.revokeObjectURL(url))
  } catch {}
}

const TTS_RATES = [0.75, 1.0, 1.1, 1.25, 1.5, 1.75]
const TTS_ENGINES = [['system', 'System'], ['openai', 'OpenAI'], ['elevenlabs', 'ElevenLabs']]
const OPENAI_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse']
const STT_MODELS = ['whisper-1', 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe']

// Dictation (Hush): speak into the focused terminal. Local whisper.cpp is the
// default; the OpenAI route stays optional for people who explicitly configure
// it. Keys are held in main and never round-tripped here.
function DictationBlock({ accent, settings, set }) {
  const [stt, setStt] = useState(null)     // public config + credits from main
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const refresh = () => window.sush?.sttConfigGet?.().then(c => { if (c) setStt(c) }).catch(() => {})
  useEffect(() => { refresh() }, [])

  const saveCfg = async (patch) => {
    setBusy(true); setErr('')
    const r = await window.sush?.sttConfigSet?.(patch)
    if (r?.ok) setStt(r); else if (r?.error) setErr(r.error)
    setBusy(false)
    return r
  }
  const saveKey = async () => {
    if (!keyInput.trim()) return
    const r = await saveCfg({ apiKey: keyInput.trim() })
    if (r?.ok) setKeyInput('')
  }

  const enabled = settings.hushEnabled !== false
  const autoSend = settings.hushAutoSend !== false
  const credits = stt?.credits
  const pct = credits && credits.allowanceSec ? Math.max(0, Math.min(100, Math.round(100 * credits.remainingSec / credits.allowanceSec))) : 0
  const reset = credits?.resetAt ? new Date(credits.resetAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null

  return (
    <>
      <Row>
        <Label>Dictation (Hush · speak into the terminal)</Label>
        <Toggle
          accent={accent}
          icon="mic"
          on={enabled}
          onText="Hush enabled — mic button + Ctrl+Shift+S"
          offText="Hush disabled"
          onClick={() => set('hushEnabled', !enabled)}
          fullWidth={false}
        />
        <Hint>Tap the mic (bottom-left) or press <strong style={{ color: accent }}>Ctrl+Shift+S</strong> anywhere, speak, and your words are typed into the focused terminal.</Hint>
      </Row>

      {enabled && (
        <>
          <Row>
            <Label>After transcribing</Label>
            <Segment
              accent={accent}
              value={autoSend}
              options={[[true, 'Send it'], [false, 'Type only']]}
              onChange={(v) => set('hushAutoSend', v)}
            />
            <Hint>{autoSend ? 'Runs the command as soon as it’s transcribed.' : 'Types it at the prompt so you can review, then press Enter yourself.'}</Hint>
          </Row>

          <Row>
            <Label>Transcription engine</Label>
            <Segment
              accent={accent}
              value={stt?.provider || 'local'}
              options={[['openai', 'OpenAI cloud'], ['local', 'Local whisper.cpp']]}
              onChange={(v) => saveCfg({ provider: v })}
              disabled={busy}
            />
            <Hint>
              {(stt?.provider || 'local') === 'local'
                ? stt?.localStatus?.ready
                  ? 'Local Whisper is ready — audio stays on this machine and never spends Quiet Credits.'
                  : `Local Whisper setup needed: ${(stt?.localStatus?.missing || ['whisper.cpp CLI', 'base.en model']).join(' + ')}. Nothing is sent to a cloud service.`
                : 'Whisper via your own OpenAI key. Metered by Quiet Credits (below).'}
            </Hint>
          </Row>

          {stt?.provider === 'local' && (
            <>
              <Row>
                <Label>whisper.cpp binary</Label>
                <input
                  className="sush-mono"
                  defaultValue={stt?.localBin || ''}
                  onBlur={e => saveCfg({ localBin: e.target.value })}
                  placeholder="Auto-detect (whisper-cli on PATH) — or paste a full path"
                  style={inputStyle}
                />
                {stt?.localStatus?.managedBin && <Hint>Managed install path: <span className="sush-mono">{stt.localStatus.managedBin}</span></Hint>}
              </Row>
              <Row>
                <Label>Model file (.bin / .gguf)</Label>
                <input
                  className="sush-mono"
                  defaultValue={stt?.localModel || ''}
                  onBlur={e => saveCfg({ localModel: e.target.value })}
                  placeholder={stt?.localStatus?.managedModel || 'e.g. ~/models/ggml-base.en.bin'}
                  style={inputStyle}
                />
                <Hint>Base.en is the default: fast, around 141 MB, and fully local. Sush auto-detects the managed install or accepts any .bin/.gguf path.</Hint>
              </Row>
            </>
          )}

          {stt?.provider !== 'local' && (
          <Row>
            <Label>Whisper API key (OpenAI)</Label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="password"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveKey() }}
                placeholder={stt?.hasKey ? '•••••••••• (saved — paste to replace)' : 'sk-...'}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={saveKey} disabled={busy || !keyInput.trim()} style={{ fontSize: 11.5, fontWeight: 800, color: accent, background: rgba(accent, 0.1), border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 8, padding: '0 14px', cursor: keyInput.trim() ? 'pointer' : 'default', opacity: keyInput.trim() ? 1 : 0.5 }}>Save</button>
              {stt?.hasKey && (
                <button onClick={() => saveCfg({ apiKey: '' })} disabled={busy} title="Forget key" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', background: 'transparent', border: '1px solid var(--border-2)', borderRadius: 8, padding: '0 12px', cursor: 'pointer' }}>Clear</button>
              )}
            </div>
            {stt && !stt.safeStorage && (
              <Hint warn>Your OS keychain isn’t available, so the key is stored unencrypted on this machine.</Hint>
            )}
            <Hint>Get a key at platform.openai.com. The key stays on this machine and never leaves the main process — Sush only sends your audio to OpenAI to transcribe it.</Hint>
          </Row>
          )}

          {stt?.provider !== 'local' && (
          <Row>
            <Label>Model</Label>
            <select value={stt?.model || ''} onChange={e => saveCfg({ model: e.target.value })} style={inputStyle}>
              <option value="">Default (whisper-1)</option>
              {STT_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Row>
          )}

          {stt?.provider !== 'local' && credits && (
            <Row>
              <Label>Quiet Credits · {stt.credits.tier} plan</Label>
              <div style={{ height: 8, borderRadius: 5, background: 'var(--surface-2)', border: '1px solid var(--border-2)', overflow: 'hidden' }}>
                <div style={{ width: '100%', height: '100%', background: pct <= 10 ? '#ffb74d' : accent, transform: `scaleX(${pct / 100})`, transformOrigin: 'left', transition: 'transform 400ms var(--ease-out)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-4)', marginTop: 6, fontWeight: 600 }}>
                <span>{formatCredits(credits.remainingSec)} of {Math.round(credits.allowanceSec / 60)}m</span>
                {reset && <span>Refills {reset}</span>}
              </div>
              <Hint>Dictation minutes reset monthly. More on <strong style={{ color: accent }}>Plus</strong> and <strong style={{ color: accent }}>Pro</strong> — see <strong style={{ color: accent }}>Plan</strong>.</Hint>
            </Row>
          )}
        </>
      )}
    </>
  )
}

// Voice settings: the system (Web Speech) voice OR a cloud neural voice driven
// by the user's own OpenAI/ElevenLabs key. The key is held in main and never
// round-trips here — this panel only sends it once on save and shows whether
// one is set. "Test" plays a sample through whichever engine is selected.
export default function VoiceSection({ accent, settings, set, voices, ent }) {
  const cloudLocked = !ent.can('cloudTts')
  const [tts, setTts] = useState(null)      // public cloud config from main
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    window.sush?.ttsConfigGet?.().then(c => { if (c) setTts(c) }).catch(() => {})
  }, [])

  const provider = tts?.provider || 'system'

  const saveCfg = async (patch) => {
    setBusy(true); setErr('')
    const r = await window.sush?.ttsConfigSet?.(patch)
    if (r?.ok) setTts(r)
    else if (r?.error) setErr(r.error)
    setBusy(false)
    return r
  }

  const saveKey = async () => {
    if (!keyInput.trim()) return
    const r = await saveCfg({ apiKey: keyInput.trim() })
    if (r?.ok) setKeyInput('')
  }

  const testVoice = async () => {
    setTesting(true); setErr('')
    const sample = "Hey, I'm Seducia — this is how I sound now."
    try {
      if (provider !== 'system') {
        const r = await window.sush?.ttsSynthesize?.({ text: sample, rate: settings.ttsRate })
        if (r?.ok && r.audio) { playB64(r.audio, r.mime); setTesting(false); return }
        if (r?.error) setErr(r.error)
      }
      const u = new SpeechSynthesisUtterance(sample)
      u.rate = settings.ttsRate ?? 1.1
      if (settings.ttsVoice) { const v = window.speechSynthesis.getVoices().find(v => v.voiceURI === settings.ttsVoice); if (v) u.voice = v }
      u.onend = () => setTesting(false)
      u.onerror = () => setTesting(false)
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
    } catch { setTesting(false) }
  }

  const isCloud = provider === 'openai' || provider === 'elevenlabs'
  const voiceHint = tts?.defaults?.[provider]?.voice
  const modelHint = tts?.defaults?.[provider]?.model

  return (
    <Section id="Voice & Dictation" icon="mic" label="Voice & Dictation" accent={accent}>
      <Row>
        <Label>Text-to-speech (Seducia speaks back)</Label>
        <Toggle
          accent={accent}
          icon="volume2"
          on={!!settings.ttsEnabled}
          onText="TTS enabled"
          offText="TTS disabled"
          onClick={() => set('ttsEnabled', !settings.ttsEnabled)}
          fullWidth={false}
        />
        <Hint>Off by default — Seducia replies in text either way.</Hint>
      </Row>

      {settings.ttsEnabled && (
        <>
          <Row>
            <Label>Voice engine</Label>
            <Segment
              accent={accent}
              value={provider}
              options={TTS_ENGINES.map(([val, lbl]) => [val, lbl, val !== 'system' && cloudLocked ? { locked: true, lockTitle: 'Cloud voices are a Plus feature — redeem a code under Plan' } : undefined])}
              onChange={(val) => saveCfg({ provider: val })}
              disabled={busy}
            />
            {cloudLocked && (
              <Hint>The system voice is free. Cloud neural voices (OpenAI / ElevenLabs) unlock with <strong style={{ color: accent }}>Plus</strong> — see <strong style={{ color: accent }}>Plan</strong>.</Hint>
            )}
            <Hint>
              {provider === 'system'
                ? 'Your built-in OS voices (robotic, but free and offline).'
                : 'A real neural voice via your own API key — the key stays on this machine and never leaves the main process.'}
            </Hint>
          </Row>

          <Row>
            <Label>Speech rate</Label>
            <Segment
              accent={accent}
              value={settings.ttsRate ?? 1.1}
              options={TTS_RATES.map(r => [r, `${r}×`])}
              onChange={(r) => set('ttsRate', r)}
            />
          </Row>

          {provider === 'system' && voices.length > 0 && (
            <Row>
              <Label>System voice</Label>
              <select value={settings.ttsVoice ?? ''} onChange={e => set('ttsVoice', e.target.value)} style={inputStyle}>
                <option value="">System default</option>
                {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
              </select>
            </Row>
          )}

          {isCloud && (
            <>
              <Row>
                <Label>{provider === 'openai' ? 'OpenAI API key' : 'ElevenLabs API key'}</Label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="password"
                    value={keyInput}
                    onChange={e => setKeyInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveKey() }}
                    placeholder={tts?.hasKey ? '•••••••••• (saved — paste to replace)' : (provider === 'openai' ? 'sk-...' : 'paste your key')}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={saveKey} disabled={busy || !keyInput.trim()} style={{ fontSize: 11.5, fontWeight: 800, color: accent, background: rgba(accent, 0.1), border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 8, padding: '0 14px', cursor: keyInput.trim() ? 'pointer' : 'default', opacity: keyInput.trim() ? 1 : 0.5 }}>Save</button>
                  {tts?.hasKey && (
                    <button onClick={() => saveCfg({ apiKey: '' })} disabled={busy} title="Forget key" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', background: 'transparent', border: '1px solid var(--border-2)', borderRadius: 8, padding: '0 12px', cursor: 'pointer' }}>Clear</button>
                  )}
                </div>
                {tts && !tts.safeStorage && (
                  <Hint warn>Your OS keychain isn’t available, so the key is stored unencrypted on this machine.</Hint>
                )}
                <Hint>
                  {provider === 'openai'
                    ? 'Get a key at platform.openai.com. Billed per character to your OpenAI account.'
                    : 'Get a key at elevenlabs.io. Billed per character to your ElevenLabs account.'}
                </Hint>
              </Row>

              <Row>
                <Label>Voice</Label>
                {provider === 'openai' ? (
                  <select value={tts?.voice || ''} onChange={e => saveCfg({ voice: e.target.value })} style={inputStyle}>
                    <option value="">{`Default (${voiceHint || 'alloy'})`}</option>
                    {OPENAI_VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : (
                  <input
                    value={tts?.voice || ''}
                    onChange={e => setTts({ ...tts, voice: e.target.value })}
                    onBlur={e => saveCfg({ voice: e.target.value })}
                    placeholder={`Voice ID (default: Rachel ${voiceHint || ''})`}
                    style={inputStyle}
                  />
                )}
              </Row>

              <Row>
                <Label>Model (optional)</Label>
                <input
                  value={tts?.model || ''}
                  onChange={e => setTts({ ...tts, model: e.target.value })}
                  onBlur={e => saveCfg({ model: e.target.value })}
                  placeholder={`Default: ${modelHint || ''}`}
                  style={inputStyle}
                />
              </Row>
            </>
          )}

          <Row>
            <button
              onClick={testVoice}
              disabled={testing}
              className="flex items-center justify-center"
              style={{ gap: 8, width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: `1px solid ${rgba(accent, 0.3)}`, color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
            >
              {testing ? <span className="sush-spinner" style={{ width: 12, height: 12 }} /> : <Icon name="volume2" size={14} color={accent} strokeWidth={2} />}
              {testing ? 'Speaking…' : 'Test voice'}
            </button>
            {err && <div style={{ color: '#ff8aa0', fontSize: 11, fontWeight: 700, marginTop: 6 }}>{err}</div>}
          </Row>
        </>
      )}

      <div style={{ height: 1, background: 'var(--border-2)', margin: '18px 0 4px' }} />
      <DictationBlock accent={accent} settings={settings} set={set} />
    </Section>
  )
}
