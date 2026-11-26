import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { readFile, readdir, stat } from 'fs/promises'
import { atomicWriteJson, identityStoragePath } from './secure-storage'
import { listAccounts, slotEnv } from './accounts'
import { parseClaudeTranscript, parseCodexRollout, summarize } from './finance-core.mjs'

// Sush Finance: what the identity's agent sessions are worth at API rates,
// what its plans cost, and where to save. Reads the transcripts Claude Code
// and Codex already write into each account slot's config dir. Nothing
// leaves the machine and nothing new is recorded.

const SCAN_DAYS = 62              // this month plus a full previous one
const MAX_FILE_BYTES = 64 * 1024 * 1024
const METERED = {
  claude: { envKey: 'CLAUDE_CONFIG_DIR', sub: 'projects', parse: (text) => parseClaudeTranscript(text) },
  codex: { envKey: 'CODEX_HOME', sub: 'sessions', parse: (text, file) => parseCodexRollout(text, file) }
}

// file path -> { sig, records }. Transcripts are append-only, so a file whose
// size and mtime are unchanged needs no re-read.
const fileCache = new Map()

async function walkJsonl(dir, since, out = []) {
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) await walkJsonl(full, since, out)
    else if (e.name.endsWith('.jsonl')) {
      try {
        const st = await stat(full)
        if (st.mtimeMs >= since && st.size <= MAX_FILE_BYTES) out.push({ file: full, sig: `${st.size}:${st.mtimeMs}` })
      } catch {}
    }
  }
  return out
}

async function recordsIn(root, parse, since) {
  const files = await walkJsonl(root, since)
  const records = []
  for (const { file, sig } of files) {
    let hit = fileCache.get(file)
    if (!hit || hit.sig !== sig) {
      let text = ''
      try { text = await readFile(file, 'utf8') } catch { continue }
      hit = { sig, records: parse(text, file) }
      fileCache.set(file, hit)
    }
    for (const r of hit.records) if (r.ts >= since) records.push(r)
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
      if (data && typeof data === 'object') return { budgetUsd: null, plans: {}, prices: {}, ...data }
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
  if (patch.plan && /^[a-z]+:[\w-]{1,64}$/.test(String(patch.plan.key || ''))) {
    const usd = money(patch.plan.usd)
    if (usd == null) delete s.plans[patch.plan.key]
    else s.plans[patch.plan.key] = usd
  }
  if (patch.price && /^[\w.@[\]-]{2,80}$/.test(String(patch.price.model || ''))) {
    const model = patch.price.model.toLowerCase()
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
      const records = dir ? await recordsIn(join(dir, spec.sub), spec.parse, since) : []
      accounts.push({ provider, slotId: slot.id, label: `${provider === 'claude' ? 'Claude' : 'Codex'} · ${slot.label}`, records, lastLimitAt: slot.lastLimitAt, usageHistory: slot.usageHistory })
    }
  }
  const settings = getFinanceSettings(userId)
  return { ok: true, settings, unmetered: ['gemini', 'opencode', 'grok'], ...summarize(accounts, settings, now) }
}
