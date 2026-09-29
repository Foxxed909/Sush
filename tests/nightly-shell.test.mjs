import { describe, expect, it } from 'vitest'
import {
  activeShellMode, modeFromShortcut, normalizeChannel, normalizeShellMode, terminalPlacement
} from '../src/renderer/src/lib/shellModes.js'
import { isAppChord, setShellChords } from '../src/renderer/src/lib/keymap.js'
import { describeToolUse, groupThreadTurns, workSummary } from '../src/renderer/src/lib/threadTurns.js'

const claude = { id: 't1', agentId: 'claude', threadBridge: true, cwd: '/repo/a', label: 'Claude' }
const codex = { id: 't2', agentId: 'codex', cwd: '/repo/a', label: 'Codex' }

describe('Nightly shell modes', () => {
  it('defaults to the Nightly channel and Code mode', () => {
    expect(normalizeChannel(undefined)).toBe('nightly')
    expect(normalizeChannel('stable')).toBe('stable')
    expect(normalizeShellMode('office')).toBe('office')
    expect(normalizeShellMode('agents')).toBe('code')   // Agents is the Overview view, never persisted
    expect(normalizeShellMode('bogus')).toBe('code')
  })

  it('treats the Overview view as the Agents mode', () => {
    expect(activeShellMode('overview', 'thread')).toBe('agents')
    expect(activeShellMode('terminal', 'thread')).toBe('thread')
  })

  it('keeps the terminal layer mounted and only moves it', () => {
    const base = { channel: 'nightly', view: 'terminal', drawerOpen: true }
    expect(terminalPlacement({ ...base, mode: 'code', activeTab: claude })).toBe('full')
    expect(terminalPlacement({ ...base, mode: 'thread', activeTab: claude })).toBe('drawer')
    expect(terminalPlacement({ ...base, mode: 'thread', activeTab: claude, drawerOpen: false })).toBe('hidden')
    // Non-Claude sessions keep the terminal in the centre in Thread mode.
    expect(terminalPlacement({ ...base, mode: 'thread', activeTab: codex })).toBe('full')
    expect(terminalPlacement({ ...base, mode: 'chat', activeTab: codex })).toBe('hidden')
    expect(terminalPlacement({ ...base, mode: 'office', activeTab: codex })).toBe('hidden')
    expect(terminalPlacement({ ...base, channel: 'stable', mode: 'office', activeTab: codex })).toBe('full')
    expect(terminalPlacement({ ...base, mode: 'office', activeTab: codex, officeFocus: 't2' })).toBe('monitor')
    expect(terminalPlacement({ ...base, mode: 'office', activeTab: codex, officeFocus: 't1' })).toBe('hidden')
  })

  it('maps Alt+1..5 to modes and ignores other chords', () => {
    expect(modeFromShortcut({ altKey: true, key: '1' })).toBe('chat')
    expect(modeFromShortcut({ altKey: true, key: '5' })).toBe('office')
    expect(modeFromShortcut({ altKey: true, key: '6' })).toBeNull()
    expect(modeFromShortcut({ altKey: true, ctrlKey: true, key: '1' })).toBeNull()
    expect(modeFromShortcut({ key: '1' })).toBeNull()
  })
})

describe('Nightly shell chords', () => {
  it('owns Alt+1..5 and Ctrl+` only on the Nightly channel', () => {
    setShellChords(false)
    expect(isAppChord({ key: '1', altKey: true })).toBe(false)
    expect(isAppChord({ key: '`', ctrlKey: true })).toBe(false)
    setShellChords(true)
    expect(isAppChord({ key: '1', altKey: true })).toBe(true)
    expect(isAppChord({ key: '6', altKey: true })).toBe(false)
    expect(isAppChord({ key: '`', ctrlKey: true })).toBe(true)
    setShellChords(false)
  })
})

