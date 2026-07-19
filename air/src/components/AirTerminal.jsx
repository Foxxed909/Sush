import React, { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { spawnPty, writePty, resizePty, killPty, onPtyOutput, onPtyExit } from '../lib/pty'
import { interpretLine } from '../lib/commands'
import { THEMES } from '../lib/themes'

// One PTY-backed terminal. The `:` sigil enters local mode (see lib/commands):
// keystrokes echo locally and never reach the shell until we decide the line
// wasn't ours after all (it always is — ':' lines are Air's).
export default function AirTerminal({ id, shell, cwd, run, theme, active, onExit, onTheme }) {
  const hostRef = useRef(null)
  const termRef = useRef(null)
  const localBuf = useRef(null) // null = passthrough, string = local ':' line
  const typedSinceEnter = useRef(false) // ':' is a sigil only on a fresh prompt line

  useEffect(() => {
    const term = new Terminal({
      fontFamily: '"Cascadia Mono", "JetBrains Mono", Consolas, monospace',
      fontSize: 13.5,
      cursorBlink: true,
      allowProposedApi: true,
      theme: theme.term
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    fit.fit()
    termRef.current = { term, fit }

    let disposed = false
    const unlisteners = []
    ;(async () => {
      const un1 = await onPtyOutput(id, (chunk) => term.write(chunk))
      const un2 = await onPtyExit(id, (code) => {
        term.write(`\r\n\x1b[2m[session ended · exit ${code}]\x1b[0m\r\n`)
        onExit?.(id, code)
      })
      unlisteners.push(un1, un2)
      if (disposed) return
      try {
        await spawnPty({ id, shell, cwd, cols: term.cols, rows: term.rows })
        if (run) await writePty(id, `${run}\r`)
      } catch (e) {
        term.write(`\r\n\x1b[31mfailed to start shell: ${e}\x1b[0m\r\n`)
      }
    })()

    term.onData((data) => {
      // Local ':' mode — swallow, echo, interpret at Enter.
      if (localBuf.current !== null) {
        if (data === '\r') {
          const line = localBuf.current
          localBuf.current = null
          term.write('\r\n')
          const action = interpretLine(line.slice(1), { themes: THEMES })
          if (!action) term.write(`\x1b[2munknown — :help lists built-ins\x1b[0m\r\n`)
          else if (action.print) term.write(action.print)
          else if (action.clear) term.clear()
          else if (action.theme) onTheme?.(action.theme)
          else if (action.run) writePty(id, `${action.run}\r`)
          return
        }
        if (data === '\x7f') { // backspace
          if (localBuf.current.length > 1) {
            localBuf.current = localBuf.current.slice(0, -1)
            term.write('\b \b')
          } else {
            localBuf.current = null
            term.write('\b \b')
          }
          return
        }
        if (data === '\x03' || data === '\x1b') { // ctrl-c / esc cancels
          localBuf.current = null
          term.write('\r\n')
          return
        }
        if (data >= ' ' && !data.startsWith('\x1b')) {
          localBuf.current += data
          term.write(data)
        }
        return
      }
      if (data === ':' && !typedSinceEnter.current) {
        localBuf.current = ':'
        term.write('\x1b[1m:\x1b[0m')
        return
      }
      if (data === '\r') typedSinceEnter.current = false
      else if (data >= ' ') typedSinceEnter.current = true
      writePty(id, data)
    })

    const onResize = () => {
      fit.fit()
      resizePty(id, term.cols, term.rows).catch(() => {})
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(hostRef.current)

    return () => {
      disposed = true
      ro.disconnect()
      unlisteners.forEach((u) => u())
      killPty(id).catch(() => {})
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Theme switches restyle the live terminal without a respawn.
  useEffect(() => {
    const t = termRef.current?.term
    if (t) t.options.theme = theme.term
  }, [theme])

  useEffect(() => {
    if (active) {
      termRef.current?.fit.fit()
      termRef.current?.term.focus()
    }
  }, [active])

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0, padding: '6px 4px 4px 10px' }} />
}
