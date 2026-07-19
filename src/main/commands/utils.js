import { execFileSync } from 'child_process'
import { app, Notification } from 'electron'
import { ok, err, ansi } from './_helpers'
import { registry } from '../shell/registry'
import { getCredits, resetCredits } from '../credits'
import { getSttConfigPublic } from '../stt'
import { runtime } from '../shell/runtime'
import { getActiveUser } from '../users'

export const help = {
  name: 'help',
  description: 'List commands or show help for one command',
  usage: 'help [command]',
  async run([cmd]) {
    if (cmd) {
      const c = registry.get(cmd)
      if (!c) return err(`help: unknown command '${cmd}'`)
      return ok([
        ansi.bold(ansi.pink(c.name)),
        ansi.dim(c.description ?? ''),
        `Usage: ${ansi.cyan(c.usage ?? c.name)}`,
        c.aliases ? `Aliases: ${c.aliases.join(', ')}` : ''
      ].filter(Boolean).join('\r\n'))
    }

    const cmds = registry.all().sort((a, b) => a.name.localeCompare(b.name))
    const lines = cmds.map(c => `  ${ansi.pink(c.name.padEnd(12))} ${ansi.dim(c.description ?? '')}`)
    return ok([
      ansi.bold(ansi.pink('SUSH')) + ansi.dim(' - available commands'),
      ansi.dim('-'.repeat(50)),
      ...lines,
      '',
      ansi.dim('Type help <command> for details')
    ].join('\r\n'))
  }
}

export const clear = {
  name: 'clear',
  description: 'Clear the terminal',
  usage: 'clear',
  aliases: ['cls'],
  async run() {
    return { output: '\x1b[2J\x1b[H', type: 'clear' }
  }
}

export const version = {
  name: 'version',
  description: 'Show Sush version',
  usage: 'version',
  async run() {
    return ok([
      ansi.bold(ansi.pink('Sush')),
      `Version: ${ansi.cyan(app.getVersion())}`,
      `Shell:   ${ansi.dim('sh')}`,
      `Runtime: ${ansi.dim(process.version)}`
    ].join('\r\n'))
  }
}

export const notify = {
  name: 'notify',
  description: 'Send a system notification',
  usage: 'notify "<message>"',
  async run(args) {
    const msg = args.join(' ')
    if (!msg) return err('notify: missing message')
    // Use Electron's native, NON-blocking notification. The previous Windows path
    // popped a synchronous MessageBox via execFileSync, which froze the entire
    // app (main process blocked) until the user clicked OK.
    try {
      if (Notification.isSupported()) {
        new Notification({ title: 'Sush', body: msg, silent: false }).show()
        return ok(ansi.green(`notification sent: ${msg}`))
      }
      // Fallback for headless / unsupported environments.
      if (process.platform === 'darwin') {
        execFileSync('osascript', ['-e', `display notification "${msg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" with title "Sush"`])
      } else if (process.platform === 'linux') {
        execFileSync('notify-send', ['Sush', msg])
      } else {
        return err('notify: notifications are not supported on this system')
      }
      return ok(ansi.green(`notification sent: ${msg}`))
    } catch (e) {
      return err(`notify: ${e.message}`)
    }
  }
}

export const credits = {
  name: 'credits',
  description: 'Show your Quiet Credits dictation balance',
  usage: 'credits [reset]',
  aliases: ['quiet'],
  async run([sub]) {
    // `credits reset` refills the local meter — it's your own offline bucket,
    // so this is a dev/testing affordance, not a cheat around a server.
    const c = sub === 'reset' ? resetCredits() : getCredits()
    const mins = (s) => `${Math.round((Number(s) || 0) / 60)}m`
    const width = 24
    const usedPct = Math.min(1, (c.usedSec || 0) / Math.max(1, c.allowanceSec))
    const filled = Math.round(usedPct * width)
    const bar = ansi.pink('█'.repeat(filled)) + ansi.dim('░'.repeat(width - filled))
    let reset = ''
    try { reset = new Date(c.resetAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) } catch {}
    // Footer reflects the ACTUAL dictation setup — the old fixed "set a key"
    // line was wrong once a key existed, and doubly wrong on local whisper.cpp
    // (which needs no key and spends no credits at all).
    const stt = getSttConfigPublic()
    const footer = stt.provider === 'local'
      ? '  Dictation runs on local whisper.cpp — free, no credits spent.'
      : stt.hasKey
        ? '  Whisper key set. Cloud dictation spends this meter.'
        : '  Set a Whisper key in Settings ▸ Voice to enable dictation.'
    return ok([
      ansi.bold(ansi.pink('Quiet Credits')) + ansi.dim(`  ·  ${c.tier} plan`),
      ansi.dim('─'.repeat(42)),
      `  ${bar}`,
      `  ${ansi.cyan(mins(c.remainingSec))} left of ${mins(c.allowanceSec)} dictation this month`,
      ansi.dim(`  Refills ${reset || 'next month'}. Speak with the mic or Ctrl+Shift+S.`),
      ansi.dim(footer)
    ].join('\r\n'))
  }
}

export const hunt = {
  name: 'hunt',
  description: 'Search the output of every open session',
  usage: 'hunt <text>',
  aliases: ['searchall'],
  async run(args, ctx) {
    const term = args.join(' ').trim()
    if (!term) return err('hunt: what am I looking for? usage: hunt <text>')
    const store = runtime.scrollback
    if (!store) return err('hunt: scrollback store not ready yet')
    const active = getActiveUser()
    const results = store.search(term, { savedKeyPrefix: `u:${active?.id ?? 'solo'}:` })
    if (!results.length) return ok(ansi.dim(`No session output matches "${term}" (live or saved).`))
    const sessions = runtime.sessions
    // Turn a persisted restoreKey (u:<user>:<profile>:<shell>:<cwd>...) into
    // something readable — the trailing path segment of its cwd.
    const savedLabel = (key) => {
      const seg = String(key || '').split(/[\\/:]/).filter(Boolean).pop()
      return seg ? `${seg} (saved)` : 'saved session'
    }
    const blocks = results.map(({ tabId, key, saved, lines }) => {
      const label = saved ? savedLabel(key) : (sessions?.get?.(tabId)?.label || tabId)
      const marker = !saved && tabId === ctx.tabId ? ansi.dim(' (this session)') : ''
      const head = ansi.bold(ansi.pink(`▸ ${label}`)) + marker
      const body = lines.map(l => `  ${ansi.dim(String(l.line).padStart(5))}  ${l.text.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => ansi.pink(m))}`)
      return [head, ...body].join('\r\n')
    })
    const total = results.reduce((n, r) => n + r.lines.length, 0)
    const savedCount = results.filter(r => r.saved).length
    const note = savedCount ? ansi.dim(`  ·  ${savedCount} from closed sessions`) : ''
    return ok([
      ansi.dim(`${total} match${total === 1 ? '' : 'es'} across ${results.length} session${results.length === 1 ? '' : 's'}:`) + note,
      '',
      ...blocks
    ].join('\r\n'))
  }
}

export const alert = {
  name: 'alert',
  description: 'Show a colored alert banner in terminal',
  usage: 'alert "<message>"',
  async run(args) {
    const msg = args.join(' ')
    if (!msg) return err('alert: missing message')
    const bar = ansi.pink('!'.repeat(Math.min(msg.length + 4, 60)))
    return ok([bar, `  ${ansi.bold(ansi.yellow('!'))}  ${msg}`, bar].join('\r\n'))
  }
}