describe('Thread work logs', () => {
  it('groups consecutive tool calls and pairs results by tool_use id', () => {
    const blocks = groupThreadTurns([
      { id: 'u1', type: 'user', text: 'fix it' },
      { id: 'a1', type: 'assistant', text: 'Looking.' },
      { id: 'c1', type: 'tool_use', toolUseId: 'x1', name: 'Bash', input: { command: 'npm test' } },
      { id: 'c2', type: 'tool_use', toolUseId: 'x2', name: 'Read', input: { file_path: 'a.js' } },
      { id: 'r2', type: 'tool_result', toolUseId: 'x2', text: 'contents' },
      { id: 'r1', type: 'tool_result', toolUseId: 'x1', text: 'fail', isError: true },
      { id: 'a2', type: 'assistant', text: 'Fixed.' }
    ])
    expect(blocks.map(b => b.kind)).toEqual(['user', 'assistant', 'work', 'assistant'])
    const work = blocks[2]
    expect(work.steps.map(s => [s.use.name, s.result.text])).toEqual([['Bash', 'fail'], ['Read', 'contents']])
    expect(workSummary(work)).toBe('2 tool calls · 1 error')
    expect(describeToolUse(work.steps[0].use)).toBe('Bash · npm test')
  })

  it('keeps an orphan result instead of dropping it', () => {
    const [work] = groupThreadTurns([{ id: 'r', type: 'tool_result', toolUseId: 'gone', text: 'x' }])
    expect(work.steps).toHaveLength(1)
    expect(work.steps[0].use).toBeNull()
  })
})

describe('Sush Office campus + interiors', () => {
  const tabs = [
    claude,
    codex,
    { id: 't3', agentId: 'gemini', cwd: '/repo/b', label: 'Gemini' }
  ]

  it('puts one building per project on the campus with a door you can use', async () => {
    const { buildCampusLayout, nearestInteractable, moveWithCollisions } = await import('../src/renderer/src/lib/officeLayout.js')
    const campus = buildCampusLayout(tabs)
    expect(campus.buildings.map(b => b.tabIds)).toEqual([['t1', 't2'], ['t3']])
    const b = campus.buildings[0]
    expect(nearestInteractable({ x: b.door.x, z: b.door.z + 1 }, campus)).toMatchObject({ kind: 'enter', key: b.key })
    // The spawn point is free and walls are solid.
    expect(moveWithCollisions(campus.spawn, 0, 0, campus.colliders)).toEqual(campus.spawn)
    let pos = { x: b.x, z: b.door.z + 2 }
    for (let i = 0; i < 60; i++) pos = moveWithCollisions(pos, 0, -0.1, campus.colliders)
    expect(pos.z).toBeGreaterThan(b.z + b.d / 2)
    expect(nearestInteractable({ x: campus.kiosk.x, z: campus.kiosk.z + 1 }, campus)).toMatchObject({ kind: 'new-office' })
  })

  it('an empty campus still has the kiosk, Seducia and the board', async () => {
    const { buildCampusLayout } = await import('../src/renderer/src/lib/officeLayout.js')
    const campus = buildCampusLayout([])
    expect(campus.buildings).toEqual([])
    expect(campus.interactables.map(i => i.kind)).toEqual(['new-office', 'chat', 'agents'])
  })

  it('builds an interior with a desk per session, a Hire desk and an exit', async () => {
    const { buildCampusLayout, buildInteriorLayout, nearestInteractable } = await import('../src/renderer/src/lib/officeLayout.js')
    const key = buildCampusLayout(tabs).buildings[0].key
    const room = buildInteriorLayout(tabs, key)
    expect(room.desks.map(d => d.tabId ?? 'hire')).toEqual(['t1', 't2', 'hire'])
    const desk = room.desks[0]
    expect(nearestInteractable({ x: desk.x, z: desk.z + 1 }, room)).toMatchObject({ kind: 'session', tabId: 't1' })
    expect(nearestInteractable({ x: room.door.x, z: room.door.z - 0.4 }, room)).toMatchObject({ kind: 'exit' })
  })

  it('rebuild keys follow sessions, not their state', async () => {
    const { campusLayoutKey } = await import('../src/renderer/src/lib/officeLayout.js')
    expect(campusLayoutKey(tabs)).toBe(campusLayoutKey(tabs.map(t => ({ ...t, status: 'running' }))))
    expect(campusLayoutKey(tabs)).not.toBe(campusLayoutKey(tabs.slice(1)))
  })
})

