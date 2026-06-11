// Thin wrappers around AI provider streaming APIs.
// Runs in the Electron renderer -- no CORS restrictions apply.

import { AGENTS } from './agents'

const ANTHROPIC_MODEL = 'claude-opus-4-8'
const OPENAI_MODEL = 'gpt-4o'
const AGENT_IDS = AGENTS.map(agent => agent.id).join(', ')

function sedusiaSystemPrompt(tabs, activeCwd) {
  const running = tabs.filter(t => t.status !== 'exited')
  const sessionSummary = running.length
    ? running.map(t => `  • ${t.agentId || 'shell'} @ ${t.cwd || 'unknown'} [${t.status}]`).join('\n')
    : '  (none running)'

  return `You are Seducia, an AI session orchestrator embedded in Sush -- a custom terminal app.
Speak casually, confidently, briefly (1-3 sentences).
After your message, output one ACTION line per needed action (each on its own line): ACTION:<json>
You may emit several ACTION lines; they execute in order.

Available actions:
{"type":"launch","cwd":"/path","agents":[{"id":"claude","command":"claude","label":"Claude Code","count":1}],"groupLabel":"optional","prompt":"optional - sent to each launched agent once it boots"}
{"type":"prompt","target":"one of: ${AGENT_IDS}, all","text":"the message to send"}
{"type":"focus","target":"one of: ${AGENT_IDS}"}
{"type":"status"}
{"type":"run","input":"shell command to run"}
{"type":"open-launcher"}

Agent IDs: ${AGENT_IDS}
For "launch N agents and tell them to do X", use ONE launch action with count N and the instruction in "prompt" -- do not emit a separate prompt action for agents you are launching in the same reply.
For cwd use a full absolute path. If the user gives a relative path (like "Rooms\\Workrooms"), resolve it against their home directory or the active working directory -- pick whichever exists in context. If no path is specified, use activeCwd.

Current state:
- Active working directory: ${activeCwd || 'unknown'}
- Live sessions:
${sessionSummary}`
}

export async function* streamAnthropic(messages, { apiKey, tabs, activeCwd }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 512,
      stream: true,
      system: sedusiaSystemPrompt(tabs, activeCwd),
      messages
    })
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic ${res.status}: ${body}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return
      try {
        const evt = JSON.parse(data)
        if (evt.type === 'content_block_delta' && evt.delta?.text) {
          yield evt.delta.text
        }
      } catch {}
    }
  }
}

export async function* streamOpenAI(messages, { apiKey, tabs, activeCwd }) {
  const systemMsg = { role: 'system', content: sedusiaSystemPrompt(tabs, activeCwd) }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 512,
      stream: true,
      messages: [systemMsg, ...messages]
    })
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenAI ${res.status}: ${body}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return
      try {
        const evt = JSON.parse(data)
        const text = evt.choices?.[0]?.delta?.content
        if (text) yield text
      } catch {}
    }
  }
}

// CLI-backed "streamer": shell out to the user's logged-in agent CLIs via the
// main process — no API key needed. The whole system prompt + conversation is
// flattened into one stdin prompt (the CLI is stateless per call, same as how
// the HTTP streamers resend full history). It's a single-shot response, so this
// generator yields once rather than token-by-token.
//
// Engine cascade: 'auto' tries claude, then codex, then gemini — so hitting a
// Claude session limit silently rolls over to the next logged-in CLI. The
// engine that actually answered is appended as a marker line which
// parseAIResponse extracts (and hides) for the UI chip.
const CLI_ENGINE_ORDER = ['claude', 'codex', 'gemini']

export async function* streamAgentCli(messages, { tabs, activeCwd, engine = 'auto' }) {
  if (!window.sush?.seduciaCli) throw new Error('CLI bridge unavailable')
  const system = sedusiaSystemPrompt(tabs, activeCwd)
  const convo = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Seducia'}: ${m.content}`)
    .join('\n\n')
  const prompt = `${system}\n\n--- Conversation so far ---\n${convo}\n\nReply as Seducia now (1-3 sentences, plus ACTION lines if actions are needed):`

  const order = engine === 'auto' ? CLI_ENGINE_ORDER : [engine]
  const failures = []
  for (const id of order) {
    const res = await window.sush.seduciaCli({ prompt, cwd: activeCwd, engine: id })
    if (res?.ok) {
      yield res.text
      if (res.engine && res.engine !== 'claude') yield `\nENGINE:${res.engine}`
      return
    }
    failures.push(`${id}: ${res?.error || 'failed'}`)
  }
  throw new Error(
    order.length > 1
      ? `All CLI engines failed.\n${failures.join('\n')}`
      : failures[0] || 'CLI failed'
  )
}

// Backward-compatible alias (older call sites).
export const streamClaudeCli = streamAgentCli

// Parse a completed AI response: strips every ACTION:<json> line (and the
// ENGINE marker) out of the prose. Returns { message, actions, engine } —
// actions is an array (possibly empty), in emission order.
export function parseAIResponse(full) {
  const actions = []
  let engine = null
  const kept = []
  for (const line of String(full ?? '').split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('ENGINE:')) {
      engine = trimmed.slice(7).trim() || null
      continue
    }
    const idx = trimmed.indexOf('ACTION:')
    if (idx === 0) {
      try {
        actions.push(JSON.parse(trimmed.slice(7).trim()))
        continue
      } catch {
        // Unparseable action line — keep it visible so the user sees it.
      }
    }
    kept.push(line)
  }
  return { message: kept.join('\n').trim(), actions, engine }
}

// Pick the right streaming function. When the provider is set to 'cli', Seducia
// drives the local agent CLI logins (no key); otherwise it falls back to
// whichever API key is configured.
export function getStreamer(settings) {
  if (settings.seduciaProvider === 'cli') {
    const engine = settings.seduciaCliEngine || 'auto'
    return (msgs, ctx) => streamAgentCli(msgs, { ...ctx, engine })
  }
  if (settings.anthropicKey) return (msgs, ctx) => streamAnthropic(msgs, { apiKey: settings.anthropicKey, ...ctx })
  if (settings.openaiKey) return (msgs, ctx) => streamOpenAI(msgs, { apiKey: settings.openaiKey, ...ctx })
  return null
}
