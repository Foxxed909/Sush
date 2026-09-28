import { describe, expect, it } from 'vitest'
import { buildContextBundle, clipContextText, CONTEXT_BUNDLE_LIMITS } from '../src/renderer/src/lib/contextBundle.js'

describe('context bundle', () => {
  it('keeps project, checkout and live cwd distinct', () => {
    const text = buildContextBundle({
      projectRoot: '/repo',
      checkoutRoot: '/repo/.sush-worktrees/review',
      liveCwd: '/repo/.sush-worktrees/review/src',
      provider: 'Claude Code',
      model: 'sonnet',
      effort: 'high',
      account: 'Work'
    })
    expect(text).toContain('- Project root: /repo')
    expect(text).toContain('- Checkout: /repo/.sush-worktrees/review')
    expect(text).toContain('- Live cwd: /repo/.sush-worktrees/review/src')
    expect(text).toContain('- Provider: Claude Code')
    expect(text).toContain('- Model: sonnet')
    expect(text).toContain('- Reasoning: high')
    expect(text).toContain('- Account: Work')
  })

  it('bounds files, docs and terminal output', () => {
    const files = Array.from({ length: CONTEXT_BUNDLE_LIMITS.changedFiles + 4 }, (_, i) => ({ status: 'M', path: `file-${i}.js` }))
    const docs = Array.from({ length: CONTEXT_BUNDLE_LIMITS.docs + 2 }, (_, i) => ({ name: `DOC-${i}.md`, content: 'x'.repeat(CONTEXT_BUNDLE_LIMITS.docChars + 50) }))
    const text = buildContextBundle({
      projectRoot: '/repo',
      git: { repo: true, branch: 'main', files },
      docs,
      tail: 't'.repeat(CONTEXT_BUNDLE_LIMITS.tailChars + 50)
    })
    expect(text).toContain(`+4 more`)
    expect(text).toContain('DOC-0.md')
    expect(text).not.toContain(`DOC-${CONTEXT_BUNDLE_LIMITS.docs}.md`)
    expect(text).toContain('…')
    expect(text.length).toBeLessThan(20000)
  })

  it('records handoff lineage without claiming model context', () => {
    const text = buildContextBundle({
      projectRoot: '/repo',
      lineage: {
        from: { label: 'Claude' },
        sourceAlive: false,
        to: [{ label: 'Codex' }]
      }
    })
    expect(text).toContain('Continued from: Claude (closed)')
    expect(text).toContain('Handed off to: Codex')
    expect(text).toContain('does not imply that every source above is loaded into the provider model context window')
  })

  it('normalizes CRs and clips cleanly', () => {
    expect(clipContextText('a\r\nb', 20)).toBe('a\nb')
    expect(clipContextText('abcdef', 4)).toBe('abcd…')
  })
})
