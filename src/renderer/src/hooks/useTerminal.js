import { useEffect, useRef, useCallback } from 'react'
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
  fontSize = 14,
  fontFamily = "'Cascadia Code', 'Fira Code', Consolas, monospace",
  cursorStyle = 'block',
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
  // initialCwd is only consumed once, when the PTY first spawns. Keep it in a ref
  // so that later cwd updates (the shell reports its directory via OSC7 on every
  // `cd`) don't land in the create-effect's dependency array — otherwise each
  // directory change would dispose and recreate the xterm instance, wiping the
  // visible buffer and re-running startPty.
  const initialCwdRef = useRef(initialCwd)

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

  const resizePty = useCallback(() => {
    const term = termRef.current
    if (!term) return
    window.sush.ptyResize({ tabId, cols: term.cols, rows: term.rows })
  }, [tabId])

  // Fitting can throw if the renderer's dimensions aren't ready yet (e.g. when a
  // swarm mounts many terminals at once). Swallow it — the ResizeObserver retries.
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

    const removeDataListener = window.sush.onPtyData(({ tabId: incomingTabId, data }) => {
      if (incomingTabId === tabId) term.write(data)
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
        if (command) onCommandRef.current?.(command)
        commandBuffer = ''
      } else if (data === '\x7f') {
        commandBuffer = commandBuffer.slice(0, -1)
      } else if (data === '\x03') {
        commandBuffer = ''
      } else if (data >= ' ' && !data.startsWith('\x1b')) {
        commandBuffer += data
      }
      window.sush.ptyInput({ tabId, data })
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
        shellId: profile?.shell,
        profileId: profile?.id
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

  return { term: termRef, fit, focus, pasteText, search, searchPrev, clearSearch, getSelection, clear }
}
