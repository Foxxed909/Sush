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

describe('Sush Terminal crew features', () => {
  it('reads a Claude log: working while fresh, needs-you when it spoke last, waiting on a stalled tool', async () => {
    const { claudeItems, stateFromItems, claudeSlug } = await import('../term/src/transcripts.mjs')
    expect(claudeSlug('/home/a/my.app')).toBe('-home-a-my-app')
    const rows = [
      { type: 'user', message: { content: 'fix it' } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn' } }
    ]
    const now = 1_000_000
    expect(stateFromItems(claudeItems(rows), now - 2000, now)).toBe('working')
    expect(stateFromItems(claudeItems(rows), now - 60000, now)).toBe('waiting')
    const stalled = [...rows, { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x', name: 'Bash', input: {} }] } }]
    expect(stateFromItems(claudeItems(stalled), now - 60000, now)).toBe('waiting')
  })

  it('writes a hand-off brief with the ask, progress and files', async () => {
    const { handoffBrief } = await import('../term/src/transcripts.mjs')
    const brief = handoffBrief('Claude Code', '/p', [
      { role: 'user', text: 'Add login' }, { role: 'tool', tool: 'Edit', file: '/p/a.js' }, { role: 'assistant', text: 'Login works.' }
    ])
    expect(brief).toContain('from Claude Code in /p')
    expect(brief).toContain('- Add login')
    expect(brief).toContain('Login works.')
    expect(brief).toContain('- /p/a.js')
  })

  it('board merges terminal and desktop sessions, needs-you first, with a usage runway', async () => {
    const { gather, renderBoard, transitions } = await import('../term/src/board.mjs')
    const { stripAnsi } = await import('../term/src/ansi.mjs')
    const now = 10_000_000
    const data = gather({
      cwd: '/p', now,
      terminal: [{ id: 't1', agent: 'claude', label: 'Claude Code', cwd: '/p', startedAt: now - 60e3 }, { id: 't2', agent: 'opencode', cwd: '/elsewhere', startedAt: now }],
      desktop: { sessions: [{ id: 'd1', label: 'Codex Review', agentId: 'codex', cwd: '/p/sub', state: 'working' }], usage: [{ provider: 'claude', label: 'Work', pct: 70, guardPct: 80, samples: [0, 5, 10].map(m => ({ t: now - (10 - m) * 60e3, pct: 60 + m })) }] },
      insight: () => ({ state: 'waiting', lastText: 'Your turn' })
    })
    expect(data.rows.map(r => r.id)).toEqual(['t1', 'd:d1'])
    expect(data.usage[0].runway).toBe(10)
    const text = stripAnsi(renderBoard(data, { cols: 100, rows: 30, cwd: '/p', now }))
    expect(text).toContain('Needs you')
    expect(text).toContain('sush handoff')
    expect(transitions(new Map([['t1', 'working']]), data.rows).map(r => r.id)).toEqual(['t1'])
  })

  it('plans a crew: tmux inside, new tmux session, or nothing to split with', async () => {
    const { parseCrew, planCrew } = await import('../term/src/crewcmd.mjs')
    const spec = parseCrew(['claude', 'codex', '--model', 'codex=gpt-6.1-sol', 'fix', 'the', 'test', '--board', '--dry-run'])
    expect(spec).toMatchObject({ agents: ['claude', 'codex'], models: { codex: 'gpt-6.1-sol' }, prompt: 'fix the test', board: true })
    expect(planCrew(spec, { env: { TMUX: '1' } }).kind).toBe('tmux-inside')
    expect(planCrew(spec, { env: {}, have: () => true }).kind).toBe('tmux-new')
    const none = planCrew(spec, { env: {}, have: () => false, platform: 'linux' })
    expect(none.kind).toBe('none')
    expect(none.panes).toHaveLength(3)
    expect(none.panes[1]).toContain("--model 'gpt-6.1-sol'")
  })

  it('notifications ring the bell and wrap OSC for tmux', async () => {
    const { notification } = await import('../term/src/notify.mjs')
    expect(notification('Sush', 'Claude needs you', {})).toMatch(/^\x07\x1b\]9;Sush: Claude needs you\x07/)
    expect(notification('Sush', 'x', { TMUX: '1' })).toContain('\x1bPtmux;')
  })
})
