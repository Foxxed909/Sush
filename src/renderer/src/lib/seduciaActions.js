import { pathLabel, runningTargets, targetName, describeSessions, summarize } from './seducia'
import { agentById } from './agents'
import { normalizeEffort, normalizeModel } from './nightlyModels'
import { sanitizeLaunchAgents } from './seduciaSafety'

// Resolve a launch directory to one that actually exists. The AI guesses at
// relative paths ("Sandbox\ClaudeSandbox"); guessing wrong used to silently
// launch the swarm in the home directory. Try the path as given, then against
// the active cwd, then the home dir — first hit wins; no hit = no launch.
async function resolveLaunchCwd(requested, activeCwd) {
  const p = String(requested ?? '').trim().replace(/^["']|["']$/g, '')
  if (!p) return { ok: true, cwd: null }
  const home = await window.sush.homeDir?.().catch(() => null)
  // Platform-aware: this used to hardcode Windows semantics (drive-letter
  // absolutes, "\\" joins), so relative launches never resolved on
  // macOS/Linux — the joined candidate had a literal backslash in it.
  const sep = window.sush?.platform === 'win32' ? '\\' : '/'
  const isAbs = /^[a-zA-Z]:[\\/]|^\\\\/.test(p) || p.startsWith('/')
  const candidates = isAbs
    ? [p]
    : [
        ...(activeCwd ? [`${activeCwd}${sep}${p}`] : []),
        ...(home ? [`${home}${sep}${p}`] : []),
        p
      ]
  for (const c of candidates) {
    try {
      const r = await window.sush.dirExists({ path: c })
      if (r?.exists) return { ok: true, cwd: c }
    } catch {}
  }
  return { ok: false, requested: p }
}

// One executor for every Seducia action, shared by the orb and the docked
// panel. `ctx.tabs` is already scope-filtered (Project Seducia only sees its
// workspace); `ctx.controls` is App's control surface. Returns
// { text, readout? } — `readout` is raw session output that the AI loop can
// feed back to the model as a follow-up turn (so she can review agent work).
export async function applyAction(intent, ctx) {
  const {
    tabs = [], scope, controls = {}, activeCwd,
    onLaunch, onRun, onPrompt, onFocus, onOpenLauncher
  } = ctx
  const groupId = scope?.groupId || undefined

  switch (intent?.type) {
    case 'status':
      return { text: describeSessions(tabs) }

    case 'prompt': {
      const targets = runningTargets(tabs, intent.target)
      if (!targets.length) {
        return { text: `No ${targetName(intent.target)} running${scope?.kind === 'project' ? ' in this workspace' : ''} -- say "${intent.target === 'all' ? 'build team here' : intent.target + ' here'}" first.` }
      }
      onPrompt?.({ target: intent.target, text: intent.text, groupId })
      const where = targets.length > 1 ? ` (${targets.length} sessions)` : ''
      return { text: `Sent to ${targetName(intent.target)}${where}: "${intent.text}"` }
    }

    case 'focus': {
      const targets = runningTargets(tabs, intent.target)
      if (!targets.length) return { text: `No ${targetName(intent.target)} running.` }
      onFocus?.(intent.target, groupId)
      return { text: `Jumped to ${targetName(intent.target)}.` }
    }

    case 'launch': {
      const resolved = await resolveLaunchCwd(intent.cwd, activeCwd)
      if (!resolved.ok) {
        return { text: `I couldn't find a directory called "${resolved.requested}" (checked it as given, under the current directory, and under home). Give me the full path and I'll launch there.` }
      }
      const cwd = resolved.cwd || scope?.cwd || activeCwd
      // The agent list may have been written by a model: keep only catalogued
      // ids with validated count/model/effort; it can never supply a command.
      const { agents: safeAgents, dropped } = sanitizeLaunchAgents(intent.agents, { lookup: agentById, normalizeModel, normalizeEffort })
      if (!safeAgents.length) {
        return { text: `I can only launch agents Sush knows about${dropped.length ? ` (couldn't use: ${dropped.join(', ')})` : ''}. Add a custom agent in Settings first.` }
      }
      onLaunch?.({
        cwd,
        agents: safeAgents,
        groupLabel: intent.groupLabel,
        prompt: intent.prompt,
        // Project Seducia grows her own workspace instead of opening a new one.
        groupId
      })
      const tail = intent.prompt ? ' and briefing them' : ''
      const into = scope?.kind === 'project' ? ` into "${scope.label}"` : ` in ${pathLabel(cwd)}`
      return { text: `Spinning up ${summarize(safeAgents.map(a => ({ ...a, label: agentById(a.id)?.label || a.id })))}${into}${tail}.` }
    }

    case 'close-session': {
      const n = controls.closeSessions?.(intent.target || 'all', groupId) ?? 0
      return { text: n ? `Closed ${n} session${n === 1 ? '' : 's'}.` : `Nothing matching "${intent.target}" to close.` }
    }

    case 'close-workspace': {
      const name = intent.name || (scope?.kind === 'project' ? 'this' : '')
      const ok = controls.closeWorkspace?.(name)
      return { text: ok ? `Closed workspace${name && name !== 'this' ? ` "${name}"` : ''}.` : `No workspace called "${intent.name}".` }
    }

    case 'rename-workspace': {
      const name = intent.name || (scope?.kind === 'project' ? 'this' : '')
      const ok = controls.renameWorkspace?.(name, intent.to)
      return { text: ok ? `Renamed workspace to "${intent.to}".` : `Could not find that workspace to rename.` }
    }

    case 'theme': {
      const label = controls.setTheme?.(intent.name)
      return { text: label ? `Switched to ${label}.` : `No theme called "${intent.name}".` }
    }

    case 'read-output': {
      const reads = await (controls.readOutput?.(intent.target || 'all', groupId) ?? [])
      if (!reads.length) return { text: 'No matching sessions to read.' }
      return {
        text: `Read output from ${reads.length} session${reads.length === 1 ? '' : 's'}.`,
        readout: reads
      }
    }

    case 'open-launcher':
      onOpenLauncher?.()
      return { text: 'Opening the launcher.' }

    case 'run':
      onRun?.(intent.input)
      return { text: `Running "${intent.input}".` }

    default:
      return null
  }
}

// Format a readout for re-injection into the AI conversation.
export function formatReadout(reads) {
  return '[SESSION OUTPUT]\n' + reads
    .map(r => `## ${r.label} (${r.agentId})\n${r.text || '(no output captured)'}`)
    .join('\n\n')
}
