import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

const DEFAULT_URL = 'https://duckduckgo.com'

// Turn whatever the user typed into a loadable URL. Handles bare domains,
// localhost / :port (great for previewing a dev server), IPs, and falls back to
// a web search for anything that isn't obviously an address.
function normalizeUrl(input) {
  const v = String(input || '').trim()
  if (!v) return ''
  if (/^[a-z]+:\/\//i.test(v)) return v // already has a scheme (http, https, file, about...)
  if (/^:\d+/.test(v)) return `http://localhost${v}` // ":5173" → localhost preview
  if (/^localhost(:\d+)?(\/.*)?$/i.test(v)) return `http://${v}`
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(v)) return `http://${v}`
  if (/^[^\s]+\.[^\s]+$/.test(v)) return `https://${v}` // looks like a domain
  return `https://duckduckgo.com/?q=${encodeURIComponent(v)}`
}

function hostOf(url) {
  try { return new URL(url).host } catch { return '' }
}

// An in-app browser backed by Electron's <webview>. Lives in the right panel so
// you can preview a running dev server, read docs, or open a PR without leaving
// Sush. The initial src is captured once; later navigation goes through loadURL
// so React never reloads the page out from under you.
export default function Browser({ accent }) {
  const webviewRef = useRef(null)
  const initialSrc = useRef(DEFAULT_URL)
  const [address, setAddress] = useState(DEFAULT_URL)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [canBack, setCanBack] = useState(false)
  const [canForward, setCanForward] = useState(false)
  const [secure, setSecure] = useState(true)

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const syncNav = () => {
      try {
        setCanBack(wv.canGoBack())
        setCanForward(wv.canGoForward())
      } catch {}
    }
    const onStart = () => setLoading(true)
    const onStop = () => { setLoading(false); syncNav() }
    const onNav = (e) => {
      if (e.url) {
        if (!editing) setAddress(e.url)
        setSecure(/^https:/i.test(e.url))
      }
      syncNav()
    }
    const onFail = () => { setLoading(false); syncNav() }

    wv.addEventListener('did-start-loading', onStart)
    wv.addEventListener('did-stop-loading', onStop)
    wv.addEventListener('did-navigate', onNav)
    wv.addEventListener('did-navigate-in-page', onNav)
    wv.addEventListener('did-fail-load', onFail)
    return () => {
      wv.removeEventListener('did-start-loading', onStart)
      wv.removeEventListener('did-stop-loading', onStop)
      wv.removeEventListener('did-navigate', onNav)
      wv.removeEventListener('did-navigate-in-page', onNav)
      wv.removeEventListener('did-fail-load', onFail)
    }
  }, [editing])

  const navigate = (raw) => {
    const url = normalizeUrl(raw)
    if (!url) return
    setAddress(url)
    setEditing(false)
    try { webviewRef.current?.loadURL(url) } catch {}
  }

  const back = () => { try { webviewRef.current?.goBack() } catch {} }
  const forward = () => { try { webviewRef.current?.goForward() } catch {} }
  const reloadOrStop = () => {
    const wv = webviewRef.current
    if (!wv) return
    try { loading ? wv.stop() : wv.reload() } catch {}
  }
  const home = () => navigate(DEFAULT_URL)

  const navBtn = (icon, onClick, { disabled, title, spin } = {}) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center justify-center"
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        border: '1px solid transparent',
        background: 'transparent',
        color: disabled ? '#39424b' : '#aab3bb',
        cursor: disabled ? 'default' : 'pointer',
        flexShrink: 0,
        transition: 'background .12s, color .12s'
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = rgba(accent, 0.12); e.currentTarget.style.color = accent } }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = disabled ? '#39424b' : '#aab3bb' }}
    >
      <Icon name={icon} size={15} strokeWidth={2.2} className={spin ? 'sush-spin' : undefined} />
    </button>
  )

  return (
    <div className="flex flex-col" style={{ height: '100%', background: '#0b0e11' }}>
      {/* Toolbar */}
      <div className="flex items-center" style={{ gap: 4, padding: '8px 9px', borderBottom: '1px solid #141a1f' }}>
        {navBtn('arrowLeft', back, { disabled: !canBack, title: 'Back' })}
        {navBtn('arrowRight', forward, { disabled: !canForward, title: 'Forward' })}
        {navBtn(loading ? 'x' : 'refresh', reloadOrStop, { title: loading ? 'Stop' : 'Reload', spin: false })}
        {navBtn('home', home, { title: 'Home' })}

        <div className="sush-omni flex items-center" style={{ flex: 1, minWidth: 0, height: 30, gap: 7, marginLeft: 2 }}>
          <Icon name={secure ? 'lock' : 'globe'} size={12.5} color={secure ? '#7ee787' : '#76808a'} strokeWidth={2.2} />
          <input
            value={address}
            onChange={(e) => { setAddress(e.target.value); setEditing(true) }}
            onFocus={(e) => { setEditing(true); e.target.select() }}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); navigate(address) }
              if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur() }
            }}
            placeholder="Search or enter address -- try :5173 for a dev server"
            spellCheck={false}
            autoComplete="off"
            style={{ flex: 1, minWidth: 0, height: '100%', background: 'transparent', border: 'none', color: '#e6ebef', outline: 'none', fontSize: 12 }}
          />
          {loading && <span className="sush-spin" style={{ width: 11, height: 11, borderRadius: '50%', border: `2px solid ${rgba(accent, 0.3)}`, borderTopColor: accent, flexShrink: 0 }} />}
        </div>
      </div>

      {/* Page */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#fff' }}>
        <webview
          ref={webviewRef}
          src={initialSrc.current}
          allowpopups="true"
          style={{ width: '100%', height: '100%', display: 'flex', border: 'none' }}
        />
      </div>
    </div>
  )
}
