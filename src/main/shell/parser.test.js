import { describe, it, expect } from 'vitest'
import { parseInput } from './parser.js'

describe('parseInput', () => {
  it('returns null for empty/whitespace-only input', () => {
    expect(parseInput('')).toBeNull()
    expect(parseInput('   ')).toBeNull()
    expect(parseInput(null)).toBeNull()
  })

  it('splits a command and its args', () => {
    expect(parseInput('git status')).toEqual({ cmd: 'git', args: ['status'] })
    expect(parseInput('npm run dev')).toEqual({ cmd: 'npm', args: ['run', 'dev'] })
  })

  it('respects double and single quotes', () => {
    expect(parseInput('echo "hello world"')).toEqual({ cmd: 'echo', args: ['hello world'] })
    expect(parseInput("git commit -m 'fix: bug'")).toEqual({
      cmd: 'git',
      args: ['commit', '-m', 'fix: bug']
    })
  })

  it('preserves the original casing of the command', () => {
    expect(parseInput('Get-ChildItem')).toEqual({ cmd: 'Get-ChildItem', args: [] })
    expect(parseInput('Python script.py')).toEqual({ cmd: 'Python', args: ['script.py'] })
  })

  it('collapses runs of spaces between tokens', () => {
    expect(parseInput('ls    -la')).toEqual({ cmd: 'ls', args: ['-la'] })
  })
})
