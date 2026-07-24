import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

// One terminal. The main app's useTerminal hook is 420 lines because it also
// carries broadcast targets, usage-guard input locking, scrollback restore,
// command-marker decorations, long-run notifications and a WebGL renderer that
// gets swapped at runtime. Air needs none of that, so this is the small version
// and stays the small version.
//
// The one thing it does keep is the app-chord guard: chords that belong to Air
// must not ALSO reach the shell, or Ctrl+T opens a tab and sends ^T.

const APP_CHORDS = new Set(['t', 'w', 'k', 'l', 'f', 'n', 'p', '\\'])

function isAppChord(e) {
  const ctrl = e.ctrlKey || e.metaKey
  if (!ctrl) return false
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (e.shiftKey && (key === 'c' || key === 'v')) return false  // handled below
  if (APP_CHORDS.has(key)) return true
  if (/^[1-9]$/.test(key) && !e.shiftKey) return true
  if (key === '+' || key === '=' || key === '-' || key === '0') return true
  return false
}

const AirTerminal = forwardRef(function AirTerminal(
  { tabId, theme, fontSize, cwd, shellId, onExit, onData, onReady, focused },
  ref
) {
  const hostRef = useRef(null)
  const termRef = useRef(null)
  const fitRef = useRef(null)
  const searchRef = useRef(null)
  const bufferRef = useRef('')
  const onExitRef = useRef(onExit)
  const onDataRef = useRef(onData)
  const onReadyRef = useRef(onReady)
  // cwd/shellId are consumed once, at spawn. Keeping them in refs is what stops
  // a `cd` in the shell (which updates cwd) from tearing down and recreating
  // the whole xterm instance and wiping the visible buffer.
  const cwdRef = useRef(cwd)
  const shellRef = useRef(shellId)

  useEffect(() => { onExitRef.current = onExit }, [onExit])
  useEffect(() => { onDataRef.current = onData }, [onData])
  useEffect(() => { onReadyRef.current = onReady }, [onReady])

  useImperativeHandle(ref, () => ({
    focus: () => termRef.current?.focus(),
    clear: () => { termRef.current?.clear(); bufferRef.current = '' },
    fit: () => { try { fitRef.current?.fit() } catch {} },
    write: (text) => termRef.current?.write(text),
    paste: (text) => { if (text) window.air.ptyInput({ tabId, data: text }) },
    find: (query) => { try { searchRef.current?.findNext(query, { incremental: false }) } catch {} },
    findPrev: (query) => { try { searchRef.current?.findPrevious(query, { incremental: false }) } catch {} },
    clearFind: () => { try { searchRef.current?.clearDecorations() } catch {} },
    selection: () => termRef.current?.getSelection() ?? '',
    // The plain-text tail Air exports and shows in `:find` context. ANSI is
    // stripped on the way in so an export can never carry escape codes into
    // whatever opens the file.
    text: () => bufferRef.current
  }), [tabId])

  useEffect(() => {
    if (!hostRef.current) return

    const term = new Terminal({
      fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
      fontSize,
      lineHeight: 1.35,
      cursorBlink: true,
      cursorStyle: 'bar',
      theme,
      // 4000 lines. Air holds at most twelve terminals, where the main app
      // holds up to twenty-five — the same RAM budget buys a deeper buffer.
      scrollback: 4000,
      allowTransparency: false
    })

    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    term.loadAddon(new WebLinksAddon((event, uri) => {
      event.preventDefault()
      window.air.openExternal(uri)
    }))
    term.open(hostRef.current)
    try { fit.fit() } catch {}

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (ctrl && e.shiftKey && key === 'c') {
        const sel = term.getSelection()
        if (sel) window.air.copy(sel)
        return false
      }
      if (ctrl && e.shiftKey && key === 'v') {
        window.air.paste().then(text => { if (text) window.air.ptyInput({ tabId, data: text }) })
        return false
      }
      return !isAppChord(e)
    })

    termRef.current = term
    fitRef.current = fit
    searchRef.current = search

    const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[<-?]/g
    const removeData = window.air.onPtyData(({ tabId: id, data }) => {
      if (id !== tabId) return
      term.write(data)
      bufferRef.current = (bufferRef.current + String(data).replace(ANSI, '')).slice(-80_000)
    })

    const removeExit = window.air.onPtyExit(({ tabId: id, exitCode }) => {
      if (id !== tabId) return
      term.writeln(`\r\n\x1b[33m[session ended — exit ${exitCode ?? 0}]\x1b[0m`)
      onExitRef.current?.(exitCode)
    })

    const input = term.onData((data) => {
      window.air.ptyInput({ tabId, data })
      onDataRef.current?.(data)
    })

    // Start the PTY after a frame so xterm has measured itself. Starting
    // synchronously while several terminals mount at once makes the first
    // writes land against undefined dimensions.
    let started = false
    const begin = () => {
      if (started) return
      started = true
      try { fit.fit() } catch {}
      window.air.startPty({ tabId, cols: term.cols, rows: term.rows, cwd: cwdRef.current, shellId: shellRef.current })
        .then((state) => {
          window.air.ptyResize({ tabId, cols: term.cols, rows: term.rows })
          onReadyRef.current?.(state)
        })
        .catch((err) => {
          term.writeln(`\x1b[31m${err.message}\x1b[0m`)
        })
    }
    const raf = requestAnimationFrame(begin)

    const observer = new ResizeObserver(() => {
      try { fit.fit() } catch {}
      window.air.ptyResize({ tabId, cols: term.cols, rows: term.rows })
    })
    observer.observe(hostRef.current)

    return () => {
      cancelAnimationFrame(raf)
      input.dispose()
      removeData()
      removeExit()
      observer.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      searchRef.current = null
    }
    // fontSize and theme are applied by the effects below rather than listed
    // here — as deps they would dispose and rebuild the terminal (and restart
    // the PTY) every time you nudged the font.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = theme
  }, [theme])

  useEffect(() => {
    if (!termRef.current) return
    termRef.current.options.fontSize = fontSize
    try { fitRef.current?.fit() } catch {}
    window.air.ptyResize({ tabId, cols: termRef.current.cols, rows: termRef.current.rows })
  }, [fontSize, tabId])

  useEffect(() => {
    if (!focused) return
    // Refit on focus: a terminal that was hidden measured itself at zero, so
    // its cols/rows are stale by the time you look at it again.
    try { fitRef.current?.fit() } catch {}
    termRef.current?.focus()
  }, [focused])

  return <div ref={hostRef} className="air-term" />
})

export default AirTerminal
