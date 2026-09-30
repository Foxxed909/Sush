// Provider capability discovery for Nightly.
//
// Hard-coded provider tables age badly: CLIs add, rename and drop flags between
// releases. This module asks the INSTALLED CLI what it supports (`--version`
// and `--help`, both side-effect free) and reports only what that output
// actually shows. Anything it cannot observe stays `null` ("unknown"), so the
// renderer keeps its verified fallback instead of guessing either way.
//
// Cost model: two short spawns per provider, cached by the resolved binary's
// path + size + mtime. A provider CLI upgrade changes the stat and triggers one
// re-probe; otherwise results are served from memory. Callers can force a
// refresh (explicit user action, login change).

import { spawn } from 'child_process'
import { statSync } from 'fs'
import { resolveExecutable, shimSpawnSpec } from './exec.js'
import { CODEX_THREAD_MIN_VERSION, compareVersions } from './thread-providers.js'

// How each provider exposes resume / reasoning, in terms of what `--help`
// must mention for Sush to use it. These are search targets, not assertions
// that the flag exists — the probe decides.
export const PROVIDER_PROBES = {
  claude: { bin: 'claude', modelFlag: '--model', resume: { flag: '--continue' }, effortFlag: '--effort', settingsFlag: '--settings' },
  codex: { bin: 'codex', modelFlag: '--model', resume: { subcommand: 'resume' }, configFlag: '--config' },
  gemini: { bin: 'gemini', modelFlag: '--model', resume: { flag: '--resume' }, hooksSubcommand: 'hooks' },
  opencode: { bin: 'opencode', modelFlag: '--model', resume: { flag: '--continue' } },
  grok: { bin: 'grok', modelFlag: '--model', resume: { flag: '--continue' } }
}

// Telemetry Sush itself implements per provider (see readAccountUsage). This
// is about Sush's own bridges, so it is static — and deliberately honest:
// no provider exposes same-session context-window telemetry to Sush today.
// Claude Thread is capability-gated below because it depends on the installed
// CLI accepting an additional --settings source for Sush's per-session hooks.
const SUSH_BRIDGES = {
  claude: { usageTelemetry: 'rate-limits', contextTelemetry: false, threadBridge: null },
  codex: { usageTelemetry: 'health', contextTelemetry: false, threadBridge: false },
  gemini: { usageTelemetry: 'health', contextTelemetry: false, threadBridge: false },
  opencode: { usageTelemetry: 'health', contextTelemetry: false, threadBridge: false },
  grok: { usageTelemetry: 'health', contextTelemetry: false, threadBridge: false }
}

const CAPABILITY_SCHEMA_VERSION = 3
const PROBE_TIMEOUT_MS = 8000
const MAX_OUTPUT = 64 * 1024
const SAFE_CHOICE = /^[a-z][a-z0-9_-]{0,31}$/

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g
const stripAnsi = text => String(text ?? '').replace(ANSI, '')

export function parseCliVersion(text) {
  const m = stripAnsi(text).match(/\bv?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?)\b/)
  return m ? m[1] : null
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function helpHasFlag(help, flag) {
  if (!help || !flag) return null
  return new RegExp(`(^|[\\s,\\[(])${escapeRe(flag)}(?![\\w-])`, 'm').test(stripAnsi(help))
}

export function helpHasSubcommand(help, name) {
  if (!help || !name) return null
  // Subcommands are listed at the start of an indented line: "  resume  Resume…"
  return new RegExp(`^\\s{1,8}${escapeRe(name)}(\\s|\\[|<|$)`, 'm').test(stripAnsi(help))
}

