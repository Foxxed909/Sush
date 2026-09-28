import { EventEmitter } from 'events'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildCapabilities,
  createCapabilityCache,
  helpHasFlag,
  helpHasSubcommand,
  parseCliVersion,
  parseFlagChoices,
  probeProvider
} from '../src/main/provider-capabilities.js'
import {
  buildAgentCommand,
  effortOptionsFor,
  normalizeEffort,
  normalizeModel,
  setProviderCapabilities,
  supportsResume
} from '../src/renderer/src/lib/nightlyModels.js'

// Synthetic help texts in the shapes the common CLI parsers print. These are
// fixtures for the parser, not claims about any specific provider release.
const COMMANDER_HELP = `Usage: claude [options] [command] [prompt]

Options:
  -c, --continue                 Continue the most recent conversation
  --model <model>                Model for the current session
  --effort <level>               Effort level for the current session (choices:
                                 "low", "medium", "high", "xhigh", "max")
  -h, --help                     Display help for command
`

const CLAP_HELP = `Usage: codex [OPTIONS] [PROMPT] [COMMAND]

Commands:
  exec        Run Codex non-interactively
  resume      Resume a previous interactive session
  help        Print this message

Options:
  -c, --config <key=value>  Override a configuration value
  -m, --model <MODEL>       Model the agent should use
      --color <COLOR>       [possible values: always, never, auto]
`

// Verbatim excerpt of `claude --help` from Claude Code 2.1.284 (2026-09-28).
const CLAUDE_2_1_284_HELP = `Options:
  -c, --continue                        Continue the most recent conversation in
                                        the current directory
  --effort <level>                      Effort level for the current session
                                        (low, medium, high, xhigh, max)
  --model <model>                       Model for the current session. Provide
                                        an alias for the latest model (e.g.
                                        'fable', 'opus', or 'sonnet') or a
                                        model's full name.
`

const agent = (id, command, resumeCommand) => ({ id, command, resumeCommand })

// Fake spawn: answers --version / --help from a table, never touches the OS.
function fakeSpawn(outputs, calls = []) {
  return (file, args) => {
    calls.push([file, ...args])
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    const key = args[args.length - 1]
    queueMicrotask(() => {
      const out = outputs[key]
      if (out == null) return child.emit('close', 1)
      child.stdout.emit('data', out)
      child.emit('close', 0)
    })
    return child
  }
}

afterEach(() => setProviderCapabilities({}))

