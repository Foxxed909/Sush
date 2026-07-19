import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd() },
  shell: { openPath: vi.fn(async () => '') }
}))

vi.mock('systeminformation', () => ({ default: {} }))

import { buildToolCommand, toolExtensions } from '../src/main/commands/tools.js'
import { canLaunchEditorDirectly, doctorToolsForPlatform } from '../src/main/commands/workspace.js'
import { parseLinuxSs, parseMacLsof, parseWindowsNetstat } from '../src/main/commands/system.js'
import { detectManagers } from '../src/main/commands/dev.js'
import { buildCdPassthrough, expandFsPath } from '../src/main/commands/fs.js'
import { ShellContext } from '../src/main/shell/context.js'
import { executableFromCommand } from '../src/renderer/src/hooks/useCliAvailability.js'
import { parseGitPorcelainZ } from '../src/main/git-porcelain.js'
import {
  defaultProfilesForPlatform,
  normalizeProfilesForPlatform,
  shellOptionsForPlatform
} from '../src/renderer/src/components/ProfileManager.jsx'

const tempDirs = []
afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop(), { recursive: true, force: true })
})

describe('bundled tool portability', () => {
  it('offers only platform-runnable script types', () => {
    expect(toolExtensions('win32')).toEqual(['.py', '.ps1', '.bat', '.exe'])
    expect(toolExtensions('linux')).toEqual(['.sh', '.py'])
    expect(toolExtensions('darwin')).toEqual(['.sh', '.py'])
    expect(toolExtensions('linux')).not.toContain('.bat')
  })

  it('runs Unix shell tools through sh even when the file is not executable', () => {
    const cmd = buildToolCommand(
      { path: '/opt/sush/tools/hello.sh', ext: '.sh' },
      ['James'],
      { platform: 'linux', findExecutable: name => name === 'sh' ? '/bin/sh' : null }
    )
    expect(cmd).toEqual({ file: '/bin/sh', args: ['/opt/sush/tools/hello.sh', 'James'] })
  })

  it('prefers python3, falls back to python, and reports a missing runtime', () => {
    const preferred = buildToolCommand(
      { path: '/tools/check.py', ext: '.py' },
      [],
      { findExecutable: name => name === 'python3' ? '/usr/bin/python3' : null }
    )
    expect(preferred.file).toBe('/usr/bin/python3')

    const fallback = buildToolCommand(
      { path: '/tools/check.py', ext: '.py' },
      [],
      { findExecutable: name => name === 'python' ? '/usr/bin/python' : null }
    )
    expect(fallback.file).toBe('/usr/bin/python')

    const missing = buildToolCommand(
      { path: '/tools/check.py', ext: '.py' },
      [],
      { findExecutable: () => null }
    )
    expect(missing.error).toMatch(/Python 3.*not found/i)
  })
})

describe('safe editor launch selection', () => {
  it('never routes a user path through a Windows command shim', () => {
    expect(canLaunchEditorDirectly('C:\\Users\\J\\bin\\code.cmd', 'win32')).toBe(false)
    expect(canLaunchEditorDirectly('C:\\Program Files\\Microsoft VS Code\\Code.exe', 'win32')).toBe(true)
    expect(canLaunchEditorDirectly('/usr/bin/code', 'linux')).toBe(true)
  })
})

describe('listening-port fixtures', () => {
  it('parses Windows netstat ownership', () => {
    const rows = parseWindowsNetstat('  TCP    127.0.0.1:5173    0.0.0.0:0    LISTENING    4321\r\n')
    expect(rows).toEqual([{ port: '5173', address: '127.0.0.1:5173', pid: '4321' }])
  })

  it('parses Linux ss ownership', () => {
    const rows = parseLinuxSs('LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=1234,fd=20))\n')
    expect(rows).toEqual([{ port: '3000', address: '127.0.0.1:3000', pid: '1234' }])
  })

  it('parses macOS lsof process records, including IPv6 endpoints', () => {
    const rows = parseMacLsof([
      'p222',
      'PTCP',
      'n127.0.0.1:5173',
      'p333',
      'PTCP',
      'n[::1]:8080'
    ].join('\n'))
    expect(rows).toEqual([
      { port: '5173', address: '127.0.0.1', pid: '222' },
      { port: '8080', address: '[::1]', pid: '333' }
    ])
  })
})

