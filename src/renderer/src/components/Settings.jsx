import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'
import { useEntitlements } from '../hooks/useEntitlements'
import PlanSection from './settings/PlanSection'
import AccountsSection from './settings/AccountsSection'
import UsageSection from './settings/UsageSection'
import AgentsSection from './settings/AgentsSection'
import VoiceSection from './settings/VoiceSection'
import TerminalSection from './settings/TerminalSection'
import AppearanceSection from './settings/AppearanceSection'
import PowerSection from './settings/PowerSection'
import SystemSection from './settings/SystemSection'

// The Settings shell: header, searchable nav, scroll-spy, and the sections —
// each of which lives in its own file under ./settings. The nav array below
// is rendered in ORDER for both the rail and the body, so the two can never
// disagree again (the old page listed Plan first but scrolled to AI first).
//
// Search is row-level: the query matches each setting row's rendered text
// (label, state text, description), not just section names — so "tray",
// "wallpaper" or "quiet hours" land on the exact control.
const SETTINGS_NAV = [
  { id: 'Plan', label: 'Plan', icon: 'star', group: 'Account' },
  { id: 'Accounts', label: 'Accounts', icon: 'users', group: 'Account' },
  { id: 'Usage & Guard', label: 'Usage & Guard', icon: 'activity', group: 'Account' },
  { id: 'Agents & Seducia', label: 'Agents & Seducia', icon: 'rocket', group: 'Intelligence' },
  { id: 'Voice & Dictation', label: 'Voice & Dictation', icon: 'mic', group: 'Intelligence' },
  { id: 'Terminal', label: 'Terminal', icon: 'terminal', group: 'Experience' },
  { id: 'Appearance', label: 'Appearance', icon: 'palette', group: 'Experience' },
  { id: 'Power', label: 'Power', icon: 'leaf', group: 'Experience' },
  { id: 'System', label: 'System', icon: 'layers', group: 'System' }
]
const NAV_GROUPS = ['Account', 'Intelligence', 'Experience', 'System']

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
  const [activeSec, setActiveSec] = useState(SETTINGS_NAV[0].id)
  const [query, setQuery] = useState('')
  // Which sections have at least one row matching the query (all, when empty).
  const [matchedSecs, setMatchedSecs] = useState(() => new Set(SETTINGS_NAV.map(i => i.id)))
  const goTo = (sec) => {
    setActiveSec(sec)
    bodyRef.current?.querySelector(`[data-settings-sec="${CSS.escape(sec)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Scroll-spy: highlight whichever section is nearest the top of the pane.
  useEffect(() => {
    const root = bodyRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const secs = Array.from(root.querySelectorAll('[data-settings-sec]'))
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActiveSec(top.target.getAttribute('data-settings-sec'))
      },
      { root, rootMargin: '0px 0px -70% 0px', threshold: 0 }
    )
    secs.forEach(s => io.observe(s))
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      // `/` focuses search (unless already typing somewhere).
      if (e.key === '/' && !/input|select|textarea/i.test(document.activeElement?.tagName || '')) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Row-level search over the rendered DOM: hide rows whose text doesn't
  // match, then hide sections left with no visible rows. Working on the DOM
  // means no section needs to know about the filter, and the query matches
  // exactly what the user can read.
  const searchRef = useRef(null)
  useEffect(() => {
    const root = bodyRef.current
    if (!root) return
    const q = query.trim().toLowerCase()
    const matched = new Set()
    root.querySelectorAll('[data-settings-sec]').forEach(secEl => {
      const sec = secEl.getAttribute('data-settings-sec')
      let any = false
      secEl.querySelectorAll('[data-setting-row]').forEach(rowEl => {
        const hit = !q || (rowEl.textContent || '').toLowerCase().includes(q)
        rowEl.style.display = hit ? '' : 'none'
        if (hit) any = true
      })
      // Section names count too, so "power" finds the Power section itself.
      if (q && sec.toLowerCase().includes(q)) {
        any = true
        secEl.querySelectorAll('[data-setting-row]').forEach(rowEl => { rowEl.style.display = '' })
      }
      secEl.style.display = (!q || any) ? '' : 'none'
      if (!q || any) matched.add(sec)
    })
    setMatchedSecs(matched)
  }, [query])

  const q = query.trim()
  const visibleNav = SETTINGS_NAV.filter(item => matchedSecs.has(item.id))

  return (
    <div className="sush-page-in" style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', background: 'var(--surface-0)' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 26px', borderBottom: '1px solid var(--border-1)', flexShrink: 0 }}>
        <div className="flex items-center" style={{ gap: 13 }}>
          <span className="flex items-center justify-center" style={{ width: 38, height: 38, borderRadius: 11, background: `linear-gradient(150deg, ${rgba(accent, 0.3)}, ${rgba(accent, 0.06)})`, border: `1px solid ${rgba(accent, 0.4)}`, boxShadow: `0 8px 22px ${rgba(accent, 0.2)}, inset 0 1px 0 rgba(255,255,255,0.1)`, color: accent }}>
            <Icon name="settings" size={18} strokeWidth={2} />
          </span>
          <div>
            <div style={{ color: 'var(--text-1)', fontWeight: 900, fontSize: 19, letterSpacing: -0.4, lineHeight: 1.1 }}>Settings</div>
            <div style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)', fontWeight: 600, marginTop: 1 }}>Tune Sush to your machine and taste</div>
          </div>
        </div>
        <button onClick={onClose} title="Back (Esc)" className="flex items-center" style={{ gap: 7, height: 32, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border-2)', background: 'var(--surface-1)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
          <Icon name="x" size={13} /> Close
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Section nav — searchable, grouped, with a scroll-spy highlight */}
        <nav style={{ width: 214, flexShrink: 0, borderRight: '1px solid var(--border-1)', padding: '13px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }} className="sush-scroll">
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', display: 'flex', pointerEvents: 'none' }}>
              <Icon name="search" size={13} strokeWidth={2} />
            </span>
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search settings  ( / )"
              style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)', borderRadius: 9, padding: '7px 9px 7px 28px', fontSize: 12, outline: 'none' }}
              onFocus={e => { e.target.style.borderColor = rgba(accent, 0.5) }}
              onBlur={e => { e.target.style.borderColor = 'var(--border-2)' }}
            />
          </div>
          {NAV_GROUPS.map(group => {
            const items = visibleNav.filter(i => i.group === group)
            if (!items.length) return null
            return (
              <div key={group} style={{ marginBottom: 4 }}>
                {!q && <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.9, color: 'var(--text-5)', textTransform: 'uppercase', padding: '6px 11px 4px' }}>{group}</div>}
                {items.map(item => {
                  const on = activeSec === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => goTo(item.id)}
                      className="flex items-center"
                      style={{ gap: 9, width: '100%', padding: '8px 11px', marginBottom: 1, borderRadius: 9, border: 'none', borderLeft: `2px solid ${on ? accent : 'transparent'}`, textAlign: 'left', background: on ? rgba(accent, 0.12) : 'transparent', color: on ? accent : 'var(--text-3)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, transition: 'background 0.12s' }}
                    >
                      <Icon name={item.icon} size={14} strokeWidth={2} color={on ? accent : 'var(--text-4)'} />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            )
          })}
          {q && !visibleNav.length && (
            <div style={{ fontSize: 11, color: 'var(--text-4)', fontWeight: 600, padding: '8px 11px', lineHeight: 1.5 }}>No settings match “{query}”.</div>
          )}
        </nav>

        {/* Content — sections render in exactly the nav's order */}
        <div ref={bodyRef} className="sush-scroll" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '22px 30px' }}>
          <div style={{ maxWidth: 640 }}>
            <PlanSection accent={accent} ent={ent} settings={settings} onChange={onChange} />
            <AccountsSection accent={accent} />
            <UsageSection accent={accent} settings={settings} set={set} />
            <AgentsSection accent={accent} ent={ent} settings={settings} set={set} />
            <VoiceSection accent={accent} settings={settings} set={set} voices={voices} ent={ent} />
            <TerminalSection accent={accent} settings={settings} set={set} />
            <AppearanceSection accent={accent} settings={settings} set={set} />
            <PowerSection accent={accent} settings={settings} set={set} onChange={onChange} />
            <SystemSection accent={accent} settings={settings} set={set} onEditSushrc={onEditSushrc} />
          </div>
        </div>
      </div>
    </div>
  )
}