describe('provider capability probe parsing', () => {
  it('extracts versions from typical --version output', () => {
    expect(parseCliVersion('2.1.14 (Claude Code)')).toBe('2.1.14')
    expect(parseCliVersion('codex-cli 0.46.0')).toBe('0.46.0')
    expect(parseCliVersion('\u001b[1mv1.2.3-beta.1\u001b[0m')).toBe('1.2.3-beta.1')
    expect(parseCliVersion('no version here')).toBeNull()
  })

  it('detects flags and subcommands without substring false positives', () => {
    expect(helpHasFlag(COMMANDER_HELP, '--continue')).toBe(true)
    expect(helpHasFlag(COMMANDER_HELP, '--effort')).toBe(true)
    expect(helpHasFlag(COMMANDER_HELP, '--eff')).toBe(false)
    expect(helpHasFlag(COMMANDER_HELP, '--resume')).toBe(false)
    expect(helpHasSubcommand(CLAP_HELP, 'resume')).toBe(true)
    expect(helpHasSubcommand(COMMANDER_HELP, 'resume')).toBe(false)
    expect(helpHasFlag(null, '--model')).toBeNull()
  })

  it('reads enumerated flag values across parser styles, including wrapped help', () => {
    expect(parseFlagChoices(COMMANDER_HELP, '--effort')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(parseFlagChoices(CLAP_HELP, '--color')).toEqual(['always', 'never', 'auto'])
    expect(parseFlagChoices('  --mode <fast|slow>  Pick one', '--mode')).toEqual(['fast', 'slow'])
    expect(parseFlagChoices(COMMANDER_HELP, '--model')).toBeNull()
  })

  it('reads the effort list Claude Code 2.1.284 actually prints', () => {
    expect(parseFlagChoices(CLAUDE_2_1_284_HELP, '--effort')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    // Prose examples in parentheses are not a value list.
    expect(parseFlagChoices(CLAUDE_2_1_284_HELP, '--model')).toBeNull()
    expect(buildCapabilities('claude', { installed: true, help: CLAUDE_2_1_284_HELP })).toMatchObject({
      models: { flag: true }, resume: true, reasoning: { flag: true, choices: ['low', 'medium', 'high', 'xhigh', 'max'] }
    })
  })

  it('drops enumerated values that could smuggle shell syntax', () => {
    const hostile = '  --effort <x>  (choices: "high", "x; rm -rf ~", "$(id)")'
    expect(parseFlagChoices(hostile, '--effort')).toEqual(['high'])
  })
})

describe('provider capability records', () => {
  it('reports observed flags and leaves unobserved facts unknown', () => {
    const caps = buildCapabilities('claude', { installed: true, version: '2.1.14', help: COMMANDER_HELP })
    expect(caps).toMatchObject({
      provider: 'claude',
      installed: true,
      version: '2.1.14',
      models: { flag: true },
      resume: true,
      reasoning: { flag: true, choices: ['low', 'medium', 'high', 'xhigh', 'max'] },
      contextTelemetry: false,
      threadBridge: false
    })
    const blind = buildCapabilities('claude', { installed: true, help: null })
    expect(blind.models.flag).toBeNull()
    expect(blind.resume).toBeNull()
    expect(blind.reasoning).toBeNull()
  })

  it('never claims context telemetry or a Thread bridge for any provider', () => {
    for (const provider of ['claude', 'codex', 'gemini', 'opencode', 'grok']) {
      const caps = buildCapabilities(provider, { installed: true, help: COMMANDER_HELP })
      expect(caps.contextTelemetry).toBe(false)
      expect(caps.threadBridge).toBe(false)
    }
  })

  it('treats Codex resume as a subcommand and reasoning as a config override', () => {
    const caps = buildCapabilities('codex', { installed: true, help: CLAP_HELP })
    expect(caps.resume).toBe(true)
    expect(caps.reasoning).toEqual({ flag: true, choices: null })
  })

  it('marks missing CLIs as not installed without probing', async () => {
    const calls = []
    const caps = await probeProvider('gemini', { resolveExecutable: () => null, spawn: fakeSpawn({}, calls) })
    expect(caps.installed).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

describe('provider capability cache', () => {
  it('probes once per binary stamp and re-probes when the CLI changes', async () => {
    const calls = []
    let mtimeMs = 1000
    const cache = createCapabilityCache({
      resolveExecutable: name => (name === 'claude' ? '/usr/bin/claude' : null),
      statSync: () => ({ size: 10, mtimeMs }),
      spawn: fakeSpawn({ '--version': '2.1.14', '--help': COMMANDER_HELP }, calls),
      shimSpawnSpec: (bin, args) => ({ file: bin, args })
    })
    const first = await cache.get('claude')
    await cache.get('claude')
    expect(first.version).toBe('2.1.14')
    expect(calls).toHaveLength(2)

    mtimeMs = 2000 // CLI upgraded in place
    await cache.get('claude')
    expect(calls).toHaveLength(4)

    await cache.get('claude', { refresh: true })
    expect(calls).toHaveLength(6)
  })
})

describe('Nightly adapter with discovered capabilities', () => {
  it('uses the installed CLI enumeration for Claude effort, including newer values', () => {
    setProviderCapabilities({ claude: { reasoning: { flag: true, choices: ['low', 'high', 'ultra'] } } })
    expect(effortOptionsFor('claude')).toEqual(['', 'low', 'high', 'ultra'])
    expect(normalizeEffort('claude', 'ultra')).toBe('ultra')
    expect(normalizeEffort('claude', 'medium')).toBeNull()
    expect(buildAgentCommand(agent('claude', 'claude'), { effort: 'ultra' })).toBe('claude --effort ultra')
  })

  it('offers and emits no effort when the installed CLI lacks the flag', () => {
    setProviderCapabilities({ claude: { reasoning: { flag: false, choices: null } } })
    expect(effortOptionsFor('claude')).toEqual([])
    expect(buildAgentCommand(agent('claude', 'claude'), { model: 'opus', effort: 'high' })).toBe('claude --model opus')
  })

  it('keeps the verified fallback when nothing was observed', () => {
    setProviderCapabilities({ claude: { reasoning: null }, codex: { reasoning: { flag: true, choices: null } } })
    expect(effortOptionsFor('claude')).toEqual(['', 'low', 'medium', 'high', 'xhigh', 'max'])
    expect(effortOptionsFor('codex', 'gpt-5.3-codex')).toEqual(['', 'low', 'medium', 'high', 'xhigh'])
  })

  it('drops the model flag and reports resume support from observed help', () => {
    setProviderCapabilities({ opencode: { models: { flag: false }, resume: false } })
    expect(normalizeModel('opencode', 'anthropic/x')).toBeNull()
    expect(buildAgentCommand(agent('opencode', 'opencode'), { model: 'anthropic/x' })).toBe('opencode')
    expect(supportsResume('opencode')).toBe(false)
    expect(supportsResume('claude')).toBe(true)
  })
})

describe('provider capability persistence', () => {
  const base = {
    resolveExecutable: name => (name === 'claude' ? '/usr/bin/claude' : null),
    statSync: () => ({ size: 10, mtimeMs: 1000 }),
    shimSpawnSpec: (bin, args) => ({ file: bin, args })
  }

  it('a second launch reads the saved probe and spawns nothing', async () => {
    let saved = null
    const calls = []
    const first = createCapabilityCache({ ...base, spawn: fakeSpawn({ '--version': '2.1.14', '--help': COMMANDER_HELP }, calls), store: { read: () => saved, write: d => { saved = JSON.parse(JSON.stringify(d)) } } })
    await first.get('claude')
    expect(calls).toHaveLength(2)
    expect(saved.claude.caps.version).toBe('2.1.14')

    const secondCalls = []
    const second = createCapabilityCache({ ...base, spawn: fakeSpawn({}, secondCalls), store: { read: () => saved, write: () => {} } })
    const caps = await second.get('claude')
    expect(caps.version).toBe('2.1.14')
    expect(secondCalls).toHaveLength(0)
  })

  it('re-probes when the saved stamp no longer matches the binary', async () => {
    const saved = { claude: { stamp: '/usr/bin/claude|10|999', caps: { provider: 'claude', installed: true, version: '1.0.0' } } }
    const calls = []
    const cache = createCapabilityCache({ ...base, spawn: fakeSpawn({ '--version': '2.1.14', '--help': COMMANDER_HELP }, calls), store: { read: () => saved, write: () => {} } })
    const caps = await cache.get('claude')
    expect(caps.version).toBe('2.1.14')
    expect(calls).toHaveLength(2)
  })

  it('ignores a corrupt or hostile store file', async () => {
    const calls = []
    for (const junk of ['nope', 42, [], { claude: 'x' }, { claude: { stamp: 's', caps: { provider: 'codex' } } }]) {
      const cache = createCapabilityCache({ ...base, spawn: fakeSpawn({ '--version': '2.1.14', '--help': COMMANDER_HELP }, calls), store: { read: () => junk, write: () => {} } })
      expect((await cache.get('claude')).version).toBe('2.1.14')
    }
  })
})

