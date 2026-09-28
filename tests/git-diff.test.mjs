import { describe, expect, it } from 'vitest'
import { MAX_DIFF_CHARS, clipDiff, diffArgs, safeRelativePath } from '../src/main/git-diff.js'

describe('git diff path safety', () => {
  it('accepts ordinary repo-relative paths', () => {
    expect(safeRelativePath('src/App.jsx')).toBe('src/App.jsx')
    expect(safeRelativePath('src\\main\\ipc.js')).toBe('src/main/ipc.js')
    expect(safeRelativePath('a b/c.txt')).toBe('a b/c.txt')
  })

  it('rejects traversal, absolute paths, option-shaped and malformed input', () => {
    for (const bad of ['../secret', 'a/../../b', '/etc/passwd', 'C:/Windows/x', 'C:\\x', '--output=/tmp/x', '-p', '', 'a\0b', null, undefined, 42, {}]) {
      expect(safeRelativePath(bad), String(bad)).toBeNull()
    }
    expect(safeRelativePath('x'.repeat(2000))).toBeNull()
  })

  it('always separates the path with --', () => {
    expect(diffArgs({ path: 'a.js' })).toEqual(['diff', '--no-color', '--', 'a.js'])
    expect(diffArgs({ path: 'a.js', staged: true })).toEqual(['diff', '--cached', '--no-color', '--', 'a.js'])
    expect(diffArgs({ path: 'new.js', untracked: true, nullDevice: 'NUL' })).toEqual(['diff', '--no-index', '--no-color', '--', 'NUL', 'new.js'])
    expect(diffArgs({ path: '../x' })).toBeNull()
  })

  it('clips large diffs and says so', () => {
    expect(clipDiff('small')).toEqual({ diff: 'small', truncated: false })
    const big = clipDiff('x'.repeat(MAX_DIFF_CHARS + 10))
    expect(big.truncated).toBe(true)
    expect(big.diff).toHaveLength(MAX_DIFF_CHARS)
  })
})
