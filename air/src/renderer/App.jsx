import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Terminal from './Terminal'
import Palette from './Palette'
import Notes from './Notes'
import Import from './Import'
import { runAirCommand, isAirCommand, completions, helpText, COMMANDS } from './commands'
import { THEMES, getAirTheme, resolveTheme, DEFAULT_THEME_ID } from './themes'
import { load, save } from './store'

const MAX_TABS = 12
let counter = 0
const nextId = () => `air-${Date.now().toString(36)}-${(counter++).toString(36)}`

function labelFor(cwd, index) {
  if (!cwd) return `session ${index + 1}`
  const parts = String(cwd).split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || cwd
}

export default function App() {
  const [tabs, setTabs] = useState(() => [{ id: nextId(), label: 'session 1', cwd: null, exited: false }])
  const [activeId, setActiveId] = useState(() => null)
  const [themeId, setThemeId] = useState(() => load('theme', DEFAULT_THEME_ID))
  const [fontSize, setFontSize] = useState(() => load('font', 14))
  const [notes, setNotes] = useState(() => load('notes', []))
  const [notesOpen, setNotesOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [zen, setZen] = useState(false)
  const [splitId, setSplitId] = useState(null)
  const [input, setInput] = useState('')
  const [flash, setFlash] = useState(null)
  const [sheet, setSheet] = useState(null)   // { title, lines } — help, cwd, errors
  const [findQuery, setFindQuery] = useState(null)
  const [importOpen, setImportOpen] = useState(false)

  const termRefs = useRef(new Map())
  const inputRef = useRef(null)
  const tabsRef = useRef(tabs)
  const activeRef = useRef(activeId)
  // Backstop. commitTabs keeps tabsRef current on its own, but activeId is also
  // set straight from the tab strip, the palette and Ctrl+1-9, so the refs are
  // re-synced after every render rather than at each call site.
  useEffect(() => { tabsRef.current = tabs }, [tabs])
  useEffect(() => { activeRef.current = activeId }, [activeId])

  const theme = useMemo(() => getAirTheme(themeId), [themeId])
  const active = tabs.find(t => t.id === activeId) ?? tabs[0]

  useEffect(() => { if (!activeId && tabs[0]) setActiveId(tabs[0].id) }, [activeId, tabs])
  useEffect(() => { save('theme', themeId) }, [themeId])
  useEffect(() => { save('font', fontSize) }, [fontSize])
  useEffect(() => { save('notes', notes.slice(-200)) }, [notes])

  // Paint the window chrome from the theme so the frame and the terminal are
  // never two different shades of almost-black.
  useEffect(() => {
    const root = document.documentElement
    for (const [key, value] of Object.entries(theme.ui)) {
      root.style.setProperty(`--air-${key}`, value)
    }
    root.dataset.airTheme = theme.id
  }, [theme])

  const say = useCallback((text, tone = 'info') => {
    setFlash({ text, tone, at: Date.now() })
  }, [])

  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(null), 2600)
    return () => clearTimeout(timer)
  }, [flash])

  const termOf = useCallback((id) => termRefs.current.get(id ?? activeRef.current), [])

  // ── Session actions ────────────────────────────────────────────────────────

  // Every tab mutation goes through here, and it is the only place that writes
  // `tabs`. `tabsRef` is updated in the same breath so a second call in the same
  // tick sees the first one's result.
  //
  // This replaced `setTabs(prev => ...)` updaters that also *read a value out*
  // through a closure. That only appeared to work: React may invoke an updater
  // more than once (it computes eagerly to check for a bailout, then again while
  // rendering), so `nextId()` ran twice and the id captured by the caller was
  // not the id that ended up in state — `setActiveId` then pointed at a tab that
  // did not exist, and the view silently fell back to tabs[0]. Updaters have to
  // be pure; anything the caller needs afterwards must be computed outside one.
  const commitTabs = useCallback((next, nextActive) => {
    tabsRef.current = next
    setTabs(next)
    if (nextActive !== undefined && nextActive !== activeRef.current) {
      activeRef.current = nextActive
      setActiveId(nextActive)
    }
  }, [])

  const openTab = useCallback((cwd = null) => {
    const prev = tabsRef.current
    if (prev.length >= MAX_TABS) {
      say(`Air holds ${MAX_TABS} sessions. Close one first.`, 'warn')
      return null
    }
    const created = { id: nextId(), label: labelFor(cwd, prev.length), cwd, exited: false }
    commitTabs([...prev, created], created.id)
    return created
  }, [commitTabs, say])

  const closeTab = useCallback((id) => {
    const target = id ?? activeRef.current
    const prev = tabsRef.current
    if (!target || !prev.some(t => t.id === target)) return

    window.air.closePty({ tabId: target })
    termRefs.current.delete(target)
    setSplitId(current => (current === target ? null : current))

    const remaining = prev.filter(t => t.id !== target)
    // Closing the last session leaves a fresh one rather than an empty window.
    // A terminal app with no terminal in it is a dead end, and the only way out
    // would have been a keyboard shortcut you may not know.
    if (!remaining.length) {
      const fresh = { id: nextId(), label: 'session 1', cwd: null, exited: false }
      return commitTabs([fresh], fresh.id)
    }
    if (target !== activeRef.current) return commitTabs(remaining)
    // Land on whatever slid into the closed tab's position, or the new last one.
    const index = prev.findIndex(t => t.id === target)
    commitTabs(remaining, (remaining[index] ?? remaining[remaining.length - 1]).id)
  }, [commitTabs])

  // `renamed` marks the label as the user's. Without it the next OSC 7 report
  // from the shell overwrote the name you just chose the moment you `cd`'d —
  // the cwd handler was already checking this flag, but nothing ever set it.
  const renameTab = useCallback((id, label) => {
    commitTabs(tabsRef.current.map(t => (t.id === id ? { ...t, label, renamed: true } : t)))
  }, [commitTabs])

  // ── The : command layer ────────────────────────────────────────────────────

  const applyTheme = useCallback((requested) => {
    const result = resolveTheme(requested, themeId)
    if (!result.ok) return say(result.error, 'warn')
    setThemeId(result.theme.id)
    say(`${result.theme.label} — ${result.theme.note}`)
  }, [themeId, say])

  const exportSession = useCallback(() => {
    const term = termOf()
    const text = term?.text() ?? ''
    if (!text.trim()) return say('Nothing to export yet.', 'warn')
    const name = `air-${(active?.label ?? 'session').replace(/[^\w.-]+/g, '_')}-${Date.now()}.txt`
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoke late, not on the next line: Chromium starts the download
    // asynchronously and a same-tick revoke races it into a silent no-op.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    say(`Saved ${name}`)
  }, [active, say, termOf])

  const dispatch = useCallback((line) => {
    const result = runAirCommand(line)
    if (!result.ok) return say(result.error, 'warn')

    switch (result.action) {
      case 'help': {
        // Toggle. Typing :help while the sheet is up reads as "put this away",
        // not as "show me the same thing again".
        const title = result.topic ? `:${result.topic}` : 'Commands'
        setSheet(prev => (prev?.title === title ? null : { title, lines: helpText(result.topic) }))
        break
      }
      case 'clear':
        termOf()?.clear()
        break
      case 'note-add':
        setNotes(prev => [...prev, { text: result.text, at: Date.now(), session: active?.label ?? null }])
        say('Noted.')
        break
      case 'notes-open':
        setNotesOpen(true)
        break
      case 'theme':
        applyTheme(result.theme)
        break
      case 'agent':
        // Air does not orchestrate agents — it starts one in your shell and
        // gets out of the way. That distinction is the whole reason Air is
        // separable from the main app, so it stays honest here: this types a
        // command, it does not manage a session.
        termOf()?.paste(`${result.agent}${result.extra ? ` ${result.extra}` : ''}\r`)
        break
      case 'new':
        openTab(result.cwd)
        break
      case 'close':
        closeTab()
        break
      case 'rename':
        if (active) { renameTab(active.id, result.label); say(`Renamed to ${result.label}`) }
        break
      case 'split':
        setSplitId(prev => {
          if (prev) return null
          const other = tabsRef.current.find(t => t.id !== activeRef.current)
          if (!other) { say('Open a second session to split.', 'warn'); return null }
          return other.id
        })
        break
      case 'find':
        if (result.query) { setFindQuery(result.query); termOf()?.find(result.query) }
        else setFindQuery('')
        break
      case 'go': {
        const target = tabsRef.current[result.index]
        if (!target) return say(`No session ${result.index + 1}.`, 'warn')
        setActiveId(target.id)
        break
      }
      case 'font':
        setFontSize(result.size)
        break
      case 'font-step':
        setFontSize(prev => Math.max(8, Math.min(32, prev + result.step)))
        break
      case 'zen':
        setZen(prev => {
          // Zen hides the input row, so `:zen` cannot be the way back out —
          // there is nowhere left to type it. Say so on the way in, while the
          // flash is still visible.
          if (!prev) say('Zen. Escape to come back.')
          return !prev
        })
        break
      case 'export':
        exportSession()
        break
      case 'cwd':
        window.air.cwd({ tabId: activeRef.current }).then(dir => {
          setSheet({ title: 'Working directory', lines: [dir] })
        })
        break
      case 'import':
        setImportOpen(true)
        break
      case 'forget':
        window.air.importClear().then(() => {
          // Sessions already running keep the env they were spawned with —
          // there is no way to unset a variable in a live shell from out here,
          // and pretending otherwise would be a lie you find out about later.
          say('Forgot everything from Sush. New sessions start clean.')
        })
        break
      default:
        say(`Nothing wired up for :${result.action}.`, 'warn')
    }
  }, [active, applyTheme, closeTab, exportSession, openTab, renameTab, say, termOf])

  // The single input. `:` goes to Air, everything else is typed into the shell
  // verbatim — including the newline, so it runs.
  const submit = useCallback(() => {
    const line = input
    if (!line.trim()) return
    setInput('')
    if (isAirCommand(line)) dispatch(line)
    else termOf()?.paste(`${line}\r`)
  }, [dispatch, input, termOf])

  // ── Keyboard ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (e.key === 'Escape') {
        if (importOpen) return setImportOpen(false)
        if (paletteOpen) return setPaletteOpen(false)
        if (sheet) return setSheet(null)
        if (findQuery !== null) { setFindQuery(null); termOf()?.clearFind(); return }
        if (notesOpen) return setNotesOpen(false)
        if (zen) return setZen(false)
        return
      }
      if (!ctrl) return
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

      if (key === 'k') { e.preventDefault(); setPaletteOpen(true); return }
      if (key === 't') { e.preventDefault(); openTab(active?.cwd ?? null); return }
      if (key === 'w') { e.preventDefault(); closeTab(); return }
      if (key === 'l') { e.preventDefault(); termOf()?.clear(); return }
      if (key === 'f') { e.preventDefault(); setFindQuery(q => (q === null ? '' : q)); return }
      if (key === 'n') { e.preventDefault(); setNotesOpen(v => !v); return }
      if (key === '\\') { e.preventDefault(); dispatch(':split'); return }
      if (key === '+' || key === '=') { e.preventDefault(); setFontSize(s => Math.min(32, s + 1)); return }
      if (key === '-') { e.preventDefault(); setFontSize(s => Math.max(8, s - 1)); return }
      if (key === '0') { e.preventDefault(); setFontSize(14); return }
      if (/^[1-9]$/.test(key) && !e.shiftKey) {
        const list = tabsRef.current
        const target = key === '9' ? list[list.length - 1] : list[Number(key) - 1]
        if (target) { e.preventDefault(); setActiveId(target.id) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, closeTab, dispatch, findQuery, importOpen, notesOpen, openTab, paletteOpen, sheet, termOf, zen])

  // Offer the import once, on the first launch that finds a Sush profile, and
  // then never again unasked — `:import` is always there for anyone who wants
  // it later. The flag is written before the sheet opens rather than after it
  // is answered, so a crash or a force-quit mid-decision cannot turn a one-time
  // offer into something that greets you every morning.
  useEffect(() => {
    if (load('import-offered', false)) return
    let live = true
    window.air.importScan().then(result => {
      if (!live) return
      save('import-offered', true)
      if (result.found && result.items.length) setImportOpen(true)
    })
    return () => { live = false }
  }, [])

  // Tab labels follow the shell. A session started in your home directory and
  // then `cd`'d into a repo should say the repo's name, not "session 2".
  useEffect(() => {
    return window.air.onPtyCwd(({ tabId, cwd }) => {
      const prev = tabsRef.current
      if (!prev.some(t => t.id === tabId)) return
      commitTabs(prev.map((t, i) => (
        // Don't clobber a name the user chose with :rename.
        t.id === tabId ? { ...t, cwd, label: t.renamed ? t.label : labelFor(cwd, i) } : t
      )))
    })
  }, [commitTabs])

  const visible = splitId ? [active, tabs.find(t => t.id === splitId)].filter(Boolean) : [active].filter(Boolean)

  return (
    <div className={`air${zen ? ' air-zen' : ''}`}>
      {!zen && (
        <header className="air-bar" data-drag>
          <div className="air-tabs">
            {tabs.map((tab, i) => (
              <button
                key={tab.id}
                className={`air-tab${tab.id === activeId ? ' is-active' : ''}${tab.id === splitId ? ' is-split' : ''}`}
                onClick={() => setActiveId(tab.id)}
                onAuxClick={(e) => { if (e.button === 1) closeTab(tab.id) }}
                title={tab.cwd ?? tab.label}
              >
                <span className="air-tab-n">{i + 1}</span>
                <span className="air-tab-label">{tab.label}</span>
                {tab.exited && <span className="air-tab-dot" />}
              </button>
            ))}
            <button className="air-tab air-tab-new" onClick={() => openTab(active?.cwd ?? null)} title="New session (Ctrl+T)">+</button>
          </div>
          <div className="air-bar-right">
            <span className="air-hint">Ctrl+K</span>
            <button className="air-win" onClick={() => window.air.window('minimize')} aria-label="Minimize">–</button>
            <button className="air-win" onClick={() => window.air.window('maximize')} aria-label="Maximize">▢</button>
            <button className="air-win air-win-close" onClick={() => window.air.window('close')} aria-label="Close">×</button>
          </div>
        </header>
      )}

      <main className={`air-stage${visible.length > 1 ? ' is-split' : ''}`}>
        {tabs.map(tab => {
          const shown = visible.some(v => v.id === tab.id)
          return (
            <div
              key={tab.id}
              className={`air-pane${tab.id === activeId ? ' is-active' : ''}`}
              style={shown ? undefined : { display: 'none' }}
              onMouseDown={() => setActiveId(tab.id)}
            >
              <Terminal
                ref={(handle) => {
                  if (handle) termRefs.current.set(tab.id, handle)
                  else termRefs.current.delete(tab.id)
                }}
                tabId={tab.id}
                theme={theme.xterm}
                fontSize={fontSize}
                cwd={tab.cwd}
                shellId={null}
                focused={tab.id === activeId && shown}
                onExit={() => commitTabs(tabsRef.current.map(t => (t.id === tab.id ? { ...t, exited: true } : t)))}
              />
            </div>
          )
        })}
      </main>

      {findQuery !== null && (
        <div className="air-find">
          <input
            autoFocus
            value={findQuery}
            placeholder="find in output"
            onChange={(e) => { setFindQuery(e.target.value); termOf()?.find(e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.shiftKey ? termOf()?.findPrev(findQuery) : termOf()?.find(findQuery))
              if (e.key === 'Escape') { setFindQuery(null); termOf()?.clearFind() }
            }}
          />
          <button onClick={() => { setFindQuery(null); termOf()?.clearFind() }}>×</button>
        </div>
      )}

      {!zen && (
        <footer className="air-input-row">
          <span className="air-caret">{isAirCommand(input) ? ':' : '›'}</span>
          <input
            ref={inputRef}
            className="air-input"
            value={input}
            spellCheck={false}
            placeholder={`${active?.label ?? 'session'} — type a command, or : for Air`}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submit() }
              if (e.key === 'Tab') {
                e.preventDefault()
                const hit = completions(input)[0]
                if (hit) setInput(`:${hit.name} `)
              }
              if (e.key === 'Escape') setInput('')
            }}
          />
          {isAirCommand(input) && (
            <span className="air-ghost">
              {completions(input).slice(0, 4).map(c => `:${c.name}`).join('  ')}
            </span>
          )}
        </footer>
      )}

      {sheet && (
        <div className="air-sheet" onClick={() => setSheet(null)}>
          <div className="air-sheet-body" onClick={(e) => e.stopPropagation()}>
            <h2>{sheet.title}</h2>
            <pre>{sheet.lines.join('\n')}</pre>
            <button onClick={() => setSheet(null)}>close</button>
          </div>
        </div>
      )}

      {paletteOpen && (
        <Palette
          commands={COMMANDS}
          themes={THEMES}
          tabs={tabs}
          onClose={() => setPaletteOpen(false)}
          onRun={(line) => { setPaletteOpen(false); dispatch(line) }}
          onGo={(id) => { setPaletteOpen(false); setActiveId(id) }}
        />
      )}

      {notesOpen && (
        <Notes
          notes={notes}
          onClose={() => setNotesOpen(false)}
          onAdd={(text) => setNotes(prev => [...prev, { text, at: Date.now(), session: active?.label ?? null }])}
          onRemove={(at) => setNotes(prev => prev.filter(n => n.at !== at))}
        />
      )}

      {importOpen && (
        <Import
          onClose={() => setImportOpen(false)}
          say={say}
        />
      )}

      {flash && <div className={`air-flash is-${flash.tone}`}>{flash.text}</div>}
    </div>
  )
}
