import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

// Per-session scrollback persistence. The renderer assigns each session a stable
// `restoreKey` (profile:shell:cwd). We keep a capped, ANSI-stripped tail of each
// session's output in memory while it runs, and persist it to disk keyed by
// restoreKey so reopening the same workspace can replay recent history. Plain
// text (no control sequences) is stored so a replay can never corrupt the new
// session's cursor state.

const MAX_CHARS = 60_000          // per-session cap held in memory
const RESTORE_CHARS = 6_000       // how much we replay on reopen
const HANDOFF_CHARS = 2_400       // how much a handoff card grabs
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[<-?]/g

function stripAnsi(value) {
  return String(value ?? '').replace(ANSI, '')
}

export class ScrollbackStore {
  constructor(userDataDir) {
    this.file = join(userDataDir, 'sush-scrollback.json')
    this.live = new Map()   // tabId -> { key, text }
    this.saved = new Map()  // restoreKey -> text
    this._writeTimer = null
    try {
      if (!existsSync(userDataDir)) mkdirSync(userDataDir, { recursive: true })
      if (existsSync(this.file)) {
        const data = JSON.parse(readFileSync(this.file, 'utf8'))
        for (const [k, v] of Object.entries(data || {})) this.saved.set(k, String(v))
      }
    } catch {}
  }

  attach(tabId, restoreKey) {
    this.live.set(tabId, { key: restoreKey || null, text: '' })
  }

  append(tabId, data) {
    const entry = this.live.get(tabId)
    if (!entry) return
    entry.text += stripAnsi(data)
    if (entry.text.length > MAX_CHARS) entry.text = entry.text.slice(-MAX_CHARS)
  }

  // The text to replay when a session with this restoreKey boots (or null).
  restoreFor(restoreKey) {
    if (!restoreKey) return null
    const text = this.saved.get(restoreKey)
    if (!text) return null
    return text.slice(-RESTORE_CHARS).trimStart()
  }

  // ANSI-stripped recent output of a live session (for handoff cards).
  tail(tabId, chars = HANDOFF_CHARS) {
    const entry = this.live.get(tabId)
    if (!entry) return ''
    return entry.text.slice(-chars).trimStart()
  }

  // Persist a session's buffer under its restoreKey, then drop the live entry.
  persist(tabId) {
    const entry = this.live.get(tabId)
    this.live.delete(tabId)
    if (!entry || !entry.key || !entry.text.trim()) return
    // Delete-then-set moves the key to the end of the Map's insertion order,
    // so the slice(-40) cap in the writers evicts least-recently-USED
    // workspaces. A plain set() left re-persisted keys at their original
    // position — heavy users lost their most-used workspace history first.
    this.saved.delete(entry.key)
    this.saved.set(entry.key, entry.text.slice(-MAX_CHARS))
    this._scheduleWrite()
  }

  _scheduleWrite() {
    if (this._writeTimer) return
    this._writeTimer = setTimeout(() => {
      this._writeTimer = null
      try {
        const obj = {}
        // Cap how many workspaces we remember so the file can't grow unbounded.
        // Slice only for the on-disk snapshot — don't mutate this.saved so that
        // entries added after the timer was scheduled are never lost.
        const entries = [...this.saved.entries()].slice(-40)
        for (const [k, v] of entries) obj[k] = v
        writeFileSync(this.file, JSON.stringify(obj), 'utf8')
      } catch {}
    }, 1500)
  }

  // Search session buffers for a term (case-insensitive, plain text). Returns
  // [{ tabId?, key?, saved?, lines: [{ line, text }] }] — line numbers are
  // relative to the kept tail, matches capped so a chatty session can't flood
  // the caller. Powers the `hunt` command.
  //
  // Live sessions are always searched. With `includeSaved` (default on), the
  // persisted per-workspace scrollback of CLOSED sessions is searched too, so
  // `hunt` can find something a session you already closed printed — those
  // entries carry `saved: true` and their restoreKey instead of a live tabId.
  search(term, { maxPerSession = 8, includeSaved = true } = {}) {
    const q = String(term ?? '').trim().toLowerCase()
    if (!q) return []
    const scan = (text) => {
      const lines = String(text).split('\n')
      const hits = []
      for (let i = 0; i < lines.length && hits.length < maxPerSession; i++) {
        if (lines[i].toLowerCase().includes(q)) {
          hits.push({ line: i + 1, text: lines[i].trim().slice(0, 200) })
        }
      }
      return hits
    }

    const out = []
    const liveKeys = new Set()
    for (const [tabId, entry] of this.live) {
      if (entry?.key) liveKeys.add(entry.key)
      if (!entry?.text) continue
      const hits = scan(entry.text)
      if (hits.length) out.push({ tabId, lines: hits })
    }

    if (includeSaved) {
      for (const [key, text] of this.saved) {
        // Skip a saved buffer whose workspace is currently open live — the live
        // entry already covers it and is fresher.
        if (!text || liveKeys.has(key)) continue
        const hits = scan(text)
        if (hits.length) out.push({ key, saved: true, lines: hits })
      }
    }
    return out
  }

  flush() {
    for (const tabId of [...this.live.keys()]) this.persist(tabId)
    if (this._writeTimer) { clearTimeout(this._writeTimer); this._writeTimer = null }
    try {
      const obj = {}
      for (const [k, v] of [...this.saved.entries()].slice(-40)) obj[k] = v
      writeFileSync(this.file, JSON.stringify(obj), 'utf8')
    } catch {}
  }
}
