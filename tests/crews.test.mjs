import { describe, expect, it } from 'vitest'
import { crewToAgents, parseRepoCrew } from '../src/renderer/src/lib/crews.js'

describe('crews carry model and reasoning', () => {
  const raw = JSON.stringify({
    name: 'Review pair',
    counts: { claude: 1, codex: 1 },
    models: { claude: 'opus', codex: 'gpt-5.3-codex' },
    efforts: { claude: 'xhigh', codex: 'high' },
    brief: 'review the diff'
  })

  it('keeps valid per-agent settings from a repo crew', () => {
    const crew = parseRepoCrew(raw)
    expect(crew.models).toEqual({ claude: 'opus', codex: 'gpt-5.3-codex' })
    expect(crew.efforts).toEqual({ claude: 'xhigh', codex: 'high' })
  })

  it('drops settings the CLI would refuse, including flag-shaped model ids', () => {
    const crew = parseRepoCrew(JSON.stringify({
      counts: { claude: 1 },
      models: { claude: '--dangerously-skip-permissions' },
      efforts: { claude: 'ultracode' }
    }))
    expect(crew.models).toEqual({})
    expect(crew.efforts).toEqual({})
  })

  it('ignores settings for agents that are not in the crew', () => {
    const crew = parseRepoCrew(JSON.stringify({ counts: { claude: 1 }, models: { codex: 'gpt-5.3-codex' } }))
    expect(crew.models).toEqual({})
  })

  it('old crews without settings still load', () => {
    const crew = parseRepoCrew(JSON.stringify({ counts: { shell: 2 } }))
    expect(crew.counts).toEqual({ shell: 2 })
    expect(crew.models).toEqual({})
  })

  it('passes model and effort through to the launch', () => {
    const crew = parseRepoCrew(raw)
    const agents = crewToAgents(crew, id => ({ claude: { command: 'claude', label: 'Claude Code' }, codex: { command: 'codex', label: 'Codex' } })[id])
    expect(agents).toEqual([
      { id: 'claude', count: 1, command: 'claude', label: 'Claude Code', model: 'opus', effort: 'xhigh' },
      { id: 'codex', count: 1, command: 'codex', label: 'Codex', model: 'gpt-5.3-codex', effort: 'high' }
    ])
  })
})
