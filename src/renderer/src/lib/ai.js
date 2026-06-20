// Seducia's AI plumbing. There is ONE provider now: the logged-in agent CLI
// (Claude / Codex / Gemini), driven over stdin in the main process — it rides
// the user's existing subscription, so no API key is ever pasted or stored.
// The old direct-to-Anthropic / direct-to-OpenAI HTTP streamers (which needed
// a key) were removed with the plan tiers.

import { AGENTS } from './agents'

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
If the user says "gather thoughts", "ask questions", "what am I trying to achieve", "challenge Claude", or similar, prompt Claude to infer the goal, ask pointed clarifying questions, call out weak assumptions, contradictions, missing success criteria, and propose one next action. Be hard-nosed but do not shame, manipulate, or gaslight.
Destructive actions (close-session, close-workspace) only when the user clearly asked.
For cwd use a full absolute path. If the user gives a relative path (like "Rooms\\Workrooms"), resolve it against their home directory or the active working directory -- pick whichever exists in context. If no path is specified, omit cwd.

Current state:
- Active working directory: ${activeCwd || 'unknown'}
- Focused session (what the user is looking at): ${scope?.focusedLabel ? `"${scope.focusedLabel}"` : 'none -- they are on the home screen'}
- Live sessions:
${sessionSummary}`
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
//
// Must mirror CHAT_ENGINES in main (ipc.js): only stdin-driven engines belong
// here. OpenCode is intentionally excluded — it has no stdin mode, so it's a
// launchable agent / account provider only, never a chat driver. Main also
// rejects any unsupported engine rather than misrouting it to claude.
const CLI_ENGINE_ORDER = ['claude', 'codex', 'gemini']

export async function* streamAgentCli(messages, { tabs, activeCwd, scope, engine = 'auto' }) {
  if (!window.sush?.seduciaCli) throw new Error('CLI bridge unavailable')
  const system = sedusiaSystemPrompt(tabs, activeCwd, scope)
  const convo = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Seducia'}: ${m.content}`)
    .join('\n\n')
  const prompt = `${system}\n\n--- Conversation so far ---\n${convo}\n\nReply as Seducia now (1-3 sentences, plus ACTION lines if actions are needed):`

  const order = engine === 'auto' ? CLI_ENGINE_ORDER : [engine]
  const failures = []
  for (const id of order) {
    // No limitPolicy sent: it's per-CLI now and lives with the account data,
    // so main resolves it for this engine. Helpers (cliComplete) still pass
    // 'never' explicitly to opt out of rotation.
    const res = await window.sush.seduciaCli({ prompt, cwd: activeCwd, engine: id })
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

// Seducia's streamer: always the logged-in agent CLI (no key path). Returns
// null only when the CLI bridge isn't wired (non-Electron / preload missing).
export function getStreamer(settings = {}) {
  if (typeof window === 'undefined' || !window.sush?.seduciaCli) return null
  const engine = settings.seduciaCliEngine || 'auto'
  // Limit policy is per-CLI now (stored with the account data); main resolves
  // it per engine, so it's no longer read from global settings here.
  return (msgs, ctx) => streamAgentCli(msgs, { ...ctx, engine })
}

// One-shot text completion via the logged-in CLI, for the small AI helpers
// (commit messages, command explainer) that used to hit the Anthropic/OpenAI
// APIs with a pasted key. `limitPolicy: 'never'` — a helper shouldn't burn an
// account rotation. Returns the trimmed reply, or null on failure.
export async function cliComplete(prompt, { cwd, engine = 'auto' } = {}) {
  if (typeof window === 'undefined' || !window.sush?.seduciaCli) return null
  const order = engine === 'auto' ? CLI_ENGINE_ORDER : [engine]
  for (const id of order) {
    try {
      const res = await window.sush.seduciaCli({ prompt, cwd, engine: id, limitPolicy: 'never' })
      if (res?.ok && res.text) return String(res.text).trim()
    } catch {}
  }
  return null
}
