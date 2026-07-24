import { homedir } from 'os'
import { join } from 'path'

// The pure half of "import from Sush": parsing, classification, and turning an
// alias into shell syntax. No electron, no fs — which is the point. Everything
// here is a function from text to a decision, so the decisions are testable
// without booting an app, and import.js is left holding only the IO.
//
// The judgement calls in this file (what counts as a credential, what counts as
// a risky startup command) are the part most likely to be wrong for someone's
// particular setup, so they are the part that most needs a test to pin them.

// Names that usually hold a credential. An env var matching this is still
// *shown* — hiding it would be worse, because then you would not know Sush had
// it — but it arrives unticked and labelled, so carrying a token into a second
// application is always a decision rather than a default.
export const SECRETISH = /(^|_)(TOKEN|KEY|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|APIKEY|PAT|SESSION)(_|$)/i

// Commands that should not run unattended when a terminal opens. A startup list
// is a convenience in Sush, where you chose it deliberately; replaying one in a
// different application on first launch is a surprise, and a surprise that can
// delete something is a bug. These arrive unticked.
export const RISKY_STARTUP = /\b(rm|rmdir|del|rd|format|mkfs|dd|shutdown|reboot|kill|pkill|taskkill|curl|wget|iwr|invoke-webrequest)\b|\bnpm\s+publish\b|\bgit\s+push\b/i

/**
 * A tolerant parse of Sush's .sushrc format:
 *
 *   prompt = pink            top-level settings
 *   cwd = ~/Coderoom
 *   [alias]                  sections
 *   gs = git status
 *   [env]
 *   EDITOR = code
 *   [startup]                one command per line
 *   doctor
 *
 * Deliberately its own implementation rather than an import from Sush: if Sush
 * changes its parser, Air should keep reading the files that exist on disk
 * today, not inherit a change it did not ask for. Unknown sections are ignored,
 * malformed lines are skipped, and this never throws.
 */
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
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (!key) continue

    if (section === 'alias') profile.alias[key] = value
    else if (section === 'env') profile.env[key] = value
    else if (section === 'settings') profile.settings[key] = value
  }
  return profile
}

export function expandHome(value) {
  const v = String(value ?? '').trim()
  if (v === '~') return homedir()
  if (v.startsWith('~/') || v.startsWith('~\\')) return join(homedir(), v.slice(2))
  return v
}

/**
 * Turn a parsed .sushrc into the list the import sheet renders.
 *
 * `cwdExists` is passed in rather than checked here so this stays pure — the
 * caller has already touched the filesystem and knows the answer.
 */
export function buildItems(profile, { cwdExists = true } = {}) {
  const items = []

  const cwd = expandHome(profile.settings?.cwd)
  if (cwd) {
    items.push({
      id: 'cwd',
      group: 'folder',
      label: 'Start here',
      detail: cwd,
      // A default folder that no longer exists would make every new session
      // silently open somewhere else. Show it, explain it, don't tick it.
      recommended: cwdExists,
      note: cwdExists ? null : 'That folder is gone — Air would fall back to your home directory.',
      value: cwd
    })
  }

  for (const [name, command] of Object.entries(profile.alias ?? {})) {
    items.push({
      id: `alias:${name}`,
      group: 'alias',
      label: name,
      detail: command,
      recommended: true,
      note: null,
      value: { name, command }
    })
  }

  for (const [name, value] of Object.entries(profile.env ?? {})) {
    const secretish = SECRETISH.test(name)
    items.push({
      id: `env:${name}`,
      group: 'env',
      label: name,
      // Never render a suspected credential's value. The sheet is a screenshot
      // away from a chat window.
      detail: secretish ? '•'.repeat(Math.min(12, String(value).length || 4)) : String(value),
      recommended: !secretish,
      note: secretish ? 'Looks like a credential. Air can carry it, but it will not ask to.' : null,
      value: { name, value: String(value) }
    })
  }

  for (const command of profile.startup ?? []) {
    const risky = RISKY_STARTUP.test(command)
    items.push({
      id: `startup:${command}`,
      group: 'startup',
      label: command,
      detail: 'runs when a session opens',
      recommended: !risky,
      note: risky ? 'Runs unattended on every new session. Left off unless you say otherwise.' : null,
      value: command
    })
  }

  return items
}

/**
 * Aliases are the one imported thing Air cannot own directly: Air does not
 * parse your command line, by design — "a line starting with `:` is Air's,
 * everything else is your shell's". So an imported alias is handed to the shell
 * in the shell's own syntax and becomes a real alias, not an Air feature
 * pretending to be one. `type gs` will tell you the truth afterwards.
 */
export function aliasCommandsFor(shellId, aliases = []) {
  const lines = []
  for (const entry of aliases) {
    const name = entry?.name
    const command = entry?.command
    if (typeof name !== 'string' || typeof command !== 'string') continue
    // A name with whitespace or a quote in it cannot be written safely in
    // either syntax, and nothing in Sush produces one. Skip rather than escape.
    if (!/^[A-Za-z_][\w-]*$/.test(name)) continue
    // cmd.exe has no per-session alias mechanism worth using (doskey does not
    // survive into child processes and macros are a different thing). Silently
    // producing something that half-works would be worse than producing nothing.
    if (shellId === 'cmd') continue
    if (shellId === 'powershell' || shellId === 'pwsh') {
      lines.push(`function global:${name} { ${command} }`)
    } else {
      // POSIX single-quote escaping: end the quote, emit an escaped quote,
      // reopen. The only sequence that survives inside single quotes.
      lines.push(`alias ${name}='${command.replace(/'/g, `'\\''`)}'`)
    }
  }
  return lines
}

/**
 * Shape-check a stored profile. A hand-edited or half-written air-profile.json
 * must degrade to the default, not throw on the way to spawning a shell —
 * losing your imported aliases is a bad morning, and a terminal that will not
 * open is a worse one.
 */
export function normalizeProfile(parsed) {
  return {
    cwd: typeof parsed?.cwd === 'string' ? parsed.cwd : null,
    aliases: Array.isArray(parsed?.aliases)
      ? parsed.aliases.filter(a => typeof a?.name === 'string' && typeof a?.command === 'string')
      : [],
    env: Array.isArray(parsed?.env)
      ? parsed.env.filter(e => typeof e?.name === 'string' && typeof e?.value === 'string')
      : [],
    startup: Array.isArray(parsed?.startup) ? parsed.startup.filter(s => typeof s === 'string') : [],
    importedAt: typeof parsed?.importedAt === 'string' ? parsed.importedAt : null
  }
}

export const EMPTY_PROFILE = { cwd: null, aliases: [], env: [], startup: [], importedAt: null }

/**
 * Fold the ticked ids of a scan into a stored profile.
 *
 * The caller passes the freshly-scanned items, not ids-plus-values from the
 * renderer: the renderer can choose *among* what was found on disk, but it
 * cannot invent an env var or a startup command and have it written to a file.
 */
export function selectIntoProfile(items, keep) {
  const wanted = new Set((Array.isArray(keep) ? keep : []).map(String))
  const profile = { ...EMPTY_PROFILE, aliases: [], env: [], startup: [] }
  for (const item of items) {
    if (!wanted.has(item.id)) continue
    if (item.group === 'folder') profile.cwd = item.value
    else if (item.group === 'alias') profile.aliases.push(item.value)
    else if (item.group === 'env') profile.env.push(item.value)
    else if (item.group === 'startup') profile.startup.push(item.value)
  }
  return profile
}
