import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { open, readdir, stat } from 'fs/promises'
import { atomicWriteJson, identityStoragePath } from './secure-storage'
import { listAccounts, slotEnv } from './accounts'
import { createClaudeParser, createCodexParser, parseLine, summarize } from './finance-core.mjs'

// Sush Finance: what the identity's agent sessions are worth at API rates,
// what its plans cost, and where to save. Reads the transcripts Claude Code
// and Codex already write into each account slot's config dir. Nothing
// leaves the machine and nothing new is recorded.

const SCAN_DAYS = 62              // this month plus a full previous one
const CHUNK_BYTES = 4 * 1024 * 1024
const METERED = {
  claude: { envKey: 'CLAUDE_CONFIG_DIR', sub: 'projects', parser: () => createClaudeParser() },
  codex: { envKey: 'CODEX_HOME', sub: 'sessions', parser: (file) => createCodexParser(file) }
}

// This runs in the main process, which also carries every terminal's output,
// so it must never parse a large file in one go. Transcripts are append-only:
// each file keeps its read offset and parser state, and a scan reads only the
// new bytes, in chunks, yielding to the event loop between them.
// file path -> { offset, mtimeMs, parser, records }
const fileCache = new Map()
const yieldToLoop = () => new Promise(resolve => setImmediate(resolve))

async function walkJsonl(dir, since, out = []) {
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) await walkJsonl(full, since, out)
    else if (e.name.endsWith('.jsonl')) {
      try {
        const st = await stat(full)
        if (st.mtimeMs >= since) out.push({ file: full, size: st.size, mtimeMs: st.mtimeMs })
      } catch {}
    }
  }
  return out
}

async function readAppended(file, entry, size) {
  let handle
  try {
    handle = await open(file, 'r')
    let carry = ''
    while (entry.offset < size) {
      const length = Math.min(CHUNK_BYTES, size - entry.offset)
      const buf = Buffer.alloc(length)
      const { bytesRead } = await handle.read(buf, 0, length, entry.offset)
      if (!bytesRead) break
      const text = carry + buf.toString('utf8', 0, bytesRead)
      const lastNl = text.lastIndexOf('\n')
      // Only whole lines are consumed; a line still being written is read
      // again next time.
      const whole = lastNl === -1 ? '' : text.slice(0, lastNl)
      carry = lastNl === -1 ? text : text.slice(lastNl + 1)
      entry.offset += bytesRead
      for (const line of whole.split('\n')) {
        const obj = parseLine(line)
        const rec = obj && entry.parser.line(obj)
        if (rec) entry.records.push(rec)
      }
      await yieldToLoop()
    }
    // A last line with no newline is consumed only if it is a complete JSON
    // object; a line cut mid-write can't parse and is read again next scan.
    const tail = carry && parseLine(carry)
    if (tail) {
      const rec = entry.parser.line(tail)
      if (rec) entry.records.push(rec)
    } else {
      entry.offset -= Buffer.byteLength(carry, 'utf8')
    }
  } catch {
    // Unreadable this time; keep what was read and try again next scan.
  } finally {
    await handle?.close().catch(() => {})
  }
}

async function recordsIn(root, makeParser, since) {
  const files = await walkJsonl(root, since)
  const records = []
  for (const { file, size, mtimeMs } of files) {
    let entry = fileCache.get(file)
    // Shrunk or replaced: start over.
    if (!entry || size < entry.offset) {
      entry = { offset: 0, mtimeMs: 0, parser: makeParser(file), records: [] }
      fileCache.set(file, entry)
    }
    if (size > entry.offset || mtimeMs !== entry.mtimeMs) {
      await readAppended(file, entry, size)
      entry.mtimeMs = mtimeMs
    }
    for (const r of entry.records) if (r.ts >= since) records.push(r)
  }
  return records
}

function settingsFile(userId) {
  return identityStoragePath(app.getPath('userData'), userId, 'finance.json')
}

export function getFinanceSettings(userId) {
  const file = settingsFile(userId)
  try {
    if (file && existsSync(file)) {
      const data = JSON.parse(readFileSync(file, 'utf8'))
      if (data && typeof data === 'object') {
        const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
        return { budgetUsd: Number(data.budgetUsd) > 0 ? Number(data.budgetUsd) : null, plans: obj(data.plans), prices: obj(data.prices) }
      }
    }
  } catch {}
  return { budgetUsd: null, plans: {}, prices: {} }
}

const money = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

// patch: { budgetUsd?, plan?: { key, usd }, price?: { model, input, output, cacheWrite?, cacheRead? } | { model, remove: true } }
export function setFinanceSettings(userId, patch = {}) {
  const file = settingsFile(userId)
  if (!file) return { ok: false, error: 'no-user' }
  const s = getFinanceSettings(userId)
  if ('budgetUsd' in patch) s.budgetUsd = money(patch.budgetUsd)
  if (patch.plan) {
    if (!/^[a-z]+:[\w-]{1,64}$/.test(String(patch.plan.key || ''))) return { ok: false, error: 'Unknown account' }
    const usd = money(patch.plan.usd)
    if (usd == null) delete s.plans[patch.plan.key]
    else s.plans[patch.plan.key] = usd
  }
  if (patch.price) {
    const model = String(patch.price.model || '').toLowerCase().trim()
    if (!/^[\w.@[\]:/-]{2,80}$/.test(model)) return { ok: false, error: 'That model name has characters Sush does not accept' }
    if (patch.price.remove) delete s.prices[model]
    else {
      const p = {}
      for (const k of ['input', 'output', 'cacheWrite', 'cacheRead']) {
        const n = Number(patch.price[k])
        if (Number.isFinite(n) && n >= 0 && n < 10000) p[k] = n
      }
      if (p.input == null || p.output == null) return { ok: false, error: 'Input and output prices are required' }
      s.prices[model] = p
    }
  }
  try { atomicWriteJson(file, s) } catch (e) { return { ok: false, error: e.message } }
  return { ok: true, settings: s }
}

// baseEnv: the identity's environment without slot overlays (the default
// slot's config dirs).
export async function financeSummary(userId, baseEnv, now = Date.now()) {
  if (!userId) return { ok: false, error: 'no-user' }
  const list = listAccounts(userId)
  if (!list?.ok) return { ok: false, error: list?.error || 'accounts' }
  const since = now - SCAN_DAYS * 864e5
  const accounts = []
  for (const [provider, spec] of Object.entries(METERED)) {
    const st = list.providers?.[provider]
    for (const slot of st?.slots || []) {
      const env = slot.id === 'default' ? baseEnv : { ...baseEnv, ...slotEnv(userId, provider, slot.id) }
      const dir = env?.[spec.envKey]
      const records = dir ? await recordsIn(join(dir, spec.sub), spec.parser, since) : []
      accounts.push({ provider, slotId: slot.id, label: `${provider === 'claude' ? 'Claude' : 'Codex'} · ${slot.label}`, records, lastLimitAt: slot.lastLimitAt, usageHistory: slot.usageHistory })
    }
  }
  const settings = getFinanceSettings(userId)
  return { ok: true, settings, unmetered: ['gemini', 'opencode', 'grok'], ...summarize(accounts, settings, now) }
}