describe('Office stats', () => {
  it('counts heads per provider and state', async () => {
    const { officeHeadcount } = await import('../src/renderer/src/lib/officeStats.js')
    const h = officeHeadcount([claude, codex, { id: 'x', agentId: 'claude' }], { t1: 'working', t2: 'waiting' }, { x: true })
    expect(h.providers).toEqual([{ agentId: 'claude', count: 2 }, { agentId: 'codex', count: 1 }])
    expect([h.working, h.waiting, h.limit, h.idle]).toEqual([1, 1, 1, 0])
  })

  it('totals transcript tokens without estimating', async () => {
    const { transcriptTokens } = await import('../src/renderer/src/lib/officeStats.js')
    const t = transcriptTokens([
      { type: 'assistant', usage: { input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 50 } },
      { type: 'assistant', usage: { input_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 1100, output_tokens: 70 } }
    ])
    expect(t).toEqual({ input: 125, cached: 2100, output: 120, total: 2345, context: 1195 })
    expect(transcriptTokens([]).context).toBeNull()
  })

  it('awards XP for observed work and levels on a square curve', async () => {
    const { applyXpTick, levelFor } = await import('../src/renderer/src/lib/officeStats.js')
    let { ledger } = applyXpTick({}, { tabKey: 'a', officeKey: 'o', prevState: 'idle', state: 'working', minutes: 3 })
    ;({ ledger } = applyXpTick(ledger, { tabKey: 'a', officeKey: 'o', prevState: 'working', state: 'waiting' }))
    ;({ ledger } = applyXpTick(ledger, { tabKey: 'a', officeKey: 'o', prevState: 'waiting', state: 'waiting', outputTokens: 2500 }))
    expect(ledger.agents.a.xp).toBe(6 + 15 + 2)
    expect(ledger.offices.o).toBe(23)
    ;({ ledger } = applyXpTick(ledger, { tabKey: 'a', prevState: 'waiting', state: 'waiting', outputTokens: 3100 }))
    expect(ledger.agents.a.xp).toBe(24)
    expect(levelFor(0).level).toBe(0)
    expect(levelFor(50).level).toBe(1)
    expect(levelFor(199).level).toBe(1)
    expect(levelFor(200).level).toBe(2)
  })
})

describe('Office themes', () => {
  it('falls back to Night Loft for unknown ids', async () => {
    const { officeTheme, OFFICE_THEMES } = await import('../src/renderer/src/lib/officeThemes.js')
    expect(officeTheme('nope').id).toBe('loft')
    expect(OFFICE_THEMES.map(t => t.id)).toEqual(['loft', 'neon', 'forest', 'space', 'sunset'])
  })
})

describe('T3 turns', () => {
  it('keeps the first and final replies and folds work with its duration and files', async () => {
    const { buildTurns, formatWorkedFor } = await import('../src/renderer/src/lib/threadTurns.js')
    const at = s => `2026-09-29T09:0${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}Z`
    const blocks = buildTurns([
      { id: 'u', type: 'user', text: 'go', timestamp: at(0) },
      { id: 'a1', type: 'assistant', text: 'On it', timestamp: at(2) },
      { id: 'c1', type: 'tool_use', toolUseId: 'x', name: 'Edit', input: { file_path: 'a.js', old_string: 'a', new_string: 'b\nc' }, timestamp: at(10) },
      { id: 'r1', type: 'tool_result', toolUseId: 'x', text: 'ok', timestamp: at(11) },
      { id: 'mid', type: 'assistant', text: 'thinking out loud', timestamp: at(30) },
      { id: 'c2', type: 'tool_use', toolUseId: 'y', name: 'Write', input: { file_path: 'b.js', content: '1\n2\n3' }, timestamp: at(40) },
      { id: 'r2', type: 'tool_result', toolUseId: 'y', text: 'ok', timestamp: at(41) },
      { id: 'a2', type: 'assistant', text: 'Done', timestamp: at(225) }
    ])
    expect(blocks.map(b => b.kind)).toEqual(['user', 'assistant', 'work', 'assistant'])
    const work = blocks[2]
    expect(work.narration.map(n => n.id)).toEqual(['mid'])
    expect(formatWorkedFor(work.durationMs)).toBe('3m 43s')
    expect(work.files).toEqual([
      { path: 'a.js', added: 2, removed: 1 },
      { path: 'b.js', added: 3, removed: 0 }
    ])
    expect(formatWorkedFor(8000)).toBe('8.0s')
  })

  it('does not count failed edits as changes', async () => {
    const { changedFilesFromSteps } = await import('../src/renderer/src/lib/threadTurns.js')
    expect(changedFilesFromSteps([{ use: { name: 'Edit', input: { file_path: 'a', new_string: 'x' } }, result: { isError: true } }])).toEqual([])
  })
})

