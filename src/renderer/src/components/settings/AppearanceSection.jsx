import React, { useRef, useState } from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { themes } from '../../themes'
import { Section, Row, Label, Hint, Toggle, Segment } from './primitives'

const isWindows = typeof window !== 'undefined' && window.sush?.platform === 'win32'
const isMac = typeof window !== 'undefined' && window.sush?.platform === 'darwin'

// Appearance — how Sush looks: theme, wallpaper, window opacity, and the
// reduce-motion accessibility toggle. Battery/performance concerns moved to
// the Power section where they belong.

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
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: `1px solid ${rgba(accent, 0.3)}`, color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
        >
          <Icon name="palette" size={14} color={accent} strokeWidth={2} />
          {settings.bgImage ? 'Change image' : 'Choose image'}
        </button>
        {settings.bgImage && (
          <>
            <img src={settings.bgImage} alt="" style={{ width: 56, height: 32, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-2)' }} />
            <button onClick={() => set('bgImage', '')} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
              remove
            </button>
          </>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      {settings.bgImage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>Dim</span>
          <input type="range" min={20} max={92} value={settings.bgDim ?? 62} onChange={e => set('bgDim', Number(e.target.value))} style={{ flex: 1, accentColor: accent }} />
          <span style={{ color: 'var(--text-2)', fontSize: 12, width: 36, textAlign: 'right', fontWeight: 700 }}>{settings.bgDim ?? 62}%</span>
        </div>
      )}
      {settings.bgImage && (
        <div style={{ marginTop: 10 }}>
          <Toggle
            accent={accent}
            icon="terminal"
            on={settings.terminalWallpaper === true}
            onText="Wallpaper shows through terminals"
            offText="Terminals stay solid (wallpaper hidden)"
            onClick={() => set('terminalWallpaper', settings.terminalWallpaper !== true)}
          />
        </div>
      )}
      {err && <div style={{ color: '#ff8aa0', fontSize: 11, fontWeight: 700, marginTop: 6 }}>{err}</div>}
      <Hint>
        Shows through the glass chrome and the home screen (glass themes show the most). Stored per user.
        Turn on “shows through terminals” to let it sit behind your terminal text too — the Dim slider keeps text readable.
      </Hint>
    </Row>
  )
}

export default function AppearanceSection({ accent, settings, set }) {
  return (
    <Section id="Appearance" icon="palette" label="Appearance" accent={accent}>
      <Row>
        <Label>Theme</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.values(themes).map(t => (
            <button key={t.id} onClick={() => set('themeId', t.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, cursor: 'pointer', background: (settings.themeId ?? 'pink') === t.id ? rgba(t.ui.accent, 0.1) : 'var(--surface-2)', border: `1px solid ${(settings.themeId ?? 'pink') === t.id ? t.ui.accent : 'var(--border-2)'}`, color: 'var(--text-2)', fontSize: 13, textAlign: 'left' }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: t.ui.accent, flexShrink: 0, boxShadow: `0 0 6px ${t.ui.accent}` }} />
              {t.label}
              {(settings.themeId ?? 'pink') === t.id && <Icon name="check" size={13} color={t.ui.accent} style={{ marginLeft: 'auto' }} />}
            </button>
          ))}
        </div>
      </Row>

      <WallpaperRow accent={accent} settings={settings} set={set} />

      {isWindows && (
        <Row>
          <Label>Window material (Windows 11)</Label>
          <Segment
            accent={accent}
            value={['mica', 'acrylic'].includes(settings.windowMaterial) ? settings.windowMaterial : 'solid'}
            options={[['solid', 'Solid'], ['mica', 'Mica'], ['acrylic', 'Acrylic']]}
            onChange={(v) => set('windowMaterial', v)}
          />
          <Hint>Lets the Windows 11 desktop tint show behind Sush, like macOS vibrancy — Mica is subtle and cheap, Acrylic is stronger and blurrier. Ignored if a wallpaper is set, and on Windows 10. Solid keeps the plain dark canvas.</Hint>
        </Row>
      )}

      <Row>
        <Label>Window controls</Label>
        <Segment
          accent={accent}
          value={settings.trafficLightSide === 'left' ? 'left' : 'right'}
          options={[['right', 'Right (Windows)'], ['left', 'Left (macOS)']]}
          onChange={(v) => set('trafficLightSide', v)}
        />
        <Hint>{isMac ? 'Your OS already draws the traffic lights on the left.' : 'Put the minimize / maximize / close dots on the left, macOS-style, or keep them right where Windows expects them.'}</Hint>
      </Row>

      <Row>
        <Label>Window opacity</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="range" min={70} max={100} value={settings.opacity ?? 100} onChange={e => set('opacity', Number(e.target.value))} style={{ flex: 1, accentColor: accent }} />
          <span style={{ color: 'var(--text-2)', fontSize: 12, width: 36, textAlign: 'right', fontWeight: 700 }}>{settings.opacity ?? 100}%</span>
        </div>
      </Row>

      <Row>
        <Label>Reduce motion</Label>
        <Toggle
          accent={accent}
          icon="sparkles"
          on={!!settings.reduceMotion}
          onText="Motion reduced — transitions instant"
          offText="Smooth animations on"
          onClick={() => set('reduceMotion', !settings.reduceMotion)}
        />
        <Hint>
          Makes every panel, modal and hover transition snap instantly instead of
          easing. An accessibility choice, separate from the Power ladder. (Your OS
          “reduce motion” setting is always honoured too.)
        </Hint>
      </Row>
    </Section>
  )
}