describe('git porcelain parsing', () => {
  it('preserves literal paths and consumes rename source records', () => {
    const output = [
      ' M file with spaces.txt',
      '?? quote"and-newline\n.txt',
      'R  renamed target.txt',
      'old name.txt',
      ''
    ].join('\0')
    expect(parseGitPorcelainZ(output)).toEqual([
      { status: 'M', rawStatus: ' M', path: 'file with spaces.txt' },
      { status: '??', rawStatus: '??', path: 'quote"and-newline\n.txt' },
      { status: 'R', rawStatus: 'R ', path: 'renamed target.txt' }
    ])
  })
})

describe('package-manager selection', () => {
  it('does not pretend Chocolatey exists on macOS or Linux', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sush-pkg-'))
    tempDirs.push(dir)
    expect(detectManagers(dir, 'linux')).toEqual([])
    expect(detectManagers(dir, 'darwin')).toEqual([])
    expect(detectManagers(dir, 'win32')).toEqual(['choco'])
  })

  it('still detects project-local managers before platform fallbacks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sush-pkg-'))
    tempDirs.push(dir)
    writeFileSync(join(dir, 'package.json'), '{}')
    expect(detectManagers(dir, 'linux')).toEqual(['npm'])
  })
})

describe('shell-aware cd', () => {
  it('expands home paths consistently', () => {
    const home = join(tmpdir(), 'james')
    const cwd = join(tmpdir(), 'work')
    expect(expandFsPath('~', cwd, home)).toBe(home)
    expect(expandFsPath('~/sush', cwd, home)).toBe(join(home, 'sush'))
  })

  it('emits syntax for the live shell', () => {
    expect(buildCdPassthrough('C:\\Users\\James Foxx', 'cmd', 'win32'))
      .toBe('cd /d "C:\\Users\\James Foxx"')
    expect(buildCdPassthrough('C:\\Users\\James Foxx', 'powershell', 'win32'))
      .toBe("Set-Location -LiteralPath 'C:\\Users\\James Foxx'")
    expect(buildCdPassthrough("/home/james/it's", 'bash', 'linux'))
      .toBe("cd '/home/james/it'\\''s'")
  })

  it('keeps the shell id on command contexts', () => {
    expect(new ShellContext({ cwd: '/tmp', tabId: 't', shellId: 'cmd' }).shellId).toBe('cmd')
  })
})

describe('custom-agent executable parsing', () => {
  it('keeps quoted executable paths intact', () => {
    expect(executableFromCommand('"C:\\Program Files\\Aider\\aider.exe" --yes'))
      .toBe('C:\\Program Files\\Aider\\aider.exe')
    expect(executableFromCommand("'/Applications/My CLI/bin/tool' run"))
      .toBe('/Applications/My CLI/bin/tool')
    expect(executableFromCommand('claude --continue')).toBe('claude')
  })
})

describe('platform-specific profiles and doctor checks', () => {
  it('offers native shell choices and defaults per OS', () => {
    expect(shellOptionsForPlatform('win32').map(x => x.id)).toEqual(['powershell', 'pwsh', 'cmd'])
    expect(shellOptionsForPlatform('darwin').map(x => x.id)).toEqual(['zsh', 'bash'])
    expect(shellOptionsForPlatform('linux').map(x => x.id)).toEqual(['bash', 'zsh', 'sh'])
    expect(defaultProfilesForPlatform('darwin')[0].shell).toBe('zsh')
    expect(defaultProfilesForPlatform('linux')[0].shell).toBe('bash')
  })

  it('preserves saved profiles whose shell came from another OS', () => {
    const saved = [{ id: 'work', label: 'My PowerShell', shell: 'powershell', themeId: 'pink' }]
    expect(normalizeProfilesForPlatform(saved, 'linux')[0]).toMatchObject(saved[0])
  })

  it('checks shells that are relevant to the host platform', () => {
    expect(doctorToolsForPlatform('win32')).toContain('cmd.exe')
    expect(doctorToolsForPlatform('darwin', '/bin/zsh')).toEqual(expect.arrayContaining(['zsh', 'bash', 'sh']))
    expect(doctorToolsForPlatform('linux', '/bin/bash')).not.toContain('powershell.exe')
  })
})

