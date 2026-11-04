import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'
import { useEntitlements } from '../hooks/useEntitlements'
import TrafficLights from './shell/TrafficLights'
import PlanSection from './settings/PlanSection'
import AccountsSection from './settings/AccountsSection'
import UsageSection from './settings/UsageSection'
import AgentsSection from './settings/AgentsSection'
import VoiceSection from './settings/VoiceSection'
import TerminalSection from './settings/TerminalSection'
import AppearanceSection from './settings/AppearanceSection'
import PowerSection from './settings/PowerSection'
import SystemSection from './settings/SystemSection'
import { SECTION_DESCRIPTIONS } from './settings/primitives'

// The Settings shell: header, searchable nav, scroll-spy, and the sections —
// each of which lives in its own file under ./settings. The nav array below
// is rendered in ORDER for both the rail and the body, so the two can never
// disagree again (the old page listed Plan first but scrolled to AI first).
//
// Search is row-level: the query matches each setting row's rendered text
// (label, state text, description), not just section names — so "tray",
// "wallpaper" or "quiet hours" land on the exact control.
// `tile`: the System Settings-style coloured square behind each icon.
const SETTINGS_NAV = [
  { id: 'Plan', label: 'Profile & plan', icon: 'star', group: 'You', tile: 'accent' },
  { id: 'Accounts', label: 'Accounts', icon: 'users', group: 'You', tile: '#0a84ff' },
  { id: 'Usage & Guard', label: 'Usage & limits', icon: 'activity', group: 'You', tile: '#30d158' },
  { id: 'Agents & Seducia', label: 'Agents', icon: 'rocket', group: 'Agents', tile: '#bf5af2' },
  { id: 'Voice & Dictation', label: 'Voice', icon: 'mic', group: 'Agents', tile: '#ff453a' },
  { id: 'Appearance', label: 'Appearance', icon: 'palette', group: 'Workspace', tile: '#5e5ce6' },
  { id: 'Terminal', label: 'Terminal', icon: 'terminal', group: 'Workspace', tile: '#3a3a3c' },
  { id: 'Power', label: 'Performance', icon: 'leaf', group: 'Workspace', tile: '#ff9f0a' },
  { id: 'System', label: 'Advanced', icon: 'layers', group: 'Workspace', tile: '#8e8e93' }
]
const Tile = ({ item, size = 20 }) => (
  <span className="st-tile" style={{ '--tile': item.tile === 'accent' ? 'var(--st-accent)' : item.tile, width: size, height: size }} aria-hidden>
    <Icon name={item.icon} size={Math.round(size * 0.62)} strokeWidth={2.1} />
  </span>
)
const NAV_GROUPS = ['You', 'Agents', 'Workspace']
const LAST_KEY = 'sush-settings-page'

