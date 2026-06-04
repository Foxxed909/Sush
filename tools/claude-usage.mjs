#!/usr/bin/env node
/*
 * claude-usage.mjs — "see the limit" tool.
 *
 * Aggregates token usage from local Claude Code session transcripts
 * (~/.claude/projects/<encoded-cwd>/*.jsonl) so Claude (or you) can check how
 * much has been consumed and roughly how close we are to a usage limit.
 *
 * Usage:
 *   node tools/claude-usage.mjs                 # full summary
 *   node tools/claude-usage.mjs --window 5      # rolling-window hours (default 5)
 *   node tools/claude-usage.mjs --limit 2000000 # token budget for the % bar
 *   node tools/claude-usage.mjs --json          # machine-readable output
 *
 * Claude Code limits reset on a rolling ~5-hour block plus a weekly cap, so the
 * 5h window total is the number that matters most for "am I about to be cut off".
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const args = process.argv.slice(2)
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? true) : def
}
const WINDOW_H = Number(flag('window', 5))
const LIMIT = flag('limit', null) ? Number(flag('limit', null)) : null
const AS_JSON = args.includes('--json')

// Rough Opus 4.x per-Mtok pricing (USD) for a cost estimate only.
const PRICE = { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 }

const ROOT = join(homedir(), '.claude', 'projects')

function walk(dir, out = []) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (e.name.endsWith('.jsonl')) out.push(full)
  }
  return out
}

function blankBucket() {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, requests: 0 }
}
function add(bucket, u) {
  bucket.input += u.input_tokens || 0
  bucket.output += u.output_tokens || 0
  bucket.cacheWrite += u.cache_creation_input_tokens || 0
  bucket.cacheRead += u.cache_read_input_tokens || 0
  bucket.requests += 1
}
function total(b) { return b.input + b.output + b.cacheWrite + b.cacheRead }
function cost(b) {
  return (b.input * PRICE.input + b.output * PRICE.output +
    b.cacheWrite * PRICE.cacheWrite + b.cacheRead * PRICE.cacheRead) / 1_000_000
}

const now = Date.now()
const windowStart = now - WINDOW_H * 3600 * 1000
const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
const weekStart = now - 7 * 24 * 3600 * 1000

const allTime = blankBucket()
const window = blankBucket()
const today = blankBucket()
const week = blankBucket()
const byDay = new Map()
const byModel = new Map()
const seen = new Set() // de-dupe identical message ids across resumed sessions

const files = walk(ROOT)
for (const file of files) {
  let text
  try { text = readFileSync(file, 'utf8') } catch { continue }
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue
    let obj
    try { obj = JSON.parse(line) } catch { continue }
    const msg = obj.message || obj
    const u = msg.usage
    if (!u || typeof u !== 'object') continue
    // Skip duplicates that appear when a session is resumed/branched.
    const id = msg.id || obj.requestId
    if (id) { if (seen.has(id)) continue; seen.add(id) }

    const ts = Date.parse(obj.timestamp || msg.timestamp || '') || now
    add(allTime, u)
    if (ts >= windowStart) add(window, u)
    if (ts >= dayStart.getTime()) add(today, u)
    if (ts >= weekStart) add(week, u)

    const dayKey = new Date(ts).toISOString().slice(0, 10)
    if (!byDay.has(dayKey)) byDay.set(dayKey, blankBucket())
    add(byDay.get(dayKey), u)

    const model = msg.model || 'unknown'
    if (!byModel.has(model)) byModel.set(model, blankBucket())
    add(byModel.get(model), u)
  }
}

const fmt = (n) => n.toLocaleString('en-US')
const fmtK = (n) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
const usd = (n) => `$${n.toFixed(2)}`

if (AS_JSON) {
  const out = {
    generatedAt: new Date(now).toISOString(),
    windowHours: WINDOW_H,
    limit: LIMIT,
    allTime, window, today, week,
    byModel: Object.fromEntries(byModel),
    byDay: Object.fromEntries(byDay),
    files: files.length
  }
  console.log(JSON.stringify(out, null, 2))
  process.exit(0)
}

function bar(value, max, width = 28) {
  if (!max || max <= 0) return ''
  const pct = Math.min(1, value / max)
  const filled = Math.round(pct * width)
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${(pct * 100).toFixed(1)}%`
}

function block(title, b) {
  console.log(`\n${title}`)
  console.log(`  requests   ${fmt(b.requests)}`)
  console.log(`  input      ${fmt(b.input)}`)
  console.log(`  output     ${fmt(b.output)}`)
  console.log(`  cache w/r  ${fmt(b.cacheWrite)} / ${fmt(b.cacheRead)}`)
  console.log(`  TOTAL      ${fmt(total(b))}  (~${usd(cost(b))})`)
}

console.log('═══════════════════════════════════════════════')
console.log(' Claude Code usage  ·  ' + new Date(now).toLocaleString())
console.log(' transcripts scanned: ' + files.length)
console.log('═══════════════════════════════════════════════')

console.log(`\n▶ ROLLING ${WINDOW_H}h WINDOW  (the limit that bites first)`)
console.log(`  total tokens  ${fmt(total(window))}  ·  output ${fmt(window.output)}  ·  ${fmt(window.requests)} reqs`)
if (LIMIT) console.log(`  ${bar(total(window), LIMIT)}  of ${fmtK(LIMIT)} budget`)
console.log(`  est. spend    ~${usd(cost(window))}`)

block('▶ TODAY', today)
block('▶ LAST 7 DAYS', week)
block('▶ ALL TIME', allTime)

console.log('\n▶ LAST 7 DAYS BY DAY')
const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7)
for (const [d, b] of days) {
  console.log(`  ${d}   ${fmtK(total(b)).padStart(7)}  (${fmt(b.requests)} reqs, ~${usd(cost(b))})`)
}

console.log('\n▶ BY MODEL (all time)')
for (const [m, b] of [...byModel.entries()].sort((a, b) => total(b[1]) - total(a[1]))) {
  console.log(`  ${m.padEnd(26)} ${fmtK(total(b)).padStart(7)}`)
}
console.log('')