describe('Thread sidebar', () => {
  it('floats threads that need you, shelves settled ones, and filters by project', async () => {
    const { sidebarSections, compactTimeLabel, rowStatus } = await import('../src/renderer/src/lib/shellSidebar.js')
    const now = Date.now()
    const tabs = [
      { id: 'a', cwd: '/p/one', startedAt: now - 1000, lastActiveAt: now - 100 },
      { id: 'b', cwd: '/p/one', startedAt: now - 5000, lastActiveAt: now - 50 },
      { id: 'c', cwd: '/p/two', startedAt: now - 2000, status: 'exited' },
      { id: 'd', cwd: '/p/two', startedAt: now - 9000 }
    ]
    // Output bumps lastActiveAt constantly; order must not follow it.
    expect(sidebarSections(tabs).active.map(t => t.id)).toEqual(['a', 'b', 'd'])
    const s = sidebarSections(tabs, { activity: { b: 'waiting' }, pinned: new Set(['d']) })
    expect(s.pinned.map(t => t.id)).toEqual(['d'])
    expect(s.active.map(t => t.id)).toEqual(['b', 'a'])
    expect(s.settled.map(t => t.id)).toEqual(['c'])
    const { workspaceKey } = await import('../src/renderer/src/lib/workspaces.js')
    const filtered = sidebarSections(tabs, { project: workspaceKey(tabs[0]) })
    expect([...filtered.pinned, ...filtered.active, ...filtered.settled].map(t => t.id).sort()).toEqual(['a', 'b'])
    expect(sidebarSections(tabs, { query: 'zzz' }).active).toEqual([])
    expect(compactTimeLabel(now - 14 * 3600e3, now)).toBe('14h')
    expect(compactTimeLabel(now - 3000, now)).toBe('now')
    expect(rowStatus('waiting')).toMatchObject({ label: 'Needs input' })
    expect(rowStatus('idle')).toBeNull()
  })
})

describe('Unified diff parsing', () => {
  const sample = [
    'diff --git a/src/app.js b/src/app.js',
    'index 1111111..2222222 100644',
    '--- a/src/app.js',
    '+++ b/src/app.js',
    '@@ -10,4 +10,5 @@ function main() {',
    ' const a = 1',
    '-const b = 2',
    '+const b = 3',
    '+const c = 4',
    ' ',
    ' return a',
    '@@ -40,2 +41,2 @@',
    '-old()',
    '+next()',
    ' end()',
    'diff --git a/notes.md b/notes.md',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/notes.md',
    '@@ -0,0 +1,2 @@',
    '+# Notes',
    '+hello',
    ''
  ].join('\n')

  it('numbers lines on both sides and counts changes per file', async () => {
    const { parseUnifiedDiff, diffTotals } = await import('../src/renderer/src/lib/unifiedDiff.js')
    const files = parseUnifiedDiff(sample)
    expect(files.map(f => [f.path, f.status, f.added, f.removed])).toEqual([
      ['src/app.js', 'modified', 3, 2],
      ['notes.md', 'added', 2, 0]
    ])
    const [h1] = files[0].hunks
    expect(h1.context).toBe('function main() {')
    expect(h1.lines.map(l => [l.kind, l.old, l.new])).toEqual([
      ['ctx', 10, 10], ['del', 11, null], ['add', null, 11], ['add', null, 12], ['ctx', 12, 13], ['ctx', 13, 14]
    ])
    expect(diffTotals(files)).toEqual({ added: 5, removed: 2 })
  })

  it('reports unmodified gaps and pairs split rows', async () => {
    const { parseUnifiedDiff, gapBefore, splitRows } = await import('../src/renderer/src/lib/unifiedDiff.js')
    const [file] = parseUnifiedDiff(sample)
    expect(gapBefore(file.hunks, 0)).toBe(9)
    expect(gapBefore(file.hunks, 1)).toBe(26)
    const rows = splitRows(file.hunks[0])
    expect(rows[1]).toMatchObject({ left: { kind: 'del' }, right: { kind: 'add', new: 11 } })
    expect(rows[2]).toMatchObject({ left: null, right: { kind: 'add', new: 12 } })
  })
})

