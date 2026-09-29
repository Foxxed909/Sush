import { describe, expect, it } from 'vitest'
import {
  activeShellMode, modeFromShortcut, normalizeChannel, normalizeShellMode, terminalPlacement
} from '../src/renderer/src/lib/shellModes.js'
import { isAppChord, setShellChords } from '../src/renderer/src/lib/keymap.js'
import { describeToolUse, groupThreadTurns, workSummary } from '../src/renderer/src/lib/threadTurns.js'
import {
  buildOfficeLayout, moveWithCollisions, nearestInteractable, officeLayoutKey
} from '../src/renderer/src/lib/officeLayout.js'

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

describe('Sush Office layout', () => {
  const tabs = [
    claude,
    codex,
    { id: 't3', agentId: 'gemini', cwd: '/repo/b', label: 'Gemini' }
  ]

  it('gives each project a room with a desk per session plus a new-session desk', () => {
    const layout = buildOfficeLayout(tabs)
    expect(layout.rooms).toHaveLength(2)
    expect(layout.rooms[0].desks.map(d => d.tabId)).toEqual(['t1', 't2', null])
    expect(layout.rooms[1].desks.map(d => d.tabId)).toEqual(['t3', null])
    expect(layout.rooms[0].desks[2].cwd).toBeTruthy()
  })

  it('still builds an empty room when nothing is running', () => {
    const layout = buildOfficeLayout([])
    expect(layout.rooms).toHaveLength(1)
    expect(layout.rooms[0].desks).toEqual([expect.objectContaining({ tabId: null })])
  })

  it('spawns the player somewhere free and blocks walking through walls', () => {
    const layout = buildOfficeLayout(tabs)
    const spawn = layout.spawn
    expect(moveWithCollisions(spawn, 0, 0, layout.colliders)).toEqual(spawn)
    // Walk straight back from the lobby into a solid part of a front wall.
    const room = layout.rooms[0]
    const start = { x: room.x - room.w / 2 + 1, z: 1 }
    let pos = start
    for (let i = 0; i < 40; i++) pos = moveWithCollisions(pos, 0, -0.1, layout.colliders)
    expect(pos.z).toBeGreaterThan(0)
    // Through the door is fine.
    pos = { x: room.x, z: 1 }
    for (let i = 0; i < 20; i++) pos = moveWithCollisions(pos, 0, -0.1, layout.colliders)
    expect(pos.z).toBeLessThan(0)
  })

  it('finds the desk, Seducia or the board within reach', () => {
    const layout = buildOfficeLayout(tabs)
    const desk = layout.rooms[0].desks[0]
    expect(nearestInteractable({ x: desk.x, z: desk.z + 1 }, layout)).toMatchObject({ kind: 'session', tabId: 't1' })
    const s = layout.lobby.seducia
    expect(nearestInteractable({ x: s.x, z: s.z + 1 }, layout)).toMatchObject({ kind: 'chat' })
    expect(nearestInteractable({ x: 999, z: 999 }, layout)).toBeNull()
  })

  it('changes its rebuild key when sessions change, not when state does', () => {
    expect(officeLayoutKey(tabs)).toBe(officeLayoutKey(tabs.map(t => ({ ...t, status: 'running' }))))
    expect(officeLayoutKey(tabs)).not.toBe(officeLayoutKey(tabs.slice(1)))
  })
})
