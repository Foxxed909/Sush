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
After your message, if an action is needed, output exactly one line: ACTION:<json>

Available actions:
{"type":"launch","cwd":"/path","agents":[{"id":"claude","command":"claude","label":"Claude Code","count":1}],"groupLabel":"optional"}
{"type":"prompt","target":"one of: ${AGENT_IDS}, all","text":"the message to send"}
{"type":"focus","target":"one of: ${AGENT_IDS}"}
{"type":"status"}
{"type":"run","input":"shell command to run"}
{"type":"open-launcher"}

Agent IDs: ${AGENT_IDS}
For cwd use the full path. If no path is specified, use activeCwd.

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

// CLI-backed "streamer": shell out to the user's logged-in `claude` CLI via the
// main process — no API key needed. The whole system prompt + conversation is
// flattened into one stdin prompt (the CLI is stateless per call, same as how
// the HTTP streamers resend full history). It's a single-shot response, so this
// generator yields once rather than token-by-token.
export async function* streamClaudeCli(messages, { tabs, activeCwd }) {
  if (!window.sush?.seduciaCli) throw new Error('CLI bridge unavailable')
  const system = sedusiaSystemPrompt(tabs, activeCwd)
  const convo = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Seducia'}: ${m.content}`)
    .join('\n\n')
  const prompt = `${system}\n\n--- Conversation so far ---\n${convo}\n\nReply as Seducia now (1-3 sentences, plus one ACTION line if an action is needed):`
  const res = await window.sush.seduciaCli({ prompt, cwd: activeCwd })
  if (!res?.ok) throw new Error(res?.error || 'claude CLI failed')
  yield res.text
}

// Parse the ACTION:<json> line from a completed AI response.
// Returns { message, action } where action may be null.
export function parseAIResponse(full) {
  const idx = full.lastIndexOf('ACTION:')
  if (idx === -1) return { message: full.trim(), action: null }
  const message = full.slice(0, idx).trim()
  const actionStr = full.slice(idx + 7).trim().split('\n')[0]
  try {
    return { message, action: JSON.parse(actionStr) }
  } catch {
    return { message: full.trim(), action: null }
  }
}

// Pick the right streaming function. When the provider is set to 'cli', Seducia
// drives the local `claude` login (no key); otherwise it falls back to whichever
// API key is configured.
export function getStreamer(settings) {
  if (settings.seduciaProvider === 'cli') return (msgs, ctx) => streamClaudeCli(msgs, ctx)
  if (settings.anthropicKey) return (msgs, ctx) => streamAnthropic(msgs, { apiKey: settings.anthropicKey, ...ctx })
  if (settings.openaiKey) return (msgs, ctx) => streamOpenAI(msgs, { apiKey: settings.openaiKey, ...ctx })
  return null
}
