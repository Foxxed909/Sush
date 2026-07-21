import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import { countersAfterTabs } from '../src/renderer/src/lib/sessionIds.js'
import { isGitFileStaged } from '../src/renderer/src/lib/gitStatus.js'
import { canHandleGlobalShortcut } from '../src/renderer/src/lib/shortcutGuard.js'
import { isSensitiveCommand, redactSensitiveCommand } from '../src/renderer/src/lib/commandPrivacy.js'
import { dismissCommand, pickCandidate, recordCommand } from '../src/renderer/src/lib/commandFrequency.js'
import { quoteShellPath } from '../src/renderer/src/lib/shellQuote.js'
import { buildSshCommand, normalizeSshPort, normalizeSshProfiles } from '../src/renderer/src/lib/ssh.js'
import { parseStoredObject } from '../src/renderer/src/lib/storage.js'
import { unquoteEnvValue } from '../src/renderer/src/lib/env.js'
import { CHANGELOG, LATEST_VERSION } from '../src/renderer/src/lib/changelog.js'
import { terminalInputAllowed, terminalInputTargets } from '../src/renderer/src/lib/terminalInput.js'

afterEach(() => vi.unstubAllGlobals())

describe('release metadata', () => {
  it('keeps the latest changelog entry aligned with the packaged app version', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    expect(LATEST_VERSION).toBe(pkg.version)
    expect(CHANGELOG[0].v).toBe(pkg.version)
  })
})

describe('terminal input routing', () => {
  it('blocks every protected-input route except Ctrl+C and dedupes broadcast recipients', () => {
    expect(terminalInputAllowed(true, 'paste this')).toBe(false)
    expect(terminalInputAllowed(true, '\x03')).toBe(true)
    expect(terminalInputAllowed(false, 'paste this')).toBe(true)
    expect(terminalInputTargets('active', ['peer', 'active', 'peer'])).toEqual(['active', 'peer'])
  })
})

describe('restored session counters', () => {
  it('continues after the largest restored ID in each namespace', () => {
    expect(countersAfterTabs([
      { id: 'tab-4', tag: 'sess-12', groupId: 'grp-3' },
      { id: 'tab-9', tag: 'sess-2', groupId: 'grp-8' }
    ])).toEqual({ tab: 10, sessionTag: 13, group: 9 })
  })

  it('ignores unrelated and malformed identifiers', () => {
    expect(countersAfterTabs([
      { id: 'other-99', tag: 'sess-nope', groupId: 'grp-0' },
      { id: 'tab-2x', tag: 'group-add', groupId: null }
    ])).toEqual({ tab: 1, sessionTag: 1, group: 1 })
  })
})

describe('git porcelain staging state', () => {
  it.each([
    ['M ', true],
    ['A ', true],
    ['MM', true],
    [' M', false],
    ['??', false],
    ['!!', false]
  ])('classifies %s as staged=%s', (rawStatus, expected) => {
    expect(isGitFileStaged({ rawStatus })).toBe(expected)
  })
})

describe('global shortcut guard', () => {
  it('requires a ready identity and no blocking surface', () => {
    expect(canHandleGlobalShortcut(true, false)).toBe(true)
    expect(canHandleGlobalShortcut(false, false)).toBe(false)
    expect(canHandleGlobalShortcut(true, true)).toBe(false)
  })
})

