import React, { useCallback, useEffect, useMemo, useState } from 'react'
import AirTerminal from './components/AirTerminal'
import Palette from './components/Palette'
import { THEMES, loadThemeId, saveThemeId } from './lib/themes'

let counter = 0
const newId = () => `air-${Date.now().toString(36)}-${counter++}`

const AGENTS = [
  { name: 'Claude', run: 'claude' },
  { name: 'Gemini', run: 'gemini' },
  { name: 'Codex', run: 'codex' },
  { name: 'Aider', run: 'aider' }
]

export default function App() {
  const [themeId, setThemeId] = useState(loadThemeId)
  const theme = THEMES[themeId]
  const [tabs, setTabs] = useState(() => [{ id: newId(), label: 'shell' }])
  const [activeId, setActiveId] = useState(() => null)
  const [showPalette, setShowPalette] = useState(false)
  const active = activeId ?? tabs[0]?.id

  const setTheme = useCallback((id) => {
    if (!THEMES[id]) return
    setThemeId(id)
    saveThemeId(id)
  }, [])

  const addTab = useCallback((label = 'shell', run) => {
    const tab = { id: newId(), label, run }
    setTabs((t) => (t.length >= 12 ? t : [...t, tab]))
    setActiveId(tab.id)
  }, [])

  const closeTab = useCallback((id) => {
    setTabs((t) => {
      const next = t.filter((x) => x.id !== id)
      setActiveId((a) => (a === id ? next[next.length - 1]?.id ?? null : a))
      return next.length ? next : [{ id: newId(), label: 'shell' }]
    })
  }, [])

  // Global keys: Ctrl+K palette, Ctrl+Shift+N new tab, Ctrl+W close.
  useEffect(() => {
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setShowPalette((v) => !v) }
      else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); addTab() }
      else if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'w') { e.preventDefault(); if (active) closeTab(active) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, addTab, closeTab])

  const paletteEntries = useMemo(() => [
    { id: 'new', label: 'New Session', hint: 'Ctrl+Shift+N', act: () => addTab() },
    ...AGENTS.map((a) => ({ id: `agent-${a.run}`, label: `Launch ${a.name}`, hint: a.run, act: () => addTab(a.name.toLowerCase(), a.run) })),
    ...tabs.map((t) => ({ id: `go-${t.id}`, label: `Go to: ${t.label}`, hint: 'session', act: () => setActiveId(t.id) })),
    ...Object.values(THEMES).map((th) => ({ id: `theme-${th.id}`, label: `Theme: ${th.label}`, hint: th.id === themeId ? 'active' : 'theme', act: () => setTheme(th.id) }))
  ], [tabs, themeId, addTab, setTheme])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: theme.bg, color: theme.text }}>
      {/* Tab strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', background: theme.surface, borderBottom: `1px solid ${theme.border}`, userSelect: 'none' }}>
        <span style={{ fontWeight: 800, fontSize: 12.5, color: theme.accent, letterSpacing: 0.4, marginRight: 8 }}>SUSH AIR</span>
        {tabs.map((t) => (
          <div
            key={t.id}
            onClick={() => setActiveId(t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: t.id === active ? `${theme.accent}22` : 'transparent', color: t.id === active ? theme.accent : theme.dim, border: `1px solid ${t.id === active ? `${theme.accent}55` : 'transparent'}` }}
          >
            {t.label}
            <span onClick={(e) => { e.stopPropagation(); closeTab(t.id) }} style={{ opacity: 0.6, fontSize: 13, lineHeight: 1 }}>×</span>
          </div>
        ))}
        <button onClick={() => addTab()} title="New session (Ctrl+Shift+N)" style={{ marginLeft: 2, background: 'transparent', border: 'none', color: theme.dim, fontSize: 16, cursor: 'pointer', padding: '0 6px' }}>+</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowPalette(true)} title="Palette (Ctrl+K)" style={{ background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.dim, fontSize: 11, cursor: 'pointer', padding: '3px 9px' }}>⌘K</button>
      </div>

      {/* Terminals — all mounted, inactive ones hidden, so sessions live across switches */}
      <div style={{ flex: 1, position: 'relative' }}>
        {tabs.map((t) => (
          <div key={t.id} style={{ position: 'absolute', inset: 0, visibility: t.id === active ? 'visible' : 'hidden' }}>
            <AirTerminal
              id={t.id}
              run={t.run}
              theme={theme}
              active={t.id === active}
              onTheme={setTheme}
              onExit={() => {}}
            />
          </div>
        ))}
      </div>

      {showPalette && (
        <Palette entries={paletteEntries} theme={theme} onPick={(e) => e.act()} onClose={() => setShowPalette(false)} />
      )}
    </div>
  )
}
