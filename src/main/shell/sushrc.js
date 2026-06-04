import { homedir } from 'os'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'

// The .sushrc is Sush's own shell-agnostic profile. It is a small declarative
// INI-like file that Sush parses and applies to whichever underlying shell a tab
// runs (PowerShell / cmd / pwsh / bash). Format:
//
//   # comment
//   prompt = pink              top-level key
//   cwd = ~/Coderoom
//
//   [alias]                    section
//   gs = git status
//   dev = npm run dev
//
//   [env]
//   EDITOR = code
//
//   [startup]                  one command per line (run when a session boots)
//   doctor
//   git status

export function sushrcPath() {
  return join(homedir(), '.sushrc')
}

export const DEFAULT_SUSHRC = `# ~/.sushrc — your Sush profile (applies to every shell)
# Top-level settings
prompt = pink
# cwd = ~/Coderoom

[alias]
gs = git status
gp = git pull
dev = npm run dev

[env]
EDITOR = code

[startup]
# commands that run automatically when a new session boots
# doctor
`

function expandHome(value) {
  const v = String(value ?? '').trim()
  if (v === '~') return homedir()
  if (v.startsWith('~/') || v.startsWith('~\\')) return join(homedir(), v.slice(2))
  return v
}

// Parse .sushrc text into a structured profile. Tolerant: unknown sections are
// ignored, malformed lines are skipped, never throws.
export function parseSushrc(text) {
  const profile = { settings: {}, alias: {}, env: {}, startup: [] }
  if (!text) return profile

  let section = 'settings'
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue

    const sectionMatch = line.match(/^\[(.+?)\]$/)
    if (sectionMatch) {
      section = sectionMatch[1].trim().toLowerCase()
      continue
    }

    if (section === 'startup') {
      profile.startup.push(line)
      continue
    }

    const eq = line.indexOf('=')
    if (eq < 0) {
      // A bare line in alias/env without '=' is ignored; in settings it's noise.
      continue
    }
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (!key) continue

    if (section === 'alias') profile.alias[key] = value
    else if (section === 'env') profile.env[key] = value
    else profile.settings[key] = value
  }

  if (profile.settings.cwd) profile.settings.cwd = expandHome(profile.settings.cwd)
  return profile
}

// Read + parse the user's .sushrc (returns an empty profile if none exists).
export function loadSushrc() {
  const file = sushrcPath()
  try {
    if (!existsSync(file)) return { ...parseSushrc(''), exists: false, path: file }
    const text = readFileSync(file, 'utf8')
    return { ...parseSushrc(text), exists: true, path: file, raw: text }
  } catch (err) {
    return { ...parseSushrc(''), exists: false, path: file, error: err.message }
  }
}

export function readSushrcRaw() {
  const file = sushrcPath()
  try {
    return { ok: true, path: file, exists: existsSync(file), content: existsSync(file) ? readFileSync(file, 'utf8') : DEFAULT_SUSHRC }
  } catch (err) {
    return { ok: false, path: file, exists: false, content: DEFAULT_SUSHRC, error: err.message }
  }
}

export function writeSushrcRaw(content) {
  const file = sushrcPath()
  try {
    writeFileSync(file, String(content ?? ''), 'utf8')
    return { ok: true, path: file }
  } catch (err) {
    return { ok: false, path: file, error: err.message }
  }
}
