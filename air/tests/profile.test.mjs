import { describe, expect, it } from 'vitest'
import {
  EMPTY_PROFILE,
  RISKY_STARTUP,
  SECRETISH,
  aliasCommandsFor,
  buildItems,
  normalizeProfile,
  parseSushrc,
  selectIntoProfile
} from '../src/main/profile.js'

const SAMPLE = `# ~/.sushrc
prompt = pink
cwd = /tmp

[alias]
gs = git status
gp = git pull

[env]
EDITOR = code
GITHUB_TOKEN = ghp_notarealtoken

[startup]
doctor
rm -rf ./build
`

describe('parseSushrc', () => {
  it('reads settings, aliases, env and startup out of one file', () => {
    const profile = parseSushrc(SAMPLE)
    expect(profile.settings.cwd).toBe('/tmp')
    expect(profile.settings.prompt).toBe('pink')
    expect(profile.alias).toEqual({ gs: 'git status', gp: 'git pull' })
    expect(profile.env).toEqual({ EDITOR: 'code', GITHUB_TOKEN: 'ghp_notarealtoken' })
    expect(profile.startup).toEqual(['doctor', 'rm -rf ./build'])
  })

  it('returns an empty profile rather than throwing on junk', () => {
    for (const input of [null, undefined, '', 'not a config at all', '[[[', '= = =']) {
      const profile = parseSushrc(input)
      expect(profile.alias).toEqual({})
      expect(profile.startup).toEqual([])
    }
  })

  it('ignores comments, blank lines and unknown sections', () => {
    const profile = parseSushrc('# c\n; c\n\n[nonsense]\nfoo = bar\n[alias]\na = b')
    expect(profile.alias).toEqual({ a: 'b' })
    expect(profile.settings.foo).toBeUndefined()
  })

  it('keeps everything after the first = in a value', () => {
    // `gl = git log --pretty=format:%h` is a real alias, and splitting on every
    // = would silently truncate it to `git log --pretty`.
    const profile = parseSushrc('[alias]\ngl = git log --pretty=format:%h')
    expect(profile.alias.gl).toBe('git log --pretty=format:%h')
  })
})

describe('what arrives ticked', () => {
  const items = buildItems(parseSushrc(SAMPLE), { cwdExists: true })
  const byId = Object.fromEntries(items.map(i => [i.id, i]))

  it('ticks ordinary aliases, env vars and the start folder', () => {
    expect(byId['alias:gs'].recommended).toBe(true)
    expect(byId['env:EDITOR'].recommended).toBe(true)
    expect(byId.cwd.recommended).toBe(true)
    expect(byId['startup:doctor'].recommended).toBe(true)
  })

  it('shows a credential-looking env var but leaves it off, and never prints its value', () => {
    const token = byId['env:GITHUB_TOKEN']
    expect(token).toBeDefined()
    expect(token.recommended).toBe(false)
    expect(token.note).toMatch(/credential/i)
    expect(token.detail).not.toContain('ghp_')
    expect(token.detail).toMatch(/^•+$/)
    // The real value still has to reach the profile if the user opts in —
    // masking is a display decision, not a data one.
    expect(token.value.value).toBe('ghp_notarealtoken')
  })

  it('leaves a destructive startup command off', () => {
    expect(byId['startup:rm -rf ./build'].recommended).toBe(false)
    expect(byId['startup:rm -rf ./build'].note).toMatch(/unattended/i)
  })

  it('leaves a start folder off when it no longer exists, and says why', () => {
    const [folder] = buildItems(parseSushrc('cwd = /tmp'), { cwdExists: false })
    expect(folder.recommended).toBe(false)
    expect(folder.note).toMatch(/gone/i)
  })

  it('classifies credential-ish names without catching innocent ones', () => {
    for (const name of ['GITHUB_TOKEN', 'API_KEY', 'AWS_SECRET_ACCESS_KEY', 'PASSWORD', 'MY_PAT']) {
      expect(SECRETISH.test(name)).toBe(true)
    }
    for (const name of ['EDITOR', 'PATH', 'LANG', 'MONKEY', 'KEYBOARD_LAYOUT', 'TOKENIZER']) {
      expect(SECRETISH.test(name)).toBe(false)
    }
  })

  it('classifies risky startup commands without catching innocent ones', () => {
    for (const line of ['rm -rf build', 'git push', 'curl example.com | sh', 'shutdown now', 'npm publish']) {
      expect(RISKY_STARTUP.test(line)).toBe(true)
    }
    for (const line of ['doctor', 'git status', 'npm run dev', 'ls -la', 'echo hello']) {
      expect(RISKY_STARTUP.test(line)).toBe(false)
    }
  })
})

