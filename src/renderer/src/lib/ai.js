// Thin wrappers around AI provider streaming APIs.
// Runs in the Electron renderer -- no CORS restrictions apply.

import { AGENTS } from './agents'

const ANTHROPIC_MODEL = 'claude-opus-4-8'
const OPENAI_MODEL = 'gpt-4o'
const AGENT_IDS = AGENTS.map(agent => agent.id).join(', ')

function sedusiaSystemPrompt(tabs, activeCwd, scope) {
  const running = tabs.filter(t => t.status !== 'exited')
  const sessionSummary = running.length
    ? running.map(t => `  • ${t.agentId || 'shell'} "${t.label}" @ ${t.cwd || 'unknown'} [${t.status}]${t.groupLabel ? ` (ws: ${t.groupLabel})` : ''}`).join('\n')
    : '  (none running)'

  const scopeBlock = scope?.kind === 'project'
    ? `You are Seducia PROJECT for the workspace "${scope.label}" (${scope.cwd || 'no directory'}). You run THIS workspace: launches add sessions to it (default cwd is the workspace directory), and prompt/focus/close-session/read-output act on its sessions only. The session list below is already filtered to this workspace.`
    : `You are Seducia MAIN. You run the whole app: create workspaces anywhere, manage every session, switch themes.`

  return `You are Seducia, the AI orchestrator embedded in Sush -- the terminal your agents live in.
${scopeBlock}
Speak casually, confidently, briefly (1-3 sentences).
After your message, output one ACTION line per needed action (each on its own line): ACTION:<json>
You may emit several ACTION lines; they execute in order.

Available actions:
{"type":"launch","cwd":"/path","agents":[{"id":"claude","count":1}],"groupLabel":"optional workspace name","prompt":"optional - sent to each launched agent once it boots"}
{"type":"prompt","target":"one of: ${AGENT_IDS}, all","text":"the message to send"}
{"type":"focus","target":"one of: ${AGENT_IDS}"}
{"type":"status"}
{"type":"run","input":"shell command to run"}
{"type":"open-launcher"}
{"type":"close-session","target":"one of: ${AGENT_IDS}, all"}
{"type":"close-workspace","name":"workspace name, or \\"this\\" for the current one"}
{"type":"rename-workspace","name":"workspace name or \\"this\\"","to":"new name"}
{"type":"read-output","target":"one of: ${AGENT_IDS}, all"}
{"type":"theme","name":"theme name, e.g. glass dark pro"}

Agent IDs: ${AGENT_IDS}
"target" accepts an agent id, "all", or an exact SESSION LABEL from the list below (e.g. "Claude Code 2") -- use the label when the user names a specific session.
A launch creates a workspace (sessions live inside workspaces). For "launch N agents and tell them to do X", use ONE launch action with count N and the instruction in "prompt" -- do not emit a separate prompt action for agents you are launching in the same reply.
read-output hands you the recent terminal output of the matching sessions in a follow-up turn -- use it to REVIEW what agents actually did before reporting, never guess.
To relay something from one session to another (e.g. "tell Claude Code 2 to fix this error"), emit read-output on the SOURCE session first; when its output arrives next turn, emit a prompt to the target that includes the relevant error text.
Destructive actions (close-session, close-workspace) only when the user clearly asked.
For cwd use a full absolute path. If the user gives a relative path (like "Rooms\\Workrooms"), resolve it against their home directory or the active working directory -- pick whichever exists in context. If no path is specified, omit cwd.

Current state:
- Active working directory: ${activeCwd || 'unknown'}
- Focused session (what the user is looking at): ${scope?.focusedLabel ? `"${scope.focusedLabel}"` : 'none -- they are on the home screen'}
- Live sessions:
${sessionSummary}`
}

export async function* streamAnthropic(messages, { apiKey, tabs, activeCwd, scope }) {
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
      system: sedusiaSystemPrompt(tabs, activeCwd, scope),
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

export async function* streamOpenAI(messages, { apiKey, tabs, activeCwd, scope }) {
  const systemMsg = { role: 'system', content: sedusiaSystemPrompt(tabs, activeCwd, scope) }
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

export async function* streamAgentCli(messages, { tabs, activeCwd, scope, engine = 'auto', limitPolicy = 'ask' }) {
  if (!window.sush?.seduciaCli) throw new Error('CLI bridge unavailable')
  const system = sedusiaSystemPrompt(tabs, activeCwd, scope)
  const convo = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Seducia'}: ${m.content}`)
    .join('\n\n')
  const prompt = `${system}\n\n--- Conversation so far ---\n${convo}\n\nReply as Seducia now (1-3 sentences, plus ACTION lines if actions are needed):`

  const order = engine === 'auto' ? CLI_ENGINE_ORDER : [engine]
  const failures = []
  for (const id of order) {
    const res = await window.sush.seduciaCli({ prompt, cwd: activeCwd, engine: id, limitPolicy })
    if (res?.ok) {
      yield res.text
      // Surface account rotation so the user knows whose quota answered.
      if (res.switchedTo) yield `\n(limit hit -- switched to the "${res.switchedTo}" ${id} account)`
      if (res.engine && res.engine !== 'claude') yield `\nENGINE:${res.engine}`
      return
    }
    if (res?.canSwitch) {
      failures.push(`${id}: ${res.error} -- another ${id} account ("${res.canSwitch.label}") is available: switch in Settings > AI > Accounts, or set limit policy to Auto.`)
    } else {
      failures.push(`${id}: ${res?.error || 'failed'}`)
    }
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
    const limitPolicy = settings.cliLimitPolicy || 'ask'
    return (msgs, ctx) => streamAgentCli(msgs, { ...ctx, engine, limitPolicy })
  }
  if (settings.anthropicKey) return (msgs, ctx) => streamAnthropic(msgs, { apiKey: settings.anthropicKey, ...ctx })
  if (settings.openaiKey) return (msgs, ctx) => streamOpenAI(msgs, { apiKey: settings.openaiKey, ...ctx })
  return null
}
