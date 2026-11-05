import { mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

// The shared crew registry. Every agent Sush Terminal starts writes a small
// record here; the desktop app writes desktop.json (its sessions + usage).
// Both sides read the whole folder, so the terminal and the app see one crew.
// Records hold no prompts' secrets beyond the first line, and never tokens.

export function crewDir(env = process.env) {
  return env.SUSH_CREW_DIR || join(env.HOME || env.USERPROFILE || homedir(), '.sush', 'crew')
}

export function newId() { return `t-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}` }

function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, file)
}

export function register(rec, env = process.env) {
  const dir = crewDir(env)
  mkdirSync(dir, { recursive: true })
  const full = { source: 'terminal', startedAt: Date.now(), ...rec }
  writeAtomic(join(dir, `${full.id}.json`), full)
  return full
}

export function update(id, patch, env = process.env) {
  const file = join(crewDir(env), `${id}.json`)
  try {
    const cur = JSON.parse(readFileSync(file, 'utf8'))
    writeAtomic(file, { ...cur, ...patch })
  } catch {}
}

export function pidAlive(pid) {
  if (!pid) return false
  try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}

// Terminal records, newest first. Records whose process died without saying
// so are marked ended; ended ones older than a day are swept.
export function listTerminal({ env = process.env, now = Date.now(), alive = pidAlive } = {}) {
  const dir = crewDir(env)
  let names = []
  try { names = readdirSync(dir) } catch { return [] }
  const out = []
  for (const name of names) {
    if (!name.endsWith('.json') || name === 'desktop.json') continue
    const file = join(dir, name)
    let rec
    try { rec = JSON.parse(readFileSync(file, 'utf8')) } catch { continue }
    if (!rec?.id) continue
    if (!rec.endedAt && rec.pid && !alive(rec.pid) && !(rec.wrapperPid && alive(rec.wrapperPid))) rec.endedAt = now
    if (rec.endedAt && now - rec.endedAt > 24 * 3600e3) { try { unlinkSync(file) } catch {} continue }
    out.push(rec)
  }
  return out.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
}

// What the desktop app published: { updatedAt, sessions: [...], usage: [...] }.
// Stale after 30s (the app writes every few seconds while open).
export function readDesktop({ env = process.env, now = Date.now() } = {}) {
  try {
    const data = JSON.parse(readFileSync(join(crewDir(env), 'desktop.json'), 'utf8'))
    if (!data?.updatedAt || now - data.updatedAt > 30e3) return null
    return data
  } catch { return null }
}

export function writeDesktop(data, env = process.env) {
  const dir = crewDir(env)
  mkdirSync(dir, { recursive: true })
  writeAtomic(join(dir, 'desktop.json'), { ...data, updatedAt: Date.now() })
}
