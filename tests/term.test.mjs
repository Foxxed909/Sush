import { describe, it, expect } from 'vitest'

describe('Sush Terminal', () => {
  it('builds safe agent commands with model, prompt and resume', async () => {
    const { commandFor } = await import('../term/src/agents.mjs')
    expect(commandFor('claude', { model: 'claude-opus-5-5', prompt: 'fix the bug' })).toEqual(['claude', '--model', 'claude-opus-5-5', 'fix the bug'])
    expect(commandFor('opencode', { model: 'opencode/big-pickle', prompt: 'hi' })).toEqual(['opencode', '-m', 'opencode/big-pickle', '--prompt', 'hi'])
    expect(commandFor('codex', { resume: true })).toEqual(['codex', 'resume', '--last'])
    expect(commandFor('gemini', { prompt: 'x' })).toEqual(['gemini', '-i', 'x'])
    // A flag-shaped "model" is dropped, never passed through.
    expect(commandFor('claude', { model: '--dangerously-skip-permissions' })).toEqual(['claude'])
    expect(commandFor('nope', {})).toBeNull()
  })

  it('shares the desktop model catalog', async () => {
    const { modelsFor } = await import('../term/src/agents.mjs')
    const { MODEL_OPTIONS } = await import('../src/renderer/src/lib/modelCatalog.mjs')
    expect(modelsFor('claude').map(m => m.label)).toEqual(MODEL_OPTIONS.claude.map(o => o.label))
    expect(modelsFor('opencode').some(m => m.badge === 'Free')).toBe(true)
  })

  it('renders the pink home screen inside the terminal size', async () => {
    const { render, TAGLINE } = await import('../term/src/app.mjs')
    const { stripAnsi, width } = await import('../term/src/ansi.mjs')
    const st = { agent: 'claude', models: {}, input: 'refactor auth', installed: { claude: { installed: true } }, cwd: '/tmp/x' }
    for (const [cols, rows] of [[80, 24], [120, 40], [50, 20]]) {
      const lines = render(st, cols, rows).split('\n')
      expect(lines.length).toBeLessThanOrEqual(rows)
      expect(Math.max(...lines.map(l => width(l)))).toBeLessThanOrEqual(cols)
      const text = stripAnsi(lines.join('\n'))
      expect(text).toContain(TAGLINE)
      expect(text).toContain('refactor auth')
      expect(text).toContain('Claude Code')
    }
  })

  it('handles keys: tab cycles agents, ctrl+t picks a model, history recalls', async () => {
    const { reduce, keyName } = await import('../term/src/app.mjs')
    let st = { agent: 'claude', models: {}, input: '', history: ['old prompt'], histIdx: -1, overlay: null, cursor: 0 }
    st = reduce(st, 'tab'); expect(st.agent).toBe('codex')
    st = reduce(st, 'shift+tab'); expect(st.agent).toBe('claude')
    st = reduce(st, 'ctrl+t'); expect(st.overlay).toBe('models')
    st = reduce(st, 'down'); st = reduce(st, 'enter')
    expect(st.models.claude).toBe('claude-opus-5-5')
    st = reduce(st, 'up'); expect(st.input).toBe('old prompt')
    st = reduce(st, 'ctrl+u'); expect(st.input).toBe('')
    expect(keyName('\x1b[Z')).toBe('shift+tab')
    expect(keyName('hello\nworld')).toBe('hello world')
  })

  it('parses CLI arguments', async () => {
    const { parseArgs } = await import('../term/bin/sush.mjs')
    expect(parseArgs(['run', 'claude', '--model', 'opus', 'do', 'it'])).toMatchObject({ cmd: 'run', rest: ['claude', 'do', 'it'], model: 'opus' })
    expect(parseArgs(['--version'])).toMatchObject({ cmd: null, version: true })
    expect(parseArgs([])).toMatchObject({ cmd: null })
  })
})
