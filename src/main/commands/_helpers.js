export const ok = (output) => ({ output, type: 'success' })
export const err = (msg) => ({ output: `\x1b[31m${msg}\x1b[0m`, type: 'error' })
export const info = (msg) => ({ output: `\x1b[36m${msg}\x1b[0m`, type: 'info' })
export const cancelled = () => ({ output: '\x1b[33m^C\x1b[0m', type: 'cancelled' })

// A command's own timeout combined with the session's cancel signal (the
// smart bar's cancel-command), so long network commands are actually
// interruptible. AbortSignal.any needs Node 20.3+ — Electron 31 ships above.
export const runSignal = (ctx, timeoutMs) => {
  const timeout = AbortSignal.timeout(timeoutMs)
  return ctx?.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout
}

// Was this failure a user cancel (vs a real error / plain timeout)?
export const wasCancelled = (e, ctx) =>
  !!ctx?.signal?.aborted || e?.name === 'AbortError' || e?.code === 'ABORT_ERR'

export const ansi = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  white: (s) => `\x1b[37m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  pink: (s) => `\x1b[38;2;255;107;157m${s}\x1b[0m`
}
