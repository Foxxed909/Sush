import { describe, expect, it } from 'vitest'
import { advise, costOf, parseClaudeTranscript, parseCodexRollout, priceFor, summarize } from '../src/main/finance-core.mjs'

const NOW = new Date(2026, 10, 25, 12).getTime() // 25 Nov 2026, local noon
const day = n => NOW - n * 864e5
const iso = ts => new Date(ts).toISOString()

function claudeLine({ id, ts, model = 'claude-opus-5-5', cwd = '/work/app', input = 0, output = 0, cw = 0, cr = 0 }) {
  return JSON.stringify({ timestamp: iso(ts), cwd, message: { id, model, usage: { input_tokens: input, output_tokens: output, cache_creation_input_tokens: cw, cache_read_input_tokens: cr } } })
}
const rec = (over = {}) => ({ id: null, ts: day(1), model: 'claude-opus-5-5', cwd: '/work/app', input: 0, output: 0, cacheWrite: 0, cacheRead: 0, ...over })

describe('pricing', () => {
  it('prices by longest prefix, including dated snapshots', () => {
    expect(priceFor('claude-opus-5-5').input).toBe(4)
    expect(priceFor('claude-opus-5-20260101').input).toBe(5)
    expect(priceFor('claude-fable-5-2[1m]').output).toBe(40)
  })
  it('returns null for unknown models instead of a fake $0', () => {
    expect(priceFor('gpt-5.3-codex')).toBe(null)
    expect(costOf(rec({ model: 'gpt-5.3-codex', input: 1e6 }))).toBe(null)
  })
  it('lets a user price win over the table and fills cache defaults', () => {
    const p = priceFor('gpt-5.3-codex', { 'gpt-5.3': { input: 2, output: 8 } })
    expect(p).toEqual({ input: 2, output: 8, cacheWrite: 2.5, cacheRead: 0.2 })
  })
  it('costs every token class at its own rate', () => {
    // Opus 5.5: 4 in, 20 out, 5 write, 0.2 read per MTok
    expect(costOf(rec({ input: 1e6, output: 1e6, cacheWrite: 1e6, cacheRead: 1e6 }))).toBeCloseTo(29.2, 6)
  })
})

describe('transcript parsing', () => {
  it('reads Claude usage lines and skips junk', () => {
    const text = [claudeLine({ id: 'm1', ts: day(1), input: 10, output: 5 }), 'not json', '{"type":"user"}', '[1,2]'].join('\n')
    const out = parseClaudeTranscript(text)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'm1', input: 10, output: 5, cwd: '/work/app' })
  })
  it('splits Codex cached input out of input_tokens and tracks model/cwd', () => {
    const lines = [
      { timestamp: iso(day(2)), type: 'session_meta', payload: { cwd: '/work/api' } },
      { timestamp: iso(day(2)), type: 'turn_context', payload: { model: 'gpt-5.3-codex' } },
      { timestamp: iso(day(2)), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 1000, cached_input_tokens: 600, output_tokens: 50 } } } }
    ].map(o => JSON.stringify(o)).join('\n')
    const [r] = parseCodexRollout(lines, 'f')
    expect(r).toMatchObject({ model: 'gpt-5.3-codex', cwd: '/work/api', input: 400, cacheRead: 600, output: 50 })
  })
})

describe('review regressions', () => {
  it('skips <synthetic> placeholders and zero-token lines', () => {
    const text = [
      JSON.stringify({ timestamp: iso(day(1)), message: { id: 's', model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 } } }),
      claudeLine({ id: 'z', ts: day(1) })
    ].join('\n')
    expect(parseClaudeTranscript(text)).toEqual([])
  })
  it('counts a repeated Codex token_count once', () => {
    const ev = { timestamp: iso(day(1)), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100 }, last_token_usage: { input_tokens: 100, output_tokens: 10 } } } }
    expect(parseCodexRollout([ev, ev].map(o => JSON.stringify(o)).join('\n'))).toHaveLength(1)
  })
  it('keeps the most complete copy of a multi-line Claude message', () => {
    const early = rec({ id: 'm', output: 5 })
    const final = rec({ id: 'm', output: 1e6 })
    const s = summarize([{ provider: 'claude', slotId: 'default', label: 'C', records: [early, final] }], {}, NOW)
    expect(s.usd).toBe(20)
    expect(s.accounts[0].requests).toBe(1)
  })
})

describe('summary', () => {
  const acct = (records, over = {}) => ({ provider: 'claude', slotId: 'default', label: 'Claude · Default', records, ...over })

  it('counts only this month and dedupes resumed-session copies', () => {
    const dup = rec({ id: 'same', input: 1e6 })
    const lastMonth = rec({ ts: new Date(2026, 9, 30).getTime(), input: 1e6 })
    const s = summarize([acct([dup, { ...dup }, lastMonth])], {}, NOW)
    expect(s.usd).toBe(4)
    expect(s.accounts[0].requests).toBe(1)
  })
  it('reports value against plan price and budget state', () => {
    const s = summarize([acct([rec({ output: 10e6 })])], { plans: { 'claude:default': 100 }, budgetUsd: 150 }, NOW)
    expect(s.usd).toBe(200)
    expect(s.valueRatio).toBe(2)
    expect(s.budgetState).toBe('over')
    expect(s.advice[0].kind).toBe('budget')
  })
  it('groups by project folder name and lists unpriced models', () => {
    const s = summarize([acct([rec({ cwd: '/a/web', input: 1e6 }), rec({ cwd: 'C:\\dev\\web', input: 1e6 }), rec({ model: 'mystery-1', input: 5 })])], {}, NOW)
    expect(s.projects[0]).toMatchObject({ key: 'web', usd: 8 })
    expect(s.unpricedModels).toEqual(['mystery-1'])
  })
})

describe('advice', () => {
  const base = { budgetState: 'none', unpricedModels: [] }
  const row = over => ({ key: 'claude:default', provider: 'claude', label: 'Claude · Default', usd: 0, tokens: 0, unpricedTokens: 0, planUsd: 0, lastUsedAt: day(1), lastLimitAt: null, weekPeak: 0, ...over })

  it('flags a paid account nobody has used for two weeks', () => {
    const out = advise({ ...base, accounts: [row({ planUsd: 20, lastUsedAt: day(20) })] }, NOW)
    expect(out[0]).toMatchObject({ kind: 'idle', saveUsd: 20 })
  })
  it('suggests a smaller plan when usage is worth well under its price', () => {
    const out = advise({ ...base, accounts: [row({ planUsd: 200, usd: 20 })] }, NOW)
    expect(out.find(a => a.kind === 'downgrade')).toBeTruthy()
  })
  it('stays quiet about value early in the month', () => {
    const early = new Date(2026, 10, 3, 12).getTime()
    const out = advise({ ...base, accounts: [row({ planUsd: 200, usd: 1, lastUsedAt: early - 864e5 })] }, early)
    expect(out.find(a => a.kind === 'downgrade')).toBeFalsy()
  })
  it('suggests more headroom for an account hitting its limits', () => {
    const out = advise({ ...base, accounts: [row({ planUsd: 20, usd: 120, lastLimitAt: day(2) })] }, NOW)
    expect(out.find(a => a.kind === 'upgrade')).toBeTruthy()
  })
  it('suggests rotation when one account does all the work', () => {
    const out = advise({ ...base, accounts: [row({ tokens: 100 }), row({ key: 'claude:s2', label: 'Claude · Work', tokens: 0 })] }, NOW)
    expect(out.find(a => a.kind === 'rotate')).toBeTruthy()
  })
})
