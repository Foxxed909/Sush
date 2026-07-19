import { spawn } from 'child_process'
import { resolveExecutable, shimSpawnSpec } from './exec'
import { activeUserEnv } from './users'

// Claude Code panel backend: drives `claude -p --output-format stream-json`
// and relays each NDJSON event to the renderer as it lands — live streamed
// text, visible tool calls, and a session id for --resume continuity. The
// prompt goes over STDIN (never argv; cmd.exe re-parses .cmd shim argv).
//
// One run per panel id at a time. State here is just the child process map —
// conversation continuity lives in Claude Code's own session store, keyed by
// the session id we hand back to the renderer.

const runs = new Map()   // panelId -> { child, buf }
const probes = new Set()
let send = null          // (payload) => renderer, set by ipc.js
let identityGeneration = 0

export function setClaudePanelSender(fn) { send = fn }

// Last rate-limit snapshot seen on any claude stream-json run. The CLI emits
// a rate_limit_event up front on every run, so panel use keeps this fresh
// for free; checkClaudeLimits() probes explicitly (one tiny prompt).
let lastLimits = null    // { status, resetsAt(ms), rateLimitType, at }

function captureLimits(msg) {
  if (msg?.type !== 'rate_limit_event' || !msg.rate_limit_info) return
  // Keep the utilization percentages too (was status/reset only) — the Usage
  // panel's passive view and the Usage Guard both read this snapshot, and
  // dropping the pcts forced a paid probe to learn a number the CLI had
  // already sent us for free.
  lastLimits = { ...parseUsageInfo(msg.rate_limit_info), at: Date.now() }
  send?.({ panelId: '*', kind: 'limits', limits: lastLimits })
}

export function getClaudeLimits() {
  return { ok: true, limits: lastLimits }
}

// One tiny-prompt stream-json probe: spawn `claude -p`, feed it "ping", wait
// for the first rate_limit_event, kill the child before it does real work.
// Costs (at most) a few tokens. Both public probes below are this helper with
// different env + event handling — they used to be two 40-line clones.
function probeStreamJson({ env, timeoutMsg, onLine, onClose }) {
  const bin = resolveExecutable('claude')
  if (!bin) return Promise.resolve({ ok: false, error: 'The `claude` CLI was not found on your PATH.' })
  const { file, args } = shimSpawnSpec(bin, ['-p', '--output-format', 'stream-json', '--verbose', '--strict-mcp-config'])
  return new Promise(resolve => {
    const generation = identityGeneration
    let buf = ''
    let settled = false
    let child
    const done = (result) => {
      if (settled) return
      settled = true
      if (child) probes.delete(child)
      clearTimeout(timer)
      try { child?.kill() } catch {}
      resolve(result)
    }
    try {
      child = spawn(file, args, { windowsHide: true, env })
      probes.add(child)
    } catch (e) {
      return resolve({ ok: false, error: e.message })
    }
    const timer = setTimeout(() => done({ ok: false, error: timeoutMsg }), 60000)
    child.stdout.on('data', d => {
      if (generation !== identityGeneration) return
      // Consume complete lines, keep the partial tail — splitting the whole
      // accumulated buffer every chunk re-parsed every earlier event.
      buf += d
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          const result = onLine(msg)
          if (result) { done(result); return }
        } catch {}
      }
    })
    child.on('error', e => done({ ok: false, error: e.message }))
    child.on('close', () => done(onClose()))
    try { child.stdin.write('ping'); child.stdin.end() } catch (e) { done({ ok: false, error: e.message }) }
  })
}

// Active probe for the ACTIVE account; feeds the shared lastLimits snapshot.
export function checkClaudeLimits() {
  return probeStreamJson({
    env: { ...process.env, ...activeUserEnv() },
    timeoutMsg: 'Timed out checking limits (60s).',
    onLine: (msg) => {
      captureLimits(msg)
      return msg.type === 'rate_limit_event' ? { ok: true, limits: lastLimits } : null
    },
    onClose: () => (lastLimits ? { ok: true, limits: lastLimits } : { ok: false, error: 'No limit info in the response.' })
  })
}

// Map a rate_limit_info blob to the small shape the account UI paints. We rely
// on status + the reset window (always present), and opportunistically pick up
// any utilization-percentage fields — the CLI's stream-json shape varies across
// versions, so we probe the likely names and simply omit a bar when none match.
function parseUsageInfo(info) {
  const pct = (v) => (typeof v === 'number' && v >= 0 && v <= 100 ? Math.round(v) : null)
  return {
    status: info.status || 'unknown',
    rateLimitType: info.rateLimitType || '',
    resetsAt: Number(info.resetsAt) ? Number(info.resetsAt) * 1000 : null,
    sessionPct: pct(info.sessionUtilization ?? info.usagePercent ?? info.utilization ?? info.fiveHourUtilization),
    weekPct: pct(info.weeklyUtilization ?? info.weekUtilization ?? info.sevenDayUtilization)
  }
}

// Read a fresh rate-limit snapshot for a SPECIFIC account: the env overlay
// points the CLI at that slot's config dir. Isolated — it never touches the
// shared lastLimits, so probing account B can't clobber the panel's live
// view of account A.
export function probeClaudeUsage(envOverlay = {}) {
  return probeStreamJson({
    env: { ...process.env, ...envOverlay },
    timeoutMsg: 'Timed out reading usage (60s).',
    onLine: (msg) => (msg?.type === 'rate_limit_event' && msg.rate_limit_info
      ? { ok: true, usage: parseUsageInfo(msg.rate_limit_info) }
      : null),
    onClose: () => ({ ok: false, error: 'No usage info in the response (is this account signed in?).' })
  })
}