describe('command privacy', () => {
  it('recognizes and redacts built-ins whose arguments contain credentials', () => {
    expect(isSensitiveCommand('secrets set OPENAI_KEY sk-live')).toBe(true)
    expect(isSensitiveCommand('jwt ey.header.signature')).toBe(true)
    expect(redactSensitiveCommand('secrets set OPENAI_KEY sk-live')).toBe('secrets set OPENAI_KEY <redacted>')
    expect(redactSensitiveCommand('jwt ey.header.signature')).toBe('jwt <redacted>')
    expect(isSensitiveCommand('git status')).toBe(false)
  })

  it('scrubs legacy frequency records and never writes new sensitive entries', () => {
    const values = new Map([
      ['sush.cmdfreq.v1', JSON.stringify({
        'secrets set TOKEN plaintext': { count: 99, last: Date.now() },
        'jwt header.payload.signature': { count: 99, last: Date.now() },
        'git status --short': { count: 20, last: Date.now() }
      })],
      ['sush.cmdfreq.dismissed.v1', JSON.stringify({ 'jwt old.token.value': true })]
    ])
    vi.stubGlobal('localStorage', {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value))
    })

    expect(pickCandidate()).toMatchObject({ command: 'git status --short', count: 20 })
    recordCommand('secrets set NEW_TOKEN plaintext')
    dismissCommand('jwt another.token.value')

    const combined = [...values.values()].join('\n')
    expect(combined).not.toContain('plaintext')
    expect(combined).not.toContain('header.payload.signature')
    expect(combined).not.toContain('another.token.value')
  })

  it('recovers when the frequency store contains valid non-object JSON', () => {
    const values = new Map([
      ['sush.cmdfreq.v1', '"corrupt"'],
      ['sush.cmdfreq.dismissed.v1', '[]']
    ])
    vi.stubGlobal('localStorage', {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value))
    })

    expect(() => recordCommand('git status --short')).not.toThrow()
    expect(() => dismissCommand('npm run build')).not.toThrow()
    expect(JSON.parse(values.get('sush.cmdfreq.v1'))).toMatchObject({
      'git status --short': { count: 1 }
    })
  })
})

describe('dropped path quoting', () => {
  it('prevents POSIX command substitution and handles embedded quotes', () => {
    expect(quoteShellPath('/tmp/$(touch owned)', { platform: 'linux', shellId: 'bash' }))
      .toBe("'/tmp/$(touch owned)'")
    expect(quoteShellPath("/tmp/it's here", { platform: 'darwin', shellId: 'zsh' }))
      .toBe("'/tmp/it'\\''s here'")
  })

  it('uses native literal forms on Windows shells', () => {
    expect(quoteShellPath("C:\\Users\\O'Brien\\a & b", { platform: 'win32', shellId: 'powershell' }))
      .toBe("'C:\\Users\\O''Brien\\a & b'")
    expect(quoteShellPath('C:\\a & b', { platform: 'win32', shellId: 'cmd' }))
      .toBe('"C:\\a & b"')
  })
})

describe('SSH quick-connect commands', () => {
  it('quotes every user-controlled argument for the launch shell', () => {
    const profile = {
      user: 'dev',
      host: 'example.com; Write-Output owned',
      port: '2222',
      keyPath: "C:\\Users\\O'Brien\\my key"
    }
    expect(buildSshCommand(profile, { platform: 'win32', shellId: 'powershell' }))
      .toBe("ssh -p 2222 -i 'C:\\Users\\O''Brien\\my key' -- 'dev@example.com; Write-Output owned'")
    expect(buildSshCommand({ host: 'example.com & calc' }, { platform: 'win32', shellId: 'cmd' }))
      .toBe('ssh -- "example.com & calc"')
    expect(buildSshCommand({ host: 'example.com" & calc & "' }, { platform: 'win32', shellId: 'cmd' }))
      .toBeNull()
    expect(buildSshCommand({ host: '$(touch owned)' }, { platform: 'linux', shellId: 'bash' }))
      .toBe("ssh -- '$(touch owned)'")
  })

  it('rejects invalid ports and non-array persisted data', () => {
    expect(normalizeSshPort('2222; calc')).toBeNull()
    expect(normalizeSshPort('65536')).toBeNull()
    expect(buildSshCommand({ host: 'example.com', port: '22; calc' })).toBeNull()
    expect(normalizeSshProfiles({ host: 'example.com' })).toEqual([])
    expect(normalizeSshProfiles([null, {}, { host: 'bad.example', port: '22; calc' }, { host: 'example.com', port: '' }]))
      .toEqual([expect.objectContaining({ host: 'example.com', port: '22' })])
  })
})

describe('object-backed local storage', () => {
  it('rejects valid JSON values that cannot safely hold settings or sessions', () => {
    expect(parseStoredObject('{"themeId":"pink"}')).toEqual({ themeId: 'pink' })
    expect(parseStoredObject('null')).toEqual({})
    expect(parseStoredObject('[]')).toEqual({})
    expect(parseStoredObject('not json')).toEqual({})
  })
})

describe('.env value parsing', () => {
  it('removes matching quotes without crashing the environment panel', () => {
    expect(unquoteEnvValue(' "secret value" ')).toBe('secret value')
    expect(unquoteEnvValue("'literal value'")).toBe('literal value')
    expect(unquoteEnvValue('plain')).toBe('plain')
  })
})