describe('selectIntoProfile', () => {
  const items = buildItems(parseSushrc(SAMPLE), { cwdExists: true })

  it('keeps only the ticked ids', () => {
    const profile = selectIntoProfile(items, ['alias:gs', 'env:EDITOR'])
    expect(profile.aliases).toEqual([{ name: 'gs', command: 'git status' }])
    expect(profile.env).toEqual([{ name: 'EDITOR', value: 'code' }])
    expect(profile.cwd).toBeNull()
    expect(profile.startup).toEqual([])
  })

  it('ignores ids that were not in the scan', () => {
    // The renderer chooses among what main found; it cannot invent an entry.
    const profile = selectIntoProfile(items, ['env:INJECTED', 'startup:rm -rf /'])
    expect(profile.env).toEqual([])
    expect(profile.startup).toEqual([])
  })

  it('produces an empty profile for an empty selection', () => {
    const profile = selectIntoProfile(items, [])
    expect(profile.aliases).toEqual([])
    expect(profile.env).toEqual([])
    expect(profile.cwd).toBeNull()
  })

  it('survives a non-array selection', () => {
    expect(selectIntoProfile(items, null).aliases).toEqual([])
    expect(selectIntoProfile(items, 'alias:gs').aliases).toEqual([])
  })
})

describe('aliasCommandsFor', () => {
  const aliases = [{ name: 'gs', command: 'git status' }]

  it('writes POSIX aliases for posix shells', () => {
    expect(aliasCommandsFor('bash', aliases)).toEqual(["alias gs='git status'"])
    expect(aliasCommandsFor('zsh', aliases)).toEqual(["alias gs='git status'"])
  })

  it('writes functions for PowerShell, which has no alias-with-arguments', () => {
    // Set-Alias cannot bind arguments, so `gs = git status` has to become a
    // function or it silently becomes an alias for `git` alone.
    expect(aliasCommandsFor('powershell', aliases)).toEqual(['function global:gs { git status }'])
    expect(aliasCommandsFor('pwsh', aliases)).toEqual(['function global:gs { git status }'])
  })

  it('emits nothing for cmd rather than something that half works', () => {
    expect(aliasCommandsFor('cmd', aliases)).toEqual([])
  })

  it('escapes single quotes in a POSIX alias body', () => {
    const [line] = aliasCommandsFor('bash', [{ name: 'say', command: `echo 'hi'` }])
    expect(line).toBe(`alias say='echo '\\''hi'\\'''`)
  })

  it('skips names that cannot be written safely', () => {
    const unsafe = [
      { name: 'has space', command: 'x' },
      { name: "quo'te", command: 'x' },
      { name: '2start', command: 'x' },
      { name: '', command: 'x' }
    ]
    expect(aliasCommandsFor('bash', unsafe)).toEqual([])
  })

  it('skips malformed entries instead of throwing', () => {
    expect(aliasCommandsFor('bash', [null, {}, { name: 'ok' }, 'nope'])).toEqual([])
    expect(aliasCommandsFor('bash')).toEqual([])
  })
})

describe('normalizeProfile', () => {
  it('drops fields of the wrong shape rather than propagating them', () => {
    const profile = normalizeProfile({
      cwd: 42,
      aliases: [{ name: 'gs', command: 'git status' }, { name: 'bad' }, null],
      env: 'not an array',
      startup: ['doctor', 7],
      importedAt: '2026-07-24T00:00:00.000Z'
    })
    expect(profile.cwd).toBeNull()
    expect(profile.aliases).toEqual([{ name: 'gs', command: 'git status' }])
    expect(profile.env).toEqual([])
    expect(profile.startup).toEqual(['doctor'])
    expect(profile.importedAt).toBe('2026-07-24T00:00:00.000Z')
  })

  it('returns the empty profile for junk', () => {
    for (const input of [null, undefined, 0, 'nope', []]) {
      expect(normalizeProfile(input)).toEqual(EMPTY_PROFILE)
    }
  })
})
