import { describe, expect, it } from 'vitest'
import { folderName, groupByWorkspace, sameWorkspace, tabsInWorkspace, workspaceKey, workspaceLabel } from '../src/renderer/src/lib/workspaces.js'

const t = (over) => ({ id: 'x', ...over })

describe('workspace identity', () => {
  it('is the stable project root, not the live cwd', () => {
    const a = t({ id: 'a', workspaceCwd: '/home/u/sush', cwd: '/home/u/sush/src/deep' })
    const b = t({ id: 'b', workspaceCwd: '/home/u/sush/', cwd: '/home/u/sush' })
    expect(workspaceKey(a)).toBe(workspaceKey(b))
    expect(sameWorkspace(a, b)).toBe(true)
  })

  it('normalizes Windows case and trailing separators', () => {
    expect(workspaceKey(t({ cwd: 'C:\\Work\\Sush\\' }))).toBe(workspaceKey(t({ cwd: 'c:\\work\\sush' })))
  })

  it('keeps distinct case-sensitive POSIX folders separate and recognizes the root', () => {
    expect(sameWorkspace(t({ cwd: '/work/App' }), t({ cwd: '/work/app' }))).toBe(false)
    expect(workspaceKey(t({ cwd: '/' }))).toBe('cwd:/')
    expect(workspaceKey(t({ cwd: 'C:/Work/Sush/' }))).toBe(workspaceKey(t({ cwd: 'c:\\work\\sush' })))
  })

  it('falls back to the workspace group, then to the session itself', () => {
    expect(workspaceKey(t({ id: 'a', groupId: 'g1' }))).toBe('group:g1')
    expect(workspaceKey(t({ id: 'a' }))).toBe('tab:a')
    expect(workspaceKey(null)).toBeNull()
  })

  it('never lumps folderless sessions together (rail and Split/Grid agree)', () => {
    const tabs = [t({ id: 'a' }), t({ id: 'b' }), t({ id: 'c', workspaceCwd: '/p' })]
    expect(groupByWorkspace(tabs).map(g => g.tabs.map(x => x.id))).toEqual([['a'], ['b'], ['c']])
  })

  it('groups in first-seen order with a folder label', () => {
    const tabs = [
      t({ id: '1', workspaceCwd: '/w/alpha' }),
      t({ id: '2', workspaceCwd: '/w/beta' }),
      t({ id: '3', workspaceCwd: '/w/alpha', cwd: '/w/alpha/src' })
    ]
    const groups = groupByWorkspace(tabs)
    expect(groups.map(g => g.label)).toEqual(['alpha', 'beta'])
    expect(groups[0].tabs.map(x => x.id)).toEqual(['1', '3'])
  })

  it('finds the tabs sharing a workspace with an anchor', () => {
    const tabs = [t({ id: '1', workspaceCwd: '/a' }), t({ id: '2', workspaceCwd: '/b' }), t({ id: '3', cwd: '/a' })]
    expect(tabsInWorkspace(tabs, tabs[0]).map(x => x.id)).toEqual(['1', '3'])
    expect(tabsInWorkspace(tabs, null)).toEqual([])
  })

  it('labels by folder name, or by group/label when there is no folder', () => {
    expect(folderName('/a/b/c/')).toBe('c')
    expect(folderName('C:\\a\\b')).toBe('b')
    expect(workspaceLabel(t({ workspaceCwd: '/a/b' }))).toBe('b')
    expect(workspaceLabel(t({ groupLabel: 'Crew' }))).toBe('Crew')
    expect(workspaceLabel(t({}))).toBe('Unassigned')
  })
})