describe('T3 model picker rows', () => {
  it('lists a provider, spans providers when searching, and offers a typed id', async () => {
    const { pickerRows, pickerModelLabel } = await import('../src/renderer/src/lib/nightlyModels.js')
    expect(pickerRows({ section: 'claude' }).map(r => r.label)).toEqual(['Default', 'Sonnet', 'Opus'])
    const search = pickerRows({ section: 'claude', query: 'flash' })
    expect(search.every(r => r.provider === 'gemini')).toBe(true)
    expect(search.map(r => r.label)).toContain('Flash')
    const typed = pickerRows({ section: 'claude', query: 'claude-opus-5-5' })
    expect(typed.at(-1)).toMatchObject({ custom: true, value: 'claude-opus-5-5', provider: 'claude' })
    expect(pickerRows({ section: 'claude', query: '--dangerously' }).some(r => r.custom)).toBe(false)
    const favs = pickerRows({ section: 'favorites', favorites: new Set(['codex:']) })
    expect(favs.map(r => r.key)).toEqual(['codex:'])
    expect(pickerModelLabel('claude', 'opus')).toBe('Opus')
    expect(pickerModelLabel('claude', null)).toBe('Default')
  })
})

describe('Composer context', () => {
  it('reads context from the latest recorded usage and knows Claude windows', async () => {
    const { latestContextTokens } = await import('../src/renderer/src/lib/threadTurns.js')
    const { contextWindowFor, formatTokens } = await import('../src/renderer/src/lib/nightlyModels.js')
    expect(latestContextTokens([{ type: 'user', text: 'x' }])).toBeNull()
    expect(latestContextTokens([
      { type: 'assistant', usage: { input_tokens: 10, cache_read_input_tokens: 40000, output_tokens: 500 } },
      { type: 'tool_use' },
      { type: 'assistant', usage: { input_tokens: 20, cache_read_input_tokens: 41000, cache_creation_input_tokens: 300, output_tokens: 80 } }
    ])).toBe(41400)
    expect(contextWindowFor('claude', 'sonnet')).toBe(1_000_000)
    expect(contextWindowFor('claude', 'claude-haiku-4-5')).toBe(200_000)
    expect(contextWindowFor('codex', 'gpt-5.3-codex')).toBeNull()
    expect(formatTokens(41400)).toBe('41K')
    expect(formatTokens(1_000_000)).toBe('1M')
  })
})

describe('Launch brief safety', () => {
  it('recognises a shell that never started the agent', async () => {
    const { agentFailedToStart } = await import('../src/renderer/src/lib/terminalRegistry.js')
    expect(agentFailedToStart('bash: claude: command not found')).toBe(true)
    expect(agentFailedToStart("'codex' is not recognized as an internal or external command")).toBe(true)
    expect(agentFailedToStart('codex : The term \'codex\' is not recognized as the name of a cmdlet')).toBe(true)
    expect(agentFailedToStart('╭ Claude Code ready in ~/sush ╮\n> ')).toBe(false)
  })
})

describe('Write guard', () => {
  it('refuses credential stores and shell startup files under home', async () => {
    const { sensitiveWritePath } = await import('../src/main/fs-guard.js')
    const home = '/home/me'
    expect(sensitiveWritePath('/home/me/.bashrc', home, 'linux')).toBe(true)
    expect(sensitiveWritePath('/home/me/.ssh/authorized_keys', home, 'linux')).toBe(true)
    expect(sensitiveWritePath('/home/me/.config/gh/hosts.yml', home, 'linux')).toBe(true)
    expect(sensitiveWritePath('/home/me/projects/app/.env', home, 'linux')).toBe(false)
    expect(sensitiveWritePath('/home/me/projects/app/README.md', home, 'linux')).toBe(false)
    expect(sensitiveWritePath('/tmp/.bashrc', home, 'linux')).toBe(false)
  })
})
