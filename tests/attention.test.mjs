import { describe, expect, it } from 'vitest'
import { attentionItems, attentionKind, attentionTitle, newlyNeedingAttention } from '../src/renderer/src/lib/attention.js'

const tab = (id, over = {}) => ({ id, label: `s-${id}`, workspaceCwd: '/w/p', ...over })

describe('attention', () => {
  it('only waiting, errored, exited and limited sessions count', () => {
    expect(attentionKind(tab('a'), 'working', false)).toBeNull()
    expect(attentionKind(tab('a'), 'idle', false)).toBeNull()
    expect(attentionKind(tab('a'), 'done', false)).toBeNull()
    expect(attentionKind(tab('a'), 'waiting', false)).toBe('waiting')
    expect(attentionKind(tab('a'), 'error', false)).toBe('error')
    expect(attentionKind(tab('a', { status: 'exited' }), 'idle', false)).toBe('error')
    expect(attentionKind(tab('a'), 'working', true)).toBe('limit')
  })

  it('orders worst first and keeps input order within a kind', () => {
    const tabs = [tab('1'), tab('2'), tab('3'), tab('4')]
    const items = attentionItems(tabs, { 1: 'error', 2: 'waiting', 3: 'waiting', 4: 'working' }, { 1: false, 3: true })
    expect(items.map(i => [i.id, i.kind])).toEqual([['3', 'limit'], ['2', 'waiting'], ['1', 'error']])
    expect(items[0].project).toBe('p')
  })

  it('titles the window with a count only when something needs you', () => {
    expect(attentionTitle('Sush', 0)).toBe('Sush')
    expect(attentionTitle('Sush', 3)).toBe('(3) Sush')
  })

  it('announces only sessions that newly need attention', () => {
    const items = [{ id: 'a' }, { id: 'b' }]
    expect(newlyNeedingAttention(['a'], items).map(i => i.id)).toEqual(['b'])
    expect(newlyNeedingAttention([], items)).toHaveLength(2)
    expect(newlyNeedingAttention(['a', 'b'], items)).toEqual([])
  })
})
