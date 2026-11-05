import { describe, expect, it, beforeEach } from 'vitest'
import { __resetSeduciaThreads, activeThread, newThread, removeThread, selectThread, threadStatus, updateThread } from '../src/renderer/src/lib/seduciaThreads.js'

const mem = new Map()
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear() }

describe('Seducia threads', () => {
  beforeEach(() => { localStorage.clear(); __resetSeduciaThreads(null) })

  it('titles a thread from its first ask and derives status', () => {
    const t = activeThread()
    updateThread(t.id, x => ({ ...x, log: [{ id: 1, role: 'you', text: 'tidy   up the repo' }, { id: 2, role: 'seducia', text: '', streaming: true }] }))
    expect(activeThread().title).toBe('tidy up the repo')
    expect(threadStatus(activeThread())).toBe('working')
    updateThread(t.id, x => ({ ...x, log: x.log.map(e => ({ ...e, streaming: false, approvals: e.role === 'seducia' ? [{ key: 'a', status: null }] : undefined })) }))
    expect(threadStatus(activeThread())).toBe('needs')
  })

  it('reuses an empty chat, switches threads and never leaves zero', () => {
    const first = activeThread().id
    expect(newThread()).toBe(first)
    updateThread(first, x => ({ ...x, log: [{ id: 1, role: 'you', text: 'a' }] }))
    const second = newThread()
    expect(second).not.toBe(first)
    selectThread(first)
    expect(activeThread().id).toBe(first)
    removeThread(first)
    removeThread(second)
    expect(activeThread()).toBeTruthy()
  })
})
