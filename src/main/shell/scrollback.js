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
        const entries = [...this.saved.entries()].slice(-40)
        for (const [k, v] of entries) obj[k] = v
        this.saved = new Map(entries)
        writeFileSync(this.file, JSON.stringify(obj), 'utf8')
      } catch {}
    }, 1500)
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