function emit(panelId, event) {
  send?.({ panelId, ...event })
}

// Map a stream-json line to the small renderer event vocabulary. Returns null
// for events the panel does not visualize (yet).
function mapEvent(msg) {
  if (msg.type === 'system' && msg.subtype === 'init') {
    return { kind: 'init', sessionId: msg.session_id, model: msg.model, cwd: msg.cwd }
  }
  if (msg.type === 'assistant') {
    const blocks = msg.message?.content || []
    const events = []
    for (const b of blocks) {
      if (b.type === 'text' && b.text) events.push({ kind: 'text', text: b.text })
      if (b.type === 'tool_use') {
        events.push({
          kind: 'tool',
          id: b.id,
          name: b.name,
          // Surface the human-readable essence, not the whole payload.
          detail: b.input?.file_path || b.input?.command || b.input?.pattern || b.input?.path || b.input?.url || '',
        })
      }
    }
    return events
  }
  if (msg.type === 'user') {
    const blocks = msg.message?.content
    if (Array.isArray(blocks)) {
      const events = []
      for (const b of blocks) {
        if (b.type === 'tool_result') {
          const text = typeof b.content === 'string'
            ? b.content
            : (b.content || []).map(c => c.text || '').join('')
          events.push({ kind: 'tool-result', id: b.tool_use_id, error: !!b.is_error, preview: String(text).slice(0, 400) })
        }
      }
      return events
    }
    return null
  }
  if (msg.type === 'result') {
    return {
      kind: 'done',
      ok: msg.subtype === 'success',
      sessionId: msg.session_id,
      costUsd: msg.total_cost_usd,
      durationMs: msg.duration_ms,
      error: msg.subtype !== 'success' ? (msg.result || msg.subtype) : undefined
    }
  }
  return null
}

export function startClaudePanelRun({ panelId, prompt, cwd, sessionId, permissionMode }) {
  if (!panelId || !String(prompt ?? '').trim()) return { ok: false, error: 'Empty prompt' }
  if (runs.has(panelId)) return { ok: false, error: 'A run is already in progress' }
  const bin = resolveExecutable('claude')
  if (!bin) return { ok: false, error: 'The `claude` CLI was not found on your PATH.' }

  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages']
  // sessionId lands on argv, and on Windows the .cmd shim goes through
  // cmd.exe which re-parses argv — only a UUID shape is allowed through.
  if (sessionId && !/^[0-9a-fA-F-]{1,64}$/.test(String(sessionId))) {
    return { ok: false, error: 'Invalid session id' }
  }
  if (sessionId) args.push('--resume', String(sessionId))
  // Panel default: plan-free editing inside the chosen workspace dir, still
  // gated by Claude Code's own permission config. 'acceptEdits' keeps file
  // edits flowing without a TTY to answer prompts on.
  args.push('--permission-mode', permissionMode === 'default' ? 'default' : 'acceptEdits')

  const { file, args: fullArgs } = shimSpawnSpec(bin, args)
  let child
  try {
    child = spawn(file, fullArgs, {
      cwd: cwd || undefined,
      windowsHide: true,
      env: { ...process.env, ...activeUserEnv() }
    })
  } catch (e) {
    return { ok: false, error: e.message }
  }

  const run = { child, buf: '', generation: identityGeneration }
  runs.set(panelId, run)

  const handleLine = (line) => {
    if (run.generation !== identityGeneration) return
    const trimmed = line.trim()
    if (!trimmed) return
    let msg
    try { msg = JSON.parse(trimmed) } catch { return }
    captureLimits(msg)
    // stream_event partials give the live-typing feel between full messages.
    if (msg.type === 'stream_event') {
      const delta = msg.event?.delta
      if (delta?.type === 'text_delta' && delta.text) emit(panelId, { kind: 'delta', text: delta.text })
      return
    }
    const mapped = mapEvent(msg)
    if (!mapped) return
    for (const ev of Array.isArray(mapped) ? mapped : [mapped]) emit(panelId, ev)
  }

  child.stdout.on('data', (d) => {
    if (run.generation !== identityGeneration) return
    run.buf += d
    const lines = run.buf.split('\n')
    run.buf = lines.pop()
    lines.forEach(handleLine)
  })
  let stderr = ''
  child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-2000) })
  child.on('error', (e) => {
    runs.delete(panelId)
    if (run.generation === identityGeneration) emit(panelId, { kind: 'done', ok: false, error: e.message })
  })
  child.on('close', (code) => {
    if (run.buf.trim()) handleLine(run.buf)
    if (runs.delete(panelId) && code !== 0 && run.generation === identityGeneration) {
      emit(panelId, { kind: 'done', ok: false, error: (stderr.trim() || `claude exited with code ${code}`).slice(0, 500) })
    }
  })

  try {
    child.stdin.write(String(prompt))
    child.stdin.end()
  } catch (e) {
    runs.delete(panelId)
    try { child.kill() } catch {}
    return { ok: false, error: e.message }
  }
  return { ok: true }
}

export function stopClaudePanelRun({ panelId }) {
  const run = runs.get(panelId)
  if (!run) return { ok: true }
  runs.delete(panelId)
  try { run.child.kill() } catch {}
  emit(panelId, { kind: 'done', ok: false, error: 'Stopped.' })
  return { ok: true }
}

export function stopAllClaudePanelRuns() {
  identityGeneration += 1
  lastLimits = null
  for (const child of probes) {
    try { child.kill() } catch {}
  }
  probes.clear()
  for (const [panelId, run] of runs) {
    try { run.child.kill() } catch {}
    runs.delete(panelId)
  }
}
