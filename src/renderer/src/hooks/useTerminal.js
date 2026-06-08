import React, { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'

export function useTerminal({
  containerRef,
  tabId,
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
  const recordingRef = useRef(false)
  const recordStartRef = useRef(0)
  const recordEventsRef = useRef([])
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
    broadcastTabIdsRef.current = broadcastTabIds
  }, [broadcastTabIds])

  useEffect(() => {
    accentRef.current = theme?.ui?.accent ?? '#ff6b9d'
  }, [theme])

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

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      fontFamily,
      fontSize,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle,
      theme: theme?.xterm,
      scrollback: 5000,
      allowTransparency: true,
      copyOnSelect: true
    })

    const fitAddon = new FitAddon()
    const searchAddon = new SearchAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(searchAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    try { fitAddon.fit() } catch {}
    term.focus()

    termRef.current = term
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
      if (recordingRef.current) {
        const ts = (Date.now() - recordStartRef.current) / 1000
        recordEventsRef.current.push([ts, 'o', data])
      }
    })

    const removeExitListener = window.sush.onPtyExit(({ tabId: incomingTabId, exitCode }) => {
      if (incomingTabId !== tabId) return
      term.writeln(`\r\n\x1b[33mShell exited with code ${exitCode ?? 0}.\x1b[0m`)
    })

    const removeStateListener = window.sush.onPtyState((state) => {
      if (state.tabId === tabId) onSessionStateRef.current?.(state)
    })

    const inputDisposable = term.onData((data) => {
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
      window.sush.ptyInput({ tabId, data })
      // Broadcast to other tabs if broadcast mode is active
      const bcastIds = broadcastTabIdsRef.current
      if (bcastIds && bcastIds.length > 1) {
        for (const id of bcastIds) {
          if (id !== tabId) window.sush.ptyInput({ tabId: id, data })
        }
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
        shellId: profile?.shell,
        profileId: profile?.id,
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
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
      searchAddonRef.current = null
    }
  }, [containerRef, profile?.id, profile?.shell, resizePty, tabId])

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
    window.sush.ptyInput({ tabId, data: text })
    termRef.current.focus()
  }, [tabId])

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

  const [isRecording, setIsRecording] = useState(false)

  const startRecording = useCallback(() => {
    recordingRef.current = true
    recordStartRef.current = Date.now()
    recordEventsRef.current = []
    setIsRecording(true)
  }, [])

  const stopRecording = useCallback(() => {
    recordingRef.current = false
    setIsRecording(false)
    const term = termRef.current
    const header = JSON.stringify({ version: 2, width: term?.cols ?? 80, height: term?.rows ?? 24, timestamp: Math.floor(recordStartRef.current / 1000) })
    const events = recordEventsRef.current.map(e => JSON.stringify(e)).join('\n')
    const content = header + '\n' + events + '\n'
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sush-recording-${Date.now()}.cast`
    a.click()
    URL.revokeObjectURL(url)
    recordEventsRef.current = []
  }, [])

  return { term: termRef, fit, focus, pasteText, search, searchPrev, clearSearch, getSelection, clear, startRecording, stopRecording, isRecording }
}