// Pull the advertised value set for a flag out of its help entry. Handles the
// common CLI-parser spellings: commander's `(choices: "a", "b")`, clap's
// `[possible values: a, b]`, inline `<a|b|c>` placeholders and a bare
// `(a, b, c)` list in the description. Returns null
// when the help text doesn't enumerate values — callers keep their fallback.
export function parseFlagChoices(help, flag) {
  if (!help || !flag) return null
  const lines = stripAnsi(help).split(/\r?\n/)
  const at = lines.findIndex(line => helpHasFlag(line, flag))
  if (at < 0) return null
  // A description may wrap; read until the next option entry starts.
  const entry = [lines[at]]
  for (let i = at + 1; i < lines.length && i < at + 6; i++) {
    if (/^\s*-{1,2}[A-Za-z]/.test(lines[i]) || !lines[i].trim()) break
    entry.push(lines[i])
  }
  const text = entry.join(' ')

  let raw = null
  // Bare parenthesised word list, e.g. Claude Code 2.1.x:
  // "Effort level for the current session (low, medium, high, xhigh, max)".
  // Strict: at least two bare words, so "(e.g. 'opus')" prose never matches.
  const bare = text.match(/\(\s*([a-z][\w-]*(?:\s*,\s*[a-z][\w-]*)+)\s*\)/)
  const commander = text.match(/choices:\s*([^)]*)\)/i)
  const clap = text.match(/possible values:\s*([^\]]*)\]/i)
  const inline = text.match(new RegExp(`${escapeRe(flag)}[ =]<([^>]*\\|[^>]*)>`))
  if (commander) raw = commander[1].split(',')
  else if (clap) raw = clap[1].split(',')
  else if (inline) raw = inline[1].split('|')
  else if (bare) raw = bare[1].split(',')
  if (!raw) return null

  const values = raw
    .map(v => v.trim().replace(/^["'`]|["'`]$/g, '').toLowerCase())
    .filter(v => SAFE_CHOICE.test(v))
  return values.length ? [...new Set(values)] : null
}

// Turn raw probe output into the capability record the renderer consumes.
export function buildCapabilities(provider, { installed, version = null, help = null, error = null } = {}) {
  const probe = PROVIDER_PROBES[provider]
  const bridges = SUSH_BRIDGES[provider] || { usageTelemetry: null, contextTelemetry: false, threadBridge: false }
  const base = {
    provider,
    installed: !!installed,
    version: installed ? version : null,
    probedAt: Date.now(),
    error: error || null,
    ...bridges
  }
  if (!probe || !installed) {
    return { ...base, models: { flag: null }, reasoning: null, resume: null }
  }

  const hasHelp = typeof help === 'string' && help.trim().length > 0
  const models = { flag: hasHelp ? helpHasFlag(help, probe.modelFlag) : null }

  let resume = null
  if (hasHelp) {
    resume = probe.resume.subcommand
      ? helpHasSubcommand(help, probe.resume.subcommand)
      : helpHasFlag(help, probe.resume.flag)
  }

  let reasoning = null
  if (hasHelp && probe.effortFlag) {
    const flag = helpHasFlag(help, probe.effortFlag)
    reasoning = { flag, choices: flag ? parseFlagChoices(help, probe.effortFlag) : null }
  } else if (hasHelp && probe.configFlag) {
    // Codex reasoning goes through `--config model_reasoning_effort=…`; the
    // value set is per model and not enumerated in help.
    reasoning = { flag: helpHasFlag(help, probe.configFlag), choices: null }
  }

  // Claude: an extra --settings source. Codex: per-launch `-c hooks.*`
  // overrides, verified from 0.159. Gemini: a hooks-capable CLI (the hook
  // itself lives in the user's settings, added only on opt-in).
  let threadBridge = base.threadBridge
  if (provider === 'claude' && probe.settingsFlag) threadBridge = hasHelp ? helpHasFlag(help, probe.settingsFlag) : null
  if (provider === 'codex') {
    if (!hasHelp) threadBridge = null
    else if (!helpHasFlag(help, probe.configFlag)) threadBridge = false
    else threadBridge = version ? compareVersions(version, CODEX_THREAD_MIN_VERSION) >= 0 : null
  }
  if (provider === 'gemini') threadBridge = hasHelp ? helpHasSubcommand(help, probe.hooksSubcommand) : null

  return { ...base, models, reasoning, resume, threadBridge }
}

function runProbe(file, args, { spawnImpl = spawn, env = process.env, timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  return new Promise(resolve => {
    let out = ''
    let settled = false
    let child
    let timer = null
    const done = (result) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      try { child?.kill() } catch {}
      resolve(result)
    }
    try {
      child = spawnImpl(file, args, { windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      return done({ ok: false, error: e.message })
    }
    timer = setTimeout(() => done({ ok: false, error: 'timed out', output: out }), timeoutMs)
    const collect = d => { if (out.length < MAX_OUTPUT) out = (out + d).slice(0, MAX_OUTPUT) }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.on('error', e => done({ ok: false, error: e.message }))
    child.on('close', code => done({ ok: code === 0 || out.trim().length > 0, code, output: out }))
  })
}

function binaryStamp(bin, statImpl = statSync) {
  try {
    const st = statImpl(bin)
    return `${bin}|${st.size}|${Math.floor(st.mtimeMs)}`
  } catch {
    return `${bin}|?`
  }
}

// Probe one provider. Dependencies are injectable so tests never spawn CLIs.
export async function probeProvider(provider, deps = {}) {
  const probe = PROVIDER_PROBES[provider]
  if (!probe) return buildCapabilities(provider, { installed: false, error: 'unknown provider' })
  const resolve = deps.resolveExecutable || resolveExecutable
  const bin = resolve(probe.bin)
  if (!bin) return buildCapabilities(provider, { installed: false })

  const spec = deps.shimSpawnSpec || shimSpawnSpec
  const opts = { spawnImpl: deps.spawn, env: deps.env, timeoutMs: deps.timeoutMs }
  const v = spec(bin, ['--version'])
  const h = spec(bin, ['--help'])
  const [versionRun, helpRun] = await Promise.all([runProbe(v.file, v.args, opts), runProbe(h.file, h.args, opts)])
  return buildCapabilities(provider, {
    installed: true,
    version: versionRun.ok ? parseCliVersion(versionRun.output) : null,
    help: helpRun.ok ? helpRun.output : null,
    error: !helpRun.ok ? (helpRun.error || 'help probe failed') : null
  })
}

// Cached registry: one probe per provider per binary stamp.
// `deps.store` ({ read(): object|null, write(obj) }) persists probe results
// across launches. It is keyed by the same binary stamp, so an upgraded CLI is
// still re-probed, but a normal start spawns nothing.
export function createCapabilityCache(deps = {}) {
  const cache = new Map() // provider -> { stamp, caps }
  const inflight = new Map()
  const resolve = deps.resolveExecutable || resolveExecutable
  let hydrated = false

  function hydrate() {
    if (hydrated) return
    hydrated = true
    try {
      const saved = deps.store?.read?.()
      for (const [provider, entry] of Object.entries(saved && typeof saved === 'object' ? saved : {})) {
        if (PROVIDER_PROBES[provider] && entry?.stamp && entry?.caps?.provider === provider) cache.set(provider, entry)
      }
    } catch {}
  }
  function persist() {
    try { deps.store?.write?.(Object.fromEntries(cache)) } catch {}
  }

  async function get(provider, { refresh = false } = {}) {
    hydrate()
    const probe = PROVIDER_PROBES[provider]
    if (!probe) return buildCapabilities(provider, { installed: false, error: 'unknown provider' })
    const bin = resolve(probe.bin)
    const rawStamp = bin ? binaryStamp(bin, deps.statSync) : 'missing'
    // Include Sush's probe schema so capability semantics can evolve (for
    // example adding the Claude same-session Thread bridge) without stale
    // persisted records surviving forever simply because the CLI binary did
    // not change.
    const stamp = `v${CAPABILITY_SCHEMA_VERSION}|${rawStamp}`
    const hit = cache.get(provider)
    if (!refresh && hit && hit.stamp === stamp) return hit.caps
    if (inflight.has(provider)) return inflight.get(provider)
    const job = probeProvider(provider, { ...deps, resolveExecutable: () => bin })
      .then(caps => { cache.set(provider, { stamp, caps }); persist(); return caps })
      .finally(() => inflight.delete(provider))
    inflight.set(provider, job)
    return job
  }

  async function all(options = {}) {
    const providers = Object.keys(PROVIDER_PROBES)
    const results = await Promise.all(providers.map(p => get(p, options)))
    return Object.fromEntries(providers.map((p, i) => [p, results[i]]))
  }

  return { get, all, invalidate: provider => (provider ? cache.delete(provider) : cache.clear()) }
}
