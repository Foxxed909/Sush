import { execFileSync } from 'child_process'
import { app, Notification } from 'electron'
import { ok, err, ansi } from './_helpers'
import { registry } from '../shell/registry'

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
        execFileSync('osascript', ['-e', `display notification "${msg.replace(/"/g, '\\"')}" with title "Sush"`])
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
