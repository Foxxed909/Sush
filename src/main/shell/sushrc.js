import { homedir } from 'os'
import { join, resolve } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { getActiveUser, userHomeDir } from '../users'

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

function sharedSushrcPath() {
  return join(homedir(), '.sushrc')
}

export function sushrcPath() {
  const active = getActiveUser()
  return active ? join(userHomeDir(active.id), '.sushrc') : sharedSushrcPath()
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

function readProfileAt(file) {
  try {
    if (!existsSync(file)) return { ...parseSushrc(''), exists: false, path: file }
    const text = readFileSync(file, 'utf8')
    return { ...parseSushrc(text), exists: true, path: file, raw: text }
  } catch (err) {
    return { ...parseSushrc(''), exists: false, path: file, error: err.message }
  }
}

// Existing Sush installs had one shared profile. Let an identity inherit it
// until it saves a profile-local .sushrc, so adding profile isolation never
// makes established aliases silently disappear.
function readHomeProfile() {
  const file = sushrcPath()
  const own = readProfileAt(file)
  const shared = sharedSushrcPath()
  if (own.exists || file === shared) return own
  const inherited = readProfileAt(shared)
  return inherited.exists ? { ...inherited, path: file, inheritedFrom: shared } : own
}

// Merge a project profile OVER a base (home) profile. Aliases/env/settings are
// key-wise overrides (project wins); startup commands concatenate (home first,
// then project) so a repo can add boot steps without losing the user's.
function mergeProfiles(base, over) {
  return {
    settings: { ...base.settings, ...over.settings },
    alias: { ...base.alias, ...over.alias },
    env: { ...base.env, ...over.env },
    startup: [...(base.startup || []), ...(over.startup || [])]
  }
}

// Read + parse the user's .sushrc (returns an empty profile if none exists).
// A project `.sushrc` is untrusted and ignored by default. Hosts can deliberately
// opt in with SUSH_TRUST_PROJECT_RC=1, at which point it is layered on top of the
// home profile. The home file stays the one the in-app editor reads and writes.
export function projectRcTrusted(env = process.env) {
  return env?.SUSH_TRUST_PROJECT_RC === '1'
}

export function loadSushrc(cwd, { trustProject = projectRcTrusted() } = {}) {
  const home = readHomeProfile()
  const dir = cwd && String(cwd).trim()
  if (!dir) return home

  // Never treat the home file as a "project" file when cwd === ~.
  if (resolve(dir) === resolve(homedir())) return home

  // A repository is untrusted input. Applying its env and startup commands on
  // open would make cloning + opening a repo equivalent to executing it. Hosts
  // that deliberately want the legacy behavior can opt in before launching Sush.
  if (!trustProject) return home

  const projectFile = join(dir, '.sushrc')
  const project = readProfileAt(projectFile)
  if (!project.exists) return home

  const merged = mergeProfiles(home, project)
  return {
    ...merged,
    exists: true,
    path: home.path,
    projectPath: project.path,
    projectApplied: true,
    raw: home.raw
  }
}

export function readSushrcRaw() {
  const file = sushrcPath()
  try {
    const profile = readHomeProfile()
    return {
      ok: true,
      path: file,
      exists: existsSync(file),
      inheritedFrom: profile.inheritedFrom,
      content: profile.raw || DEFAULT_SUSHRC
    }
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