// One page at a time (the old single scroll ran nine sections and ~55
// controls together). Searching renders every section and hides rows that
// don't match, so a query still finds a control wherever it lives.
export default function Settings({ settings, onChange, onClose, accent, onEditSushrc }) {
  const set = (key, val) => onChange({ ...settings, [key]: val })
  const ent = useEntitlements()
  const [voices, setVoices] = useState([])

  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis?.getVoices() ?? [])
    load()
    window.speechSynthesis?.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', load)
  }, [])

  const bodyRef = useRef(null)
  const searchRef = useRef(null)
  const [page, setPage] = useState(() => {
    try {
      const saved = localStorage.getItem(LAST_KEY)
      if (SETTINGS_NAV.some(i => i.id === saved)) return saved
    } catch {}
    return SETTINGS_NAV[0].id
  })
  const [query, setQuery] = useState('')
  const [matchedSecs, setMatchedSecs] = useState(() => new Set(SETTINGS_NAV.map(i => i.id)))
  const q = query.trim()

  const goTo = (sec) => {
    setQuery('')
    setPage(sec)
    try { localStorage.setItem(LAST_KEY, sec) } catch {}
    bodyRef.current?.scrollTo({ top: 0 })
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (document.activeElement === searchRef.current && query) { setQuery(''); return }
        onClose()
      }
      if (e.key === '/' && !/input|select|textarea/i.test(document.activeElement?.tagName || '')) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, query])

  // Row-level search over the rendered DOM: hide rows whose text doesn't
  // match, then hide sections left with no visible rows.
  useEffect(() => {
    const root = bodyRef.current
    if (!root) return
    const needle = q.toLowerCase()
    const matched = new Set()
    root.querySelectorAll('[data-settings-sec]').forEach(secEl => {
      const sec = secEl.getAttribute('data-settings-sec')
      const nav = SETTINGS_NAV.find(i => i.id === sec)
      let any = false
      secEl.querySelectorAll('[data-setting-row]').forEach(rowEl => {
        const hit = !needle || (rowEl.textContent || '').toLowerCase().includes(needle)
        rowEl.style.display = hit ? '' : 'none'
        if (hit) any = true
      })
      if (needle && `${sec} ${nav?.label || ''}`.toLowerCase().includes(needle)) {
        any = true
        secEl.querySelectorAll('[data-setting-row]').forEach(rowEl => { rowEl.style.display = '' })
      }
      secEl.style.display = (!needle || any) ? '' : 'none'
      if (!needle || any) matched.add(sec)
    })
    setMatchedSecs(matched)
  }, [q, page])

  const show = id => !!q || page === id
  const current = SETTINGS_NAV.find(i => i.id === page)

  return (
    <div className="st-root sush-page-in" style={{ '--st-accent': accent, '--st-accent-soft': rgba(accent, 0.12) }}>
      <nav className="st-nav sush-scroll" aria-label="Settings sections">
        <div className="st-nav-head">
          <TrafficLights />
        </div>
        <label className="st-search">
          <Icon name="search" size={13} />
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search settings"
          />
          {!q && <kbd>/</kbd>}
        </label>
        {NAV_GROUPS.map(group => {
          const items = SETTINGS_NAV.filter(i => i.group === group && (!q || matchedSecs.has(i.id)))
          if (!items.length) return null
          return (
            <div key={group} className="st-nav-group">
              <div className="st-nav-title">{group}</div>
              {items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`st-nav-item${!q && page === item.id ? ' is-active' : ''}`}
                  aria-current={!q && page === item.id ? 'page' : undefined}
                  onClick={() => goTo(item.id)}
                >
                  <Tile item={item} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )
        })}
        {q && !matchedSecs.size && <div className="st-nav-empty">No settings match “{query}”.</div>}
      </nav>

      <div className="st-main">
      <header className="st-toolbar">
        <button type="button" className="st-back" onClick={onClose} title="Back to Sush (Esc)" aria-label="Back to Sush">
          <Icon name="chevronLeft" size={16} strokeWidth={2.2} />
        </button>
        <h1>{q ? 'Search' : current?.label}</h1>
      </header>
      <main ref={bodyRef} className="st-body sush-scroll" aria-label={q ? 'Search results' : current?.label}>
        <div className={`st-column${q ? " is-search" : ""}`} key={q ? "search" : page}>
          {!q && current && (
            <div className="st-hero">
              <Tile item={current} size={44} />
              <div>
                <h2>{current.label}</h2>
                <p>{SECTION_DESCRIPTIONS[current.id]}</p>
              </div>
            </div>
          )}
          {q && <div className="st-results-head">Results for “{query}”</div>}
          {show('Plan') && <PlanSection accent={accent} ent={ent} settings={settings} onChange={onChange} />}
          {show('Accounts') && <AccountsSection accent={accent} />}
          {show('Usage & Guard') && <UsageSection accent={accent} settings={settings} set={set} />}
          {show('Agents & Seducia') && <AgentsSection accent={accent} ent={ent} settings={settings} set={set} />}
          {show('Voice & Dictation') && <VoiceSection accent={accent} settings={settings} set={set} voices={voices} ent={ent} />}
          {show('Appearance') && <AppearanceSection accent={accent} settings={settings} set={set} />}
          {show('Terminal') && <TerminalSection accent={accent} settings={settings} set={set} />}
          {show('Power') && <PowerSection accent={accent} settings={settings} set={set} onChange={onChange} />}
          {show('System') && <SystemSection accent={accent} settings={settings} set={set} onEditSushrc={onEditSushrc} />}
          {q && !matchedSecs.size && <div className="st-empty">Nothing matches “{query}”. Try a shorter word.</div>}
        </div>
      </main>
      </div>
    </div>
  )
}
