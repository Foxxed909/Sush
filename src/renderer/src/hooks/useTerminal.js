import React, { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import { isAppChord } from '../lib/keymap'
import { terminalInputAllowed, terminalInputTargets } from '../lib/terminalInput'
import '@xterm/xterm/css/xterm.css'
import { registerTerminal, unregisterTerminal } from '../lib/terminalRegistry'

export function useTerminal({
  containerRef,
  tabId,
  agentId,
  theme,
  profile,
  initialCwd,
  bootCommand,
  fontSize = 14,
  fontFamily = "'Cascadia Code', 'Fira Code', Consolas, monospace",
  cursorStyle = 'block',
  broadcastTabIds,
  restoreKey,
  persistScrollback = true,
  transparentBg = false,
  powerSaver = false,
  inputLocked = false,
  onAutoCopy,
  onCommand,
  onSessionState,
  onReady
}) {
  const termRef = useRef(null)
  const fitAddonRef = useRef(null)
  const searchAddonRef = useRef(null)
  const onAutoCopyRef = useRef(onAutoCopy)
  const onCommandRef = useRef(onCommand)
  const onSessionStateRef = useRef(onSessionState)
  const onReadyRef = useRef(onReady)
  const broadcastTabIdsRef = useRef(broadcastTabIds)
  const webglAddonRef = useRef(null)
  // Accent colour for command-start markers; kept in a ref so the create-effect
  // (which doesn't depend on theme) always reads the current value.
  const accentRef = useRef(theme?.ui?.accent ?? '#ff6b9d')
  // initialCwd is only consumed once, when the PTY first spawns. Keep it in a ref
  // so that later cwd updates (the shell reports its directory via OSC7 on every
  // `cd`) don't land in the create-effect's dependency array -- otherwise each
  // directory change would dispose and recreate the xterm instance, wiping the
  // visible buffer and re-running startPty.
  const initialCwdRef = useRef(initialCwd)
  const bootCommandRef = useRef(bootCommand)
  // Same for the spawn profile: the PTY reports its real shell once ready
  // (e.g. `bash` where the tab only knew a `powershell` fallback). Depending on
  // those values directly re-ran the create-effect, disposing xterm right after
  // every new session's first start.
  const spawnProfileRef = useRef({ shell: profile?.shell, id: profile?.id })

  useEffect(() => {
    onAutoCopyRef.current = onAutoCopy
  }, [onAutoCopy])

  useEffect(() => {
    onCommandRef.current = onCommand
  }, [onCommand])

  useEffect(() => {
    onSessionStateRef.current = onSessionState
  }, [onSessionState])

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    initialCwdRef.current = initialCwd
  }, [initialCwd])

  useEffect(() => {
    bootCommandRef.current = bootCommand
  }, [bootCommand])

  useEffect(() => {
    spawnProfileRef.current = { shell: profile?.shell, id: profile?.id }
  }, [profile?.shell, profile?.id])

  useEffect(() => {
    broadcastTabIdsRef.current = broadcastTabIds
  }, [broadcastTabIds])

  // Usage Guard "block" mode: drop keystrokes bound for this PTY while locked.
  const inputLockedRef = useRef(inputLocked)
  useEffect(() => {
    inputLockedRef.current = inputLocked
  }, [inputLocked])

  useEffect(() => {
    accentRef.current = theme?.ui?.accent ?? '#ff6b9d'
  }, [theme])

  const loadWebglRenderer = useCallback((term) => {
    if (!term || webglAddonRef.current) return
    try {
      const addon = new WebglAddon()
      addon.onContextLoss(() => {
        try { addon.dispose() } catch {}
        if (webglAddonRef.current === addon) webglAddonRef.current = null
      })
      term.loadAddon(addon)
      webglAddonRef.current = addon
    } catch {
      webglAddonRef.current = null
    }
  }, [])

  const disposeWebglRenderer = useCallback(() => {
    try { webglAddonRef.current?.dispose() } catch {}
    webglAddonRef.current = null
  }, [])

  const resizePty = useCallback(() => {
    const term = termRef.current
    if (!term) return
    window.sush.ptyResize({ tabId, cols: term.cols, rows: term.rows })
  }, [tabId])

  // Fitting can throw if the renderer's dimensions aren't ready yet (e.g. when a
  // swarm mounts many terminals at once). Swallow it -- the ResizeObserver retries.
  const safeFit = useCallback(() => {
    try { fitAddonRef.current?.fit() } catch {}
  }, [])

  const sendPtyInput = useCallback((data, { broadcast = false } = {}) => {
    if (!data || !terminalInputAllowed(inputLockedRef.current, data)) return false
    const targets = broadcast ? terminalInputTargets(tabId, broadcastTabIdsRef.current) : [tabId]
    for (const targetId of targets) window.sush.ptyInput({ tabId: targetId, data })
    return true
  }, [tabId])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      fontFamily,
      fontSize,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle,
      theme: theme?.xterm,
      // 2000 lines, not 5000: the buffer is per terminal and up to 16 stay
      // mounted at once, so this is the single biggest renderer-RAM lever.
      // Persistent scrollback already covers "I closed it and want history".
      scrollback: 2000,
      allowTransparency: true,
      copyOnSelect: true
    })

    const fitAddon = new FitAddon()
    const searchAddon = new SearchAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(searchAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)

    // GPU renderer: paints the terminal as a single WebGL canvas with a glyph
    // atlas instead of mutating the DOM per row — far less CPU on heavy output
    // and across a swarm. Must load AFTER open() (needs a live context). On
    // context loss (driver hiccup / GPU reset) we dispose it and xterm silently
    // falls back to the DOM renderer.
    //
    // SKIP webgl when a transparent background is wanted: the WebGL canvas paints
    // its own opaque backing, so a transparent theme bg never shows the wallpaper
    // through it. The DOM renderer honours `allowTransparency` correctly. This is
    // opt-in (the "wallpaper through terminals" setting), so the perf trade only
    // applies when the user has explicitly chosen looks over raw throughput.
    if (!transparentBg && !powerSaver) loadWebglRenderer(term)

    try { fitAddon.fit() } catch {}
    term.focus()

    // App-owned chords must not reach the PTY. The window-level handlers in
    // App.jsx still receive these events — returning false only tells xterm to
    // ignore them, so Ctrl+W closes the tab without ALSO sending ^W to the
    // shell. The chord list lives in lib/keymap (ONE registry for both sides
    // — two hand-copied tables here and in App drifted twice). Ctrl+Shift+C/V
    // are handled right here: terminal-standard copy/paste that never
    // collides with ^C/^V.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

      if (ctrl && e.shiftKey && key === 'c') {
        const sel = term.getSelection()
        if (sel) window.sush.copyText(sel).catch(() => {})
        return false
      }
      if (ctrl && e.shiftKey && key === 'v') {
        navigator.clipboard.readText().then(text => { if (text) term.paste(text) }).catch(() => {})
        return false
      }
      // Ctrl+F is find-in-terminal (Terminal.jsx opens the SearchBar on the
      // same window event). Without this, the search bar opened AND ^F still
      // went to the PTY — the exact double-action drift keymap.js warns about.
      if (e.ctrlKey && !e.shiftKey && !e.altKey && key === 'f') return false

      return !isAppChord(e)
    })

    termRef.current = term
    registerTerminal(tabId, term)
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    let copyTimer = null
    let lastCopiedSelection = ''
    let commandBuffer = ''
    let longRunTimer = null
    let pendingNotifCmd = null

    const sushNotify = (title, body) => {
      if (!('Notification' in window)) return
      // Electron renderer always has permission granted
      try { new Notification(title, { body, silent: true }) } catch {}
    }

    const removeDataListener = window.sush.onPtyData(({ tabId: incomingTabId, data }) => {
      if (incomingTabId !== tabId) return
      term.write(data)
    })

    const removeExitListener = window.sush.onPtyExit(({ tabId: incomingTabId, exitCode }) => {
      if (incomingTabId !== tabId) return
      term.writeln(`\r\n\x1b[33mShell exited with code ${exitCode ?? 0}.\x1b[0m`)
    })

    const removeStateListener = window.sush.onPtyState((state) => {
      if (state.tabId === tabId) onSessionStateRef.current?.(state)
    })

    const inputDisposable = term.onData((data) => {
      // Usage Guard block: swallow input to this session while the guard is
      // tripped — except Ctrl+C, so a runaway stream can still be interrupted.
      if (!sendPtyInput(data, { broadcast: true })) return
      if (data === '\r') {
        const command = commandBuffer.trim()
        // Notify completion of a previously flagged long command
        if (pendingNotifCmd) {
          sushNotify('Command finished', pendingNotifCmd.slice(0, 80))
          pendingNotifCmd = null
        }
        if (command) {
          onCommandRef.current?.(command)
          // Drop a marker on the overview ruler (right gutter) at the prompt line
          // so you can see — and jump to — where each command started. Mirrors the
          // command-block markers in Warp / VS Code's scrollbar.
          try {
            const marker = term.registerMarker(0)
            if (marker) {
              term.registerDecoration({
                marker,
                overviewRulerOptions: { color: accentRef.current, position: 'left' }
              })
            }
          } catch {}
          if (longRunTimer) clearTimeout(longRunTimer)
          const snap = command
          longRunTimer = setTimeout(() => {
            if (!document.hasFocus()) {
              sushNotify('Still running...', snap.slice(0, 80))
              pendingNotifCmd = snap
            }
          }, 5000)
        }
        commandBuffer = ''
      } else if (data === '\x7f') {
        commandBuffer = commandBuffer.slice(0, -1)
      } else if (data === '\x03') {
        commandBuffer = ''
        if (longRunTimer) { clearTimeout(longRunTimer); longRunTimer = null }
        pendingNotifCmd = null
      } else if (data >= ' ' && !data.startsWith('\x1b')) {
        commandBuffer += data
      }
    })

    const selectionDisposable = term.onSelectionChange(() => {
      if (copyTimer) clearTimeout(copyTimer)
      copyTimer = setTimeout(() => {
        const selected = term.getSelection()
        if (selected && selected !== lastCopiedSelection) {
          lastCopiedSelection = selected
          window.sush.copyText(selected)
            .then(() => onAutoCopyRef.current?.(selected))
            .catch(() => {})
        }
      }, 220)
    })

    // Defer the PTY start (which triggers the first writes from main) until after
    // a frame so the renderer has measured its dimensions. Starting synchronously
    // while a swarm of terminals mounts can make xterm's scroll-sync read
    // undefined dimensions and throw a benign-but-noisy error.
    let started = false
    const beginPty = () => {
      if (started) return
      started = true
      try { fitAddon.fit() } catch {}
      window.sush.startPty({
        tabId,
        cols: term.cols,
        rows: term.rows,
        cwd: initialCwdRef.current,
        bootCommand: bootCommandRef.current,
        agentId,
        shellId: spawnProfileRef.current.shell,
        profileId: spawnProfileRef.current.id,
        restoreKey,
        persistScrollback
      })
        .then((state) => {
          resizePty()
          onReadyRef.current?.(state)
        })
        .catch((error) => {
          term.writeln(`\x1b[31mFailed to start shell: ${error.message}\x1b[0m`)
        })
    }
    const rafId = requestAnimationFrame(beginPty)

    const resizeObserver = new ResizeObserver(() => {
      try { fitAddon.fit() } catch {}
      resizePty()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      cancelAnimationFrame(rafId)
      if (copyTimer) clearTimeout(copyTimer)
      if (longRunTimer) clearTimeout(longRunTimer)
      inputDisposable.dispose()
      selectionDisposable.dispose()
      removeDataListener()
      removeExitListener()
      removeStateListener()
      resizeObserver.disconnect()
      disposeWebglRenderer()
      unregisterTerminal(tabId, term)
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
      searchAddonRef.current = null
    }
    // transparentBg / powerSaver are deliberately NOT deps: they only pick the
    // initial renderer, and the effect below swaps WebGL in/out at runtime.
    // Listing transparentBg here disposed and recreated the whole xterm on a
    // wallpaper/eco toggle, wiping every terminal's visible buffer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, containerRef, resizePty, sendPtyInput, tabId])

  useEffect(() => {
    if (transparentBg || powerSaver) {
      disposeWebglRenderer()
      return
    }
    loadWebglRenderer(termRef.current)
  }, [disposeWebglRenderer, loadWebglRenderer, powerSaver, transparentBg])

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize
      safeFit()
      resizePty()
    }
  }, [fontSize, resizePty, safeFit])

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontFamily = fontFamily
      safeFit()
      resizePty()
    }
  }, [fontFamily, resizePty, safeFit])

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.cursorStyle = cursorStyle
    }
  }, [cursorStyle])

  useEffect(() => {
    if (termRef.current && theme?.xterm) {
      termRef.current.options.theme = theme.xterm
    }
  }, [theme])

  const fit = useCallback(() => {
    safeFit()
    resizePty()
  }, [resizePty, safeFit])

  const pasteText = useCallback((text) => {
    if (!termRef.current || !text) return
    // Context-menu and file-drop pastes bypass xterm's onData callback, so
    // explicitly apply the same Usage Guard and broadcast behavior as typing.
    if (!sendPtyInput(text, { broadcast: true })) return
    termRef.current.focus()
  }, [sendPtyInput])

  const search = useCallback((query, opts = {}) => {
    if (!searchAddonRef.current || !query) return
    searchAddonRef.current.findNext(query, { incremental: false, ...opts })
  }, [])

  const searchPrev = useCallback((query, opts = {}) => {
    if (!searchAddonRef.current || !query) return
    searchAddonRef.current.findPrevious(query, { incremental: false, ...opts })
  }, [])

  const clearSearch = useCallback(() => {
    searchAddonRef.current?.clearDecorations()
  }, [])

  const getSelection = useCallback(() => termRef.current?.getSelection() ?? '', [])

  const focus = useCallback(() => {
    termRef.current?.focus()
  }, [])

  const clear = useCallback(() => {
    termRef.current?.clear()
    termRef.current?.focus()
  }, [])

  return { term: termRef, fit, focus, pasteText, search, searchPrev, clearSearch, getSelection, clear }
}
