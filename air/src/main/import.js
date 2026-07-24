import { app } from 'electron'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import {
  parseSushrc,
  buildItems,
  expandHome,
  normalizeProfile,
  selectIntoProfile,
  EMPTY_PROFILE
} from './profile'

// ── Import from Sush ────────────────────────────────────────────────────────
//
// Air and Sush are separate applications. They do not share a process, a build,
// a dependency tree or a settings directory, and Air does not require Sush to
// be installed. But a person who has both has already told Sush where they work
// and what they call things, and making them say it twice is just rudeness with
// a justification.
//
// So Air can read Sush's *profile*, once, on request. Three rules govern it:
//
//   1. ALLOWLIST, NOT DENYLIST. The only path this module will ever open is the
//      one named in READABLE below. A new secret file appearing in Sush's
//      settings directory is therefore not-readable by default, rather than
//      readable-until-someone-remembers. Getting this backwards is how an
//      import feature becomes an exfiltration feature.
//
//   2. NOTHING PRIVILEGED, EVER. No licence, no users, no OAuth tokens, no
//      account slots, no secrets store. Not "filtered out afterwards" — never
//      read. Air has no code that could use them and no bridge method that
//      could return them, and this module is where that stays true.
//
//   3. IMPORT IS A COPY, NOT A LINK. What Air imports is written into Air's own
//      settings and never re-read. Uninstall Sush tomorrow and Air is
//      unchanged. A live link would make Air depend on Sush's file format,
//      which is the first step back to being one application.
//
// The parsing and the judgement calls live in ./profile.js, which is pure and
// tested. This file is the IO.

const MAX_FILE_BYTES = 256 * 1024

// Every path Air is allowed to look at, and why.
const READABLE = [
  { id: 'sushrc', path: () => join(homedir(), '.sushrc'), why: 'aliases, env, startup commands, default folder' }
]

// Where Sush keeps its settings, per platform. Air uses this only to report
// "Sush is installed" — it opens no file inside it. That directory holds the
// licence, the user records and the OAuth token store; the honest way to handle
// a directory like that is to not read it.
function sushSettingsDir() {
  const home = homedir()
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Sush')
  }
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Sush')
  }
  return join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'Sush')
}

function readTextCapped(path) {
  try {
    if (!existsSync(path)) return null
    const stat = statSync(path)
    // A .sushrc is a few hundred bytes. A multi-megabyte one is either not a
    // .sushrc or is something being pointed at this reader on purpose, and
    // either way reading it whole into the main process is not worth it.
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function isDirectory(path) {
  try {
    return !!path && existsSync(path) && statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * Look for a Sush profile and describe what could be brought across.
 * Nothing is applied here — this is the "what did you find" half.
 */
export function scanSush() {
  const source = READABLE[0].path()
  const text = readTextCapped(source)
  const parsed = parseSushrc(text)
  const cwd = parsed.settings?.cwd
  const items = buildItems(parsed, { cwdExists: !cwd || isDirectory(expandHome(cwd)) })

  return {
    found: text !== null,
    sushInstalled: existsSync(sushSettingsDir()),
    source,
    // Stated in the UI, so the boundary is visible where the decision is made
    // rather than only in this comment.
    excluded: [
      'licence and plan',
      'user identities',
      'connected accounts',
      'OAuth tokens',
      'saved secrets',
      'session scrollback'
    ],
    items
  }
}

// ── Air's side of the fence ─────────────────────────────────────────────────
//
// Everything above reads Sush. Everything below writes Air, in Air's own
// settings directory, in Air's own format.

function settingsFile() {
  return join(app.getPath('userData'), 'air-profile.json')
}

export function loadProfile() {
  try {
    return normalizeProfile(JSON.parse(readFileSync(settingsFile(), 'utf8')))
  } catch {
    return { ...EMPTY_PROFILE }
  }
}

function writeProfile(profile) {
  try {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(settingsFile(), JSON.stringify(profile, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}

/**
 * Apply a chosen subset of a scan. `keep` is the ids the user left ticked.
 *
 * The scan is re-run here rather than trusting values posted from the renderer.
 */
export function applyImport(keep = []) {
  const profile = selectIntoProfile(scanSush().items, keep)
  profile.importedAt = new Date().toISOString()
  writeProfile(profile)
  return profile
}

export function clearProfile() {
  const empty = { ...EMPTY_PROFILE }
  writeProfile(empty)
  return empty
}

export { aliasCommandsFor } from './profile'