// ── Review-cycle regressions (4.11.0) ────────────────────────────────────────
import { parseInput } from '../src/main/shell/parser.js'

describe('parser quoting regressions', () => {
  it('treats a mid-word apostrophe as a literal character', () => {
    expect(parseInput("note it's done")).toEqual({ cmd: 'note', args: ["it's", 'done'] })
  })

  it('still honours quotes that open at token start', () => {
    expect(parseInput('note "a  b" c')).toEqual({ cmd: 'note', args: ['a  b', 'c'] })
  })
})

describe('alias expansion preserves the argument tail verbatim', () => {
  it('does not collapse spacing inside quoted args', () => {
    const ctx = new ShellContext({ cwd: 'C:\\', tabId: 't1' })
    ctx.aliases = { n: 'note' }
    expect(ctx.expandAliases('n "a  b"')).toBe('note "a  b"')
  })
})

describe('localized netstat parsing', () => {
  it('finds listeners without the English LISTENING word', () => {
    const rows = parseWindowsNetstat('  TCP    0.0.0.0:5173    0.0.0.0:0    ABHOEREN    4321\r\n')
    expect(rows).toEqual([{ port: '5173', address: '0.0.0.0:5173', pid: '4321' }])
  })

  it('skips established connections', () => {
    const rows = parseWindowsNetstat('  TCP    127.0.0.1:5173    127.0.0.1:60000    HERGESTELLT    4321\r\n')
    expect(rows).toEqual([])
  })
})

describe('Sush Air profile', () => {
  it('composes eco + no motion + solid material, and restores exactly', async () => {
    const { isAir, withAir, perfModeOf } = await import('../src/renderer/src/lib/power.js')
    const before = { perfMode: 'reduced', reduceMotion: false, windowMaterial: 'mica', themeId: 'pink' }
    const on = withAir(before, true)
    expect(isAir(on)).toBe(true)
    expect(perfModeOf(on)).toBe('eco')
    expect(on.reduceMotion).toBe(true)
    expect(on.windowMaterial).toBe('solid')
    const off = withAir(on, false)
    expect(isAir(off)).toBe(false)
    expect(perfModeOf(off)).toBe('reduced')
    expect(off.reduceMotion).toBe(false)
    expect(off.windowMaterial).toBe('mica')
    expect(off.themeId).toBe('pink')
    expect(off.airRestore).toBeUndefined()
  })

  it('is idempotent and safe without a stored restore', async () => {
    const { withAir, perfModeOf } = await import('../src/renderer/src/lib/power.js')
    const on = withAir(withAir({}, true), true)
    expect(on.airRestore.perfMode).toBe('full')
    const off = withAir({ sushAir: true }, false)
    expect(perfModeOf(off)).toBe('full')
  })
})

describe('.bat tool hardening', () => {
  it('refuses cmd metacharacters in .bat args', () => {
    const cmd = buildToolCommand({ path: 'C:\\TOOLS\\x.bat', ext: '.bat' }, ['a&calc'], { platform: 'win32' })
    expect(cmd.error).toBeTruthy()
  })

  it('routes clean .bat runs through cmd /c without a shell', () => {
    const cmd = buildToolCommand({ path: 'C:\\TOOLS\\x.bat', ext: '.bat' }, ['ok'], { platform: 'win32' })
    expect(cmd).toEqual({ file: 'cmd', args: ['/c', 'C:\\TOOLS\\x.bat', 'ok'] })
  })
})
