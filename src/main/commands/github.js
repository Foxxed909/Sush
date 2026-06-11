import { listRepos, getWork, getNotifications } from '../github-api'
import { ok, err, ansi } from './_helpers'

// Keyboard-first views over the same GitHub client that powers the panel.
// Commands run in main, so the token never goes anywhere near the renderer.

const NOT_CONNECTED = 'github: not connected. Open the GitHub panel to connect, or run `gh auth login` in a session.'

function guard(res) {
  if (res.ok) return null
  if (res.error === 'not-connected') return err(NOT_CONNECTED)
  if (res.error === 'rate-limited') {
    const when = res.resetAt ? new Date(res.resetAt).toLocaleTimeString() : 'soon'
    return err(`github: rate limited, try again after ${when}`)
  }
  if (res.error === 'offline') return err('github: could not reach GitHub. Are you online?')
  return err(`github: ${res.error}`)
}

function ago(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  if (!isFinite(ms) || ms < 0) return ''
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function itemLine(it) {
  return `  ${ansi.cyan(`${it.repo}#${it.number}`)}  ${it.title}  ${ansi.dim(ago(it.updatedAt))}`
}

export const repos = {
  name: 'repos',
  description: 'List or search your GitHub repos',
  usage: 'repos [query]',
  async run(args) {
    const res = await listRepos({ query: args.join(' ') })
    const guarded = guard(res)
    if (guarded) return guarded
    if (!res.repos.length) return ok(ansi.dim('no repositories found'))
    const lines = res.repos.map(r => {
      const priv = r.private ? ` ${ansi.yellow('private')}` : ''
      const stars = r.stars ? ansi.dim(` *${r.stars}`) : ''
      const desc = r.description ? `  ${ansi.dim(r.description.slice(0, 60))}` : ''
      return `  ${ansi.cyan(r.fullName)}${priv}${stars}${desc}`
    })
    lines.push('', ansi.dim('clone <owner/repo> to bring one down'))
    return ok(lines.join('\r\n'))
  }
}

export const prs = {
  name: 'prs',
  description: 'Your open PRs and review requests',
  usage: 'prs',
  async run() {
    const res = await getWork()
    const guarded = guard(res)
    if (guarded) return guarded
    const lines = []
    lines.push(ansi.bold('Your open PRs'))
    lines.push(...(res.prs.length ? res.prs.map(itemLine) : [ansi.dim('  none')]))
    lines.push('', ansi.bold('Waiting on your review'))
    lines.push(...(res.reviewRequests.length ? res.reviewRequests.map(itemLine) : [ansi.dim('  none')]))
    return ok(lines.join('\r\n'))
  }
}

export const issues = {
  name: 'issues',
  description: 'Open GitHub issues assigned to you',
  usage: 'issues',
  async run() {
    const res = await getWork()
    const guarded = guard(res)
    if (guarded) return guarded
    if (!res.issues.length) return ok(ansi.dim('no issues assigned to you'))
    return ok(res.issues.map(itemLine).join('\r\n'))
  }
}

export const notifs = {
  name: 'notifs',
  description: 'Unread GitHub notifications',
  usage: 'notifs',
  aliases: ['inbox'],
  async run() {
    const res = await getNotifications({})
    const guarded = guard(res)
    if (guarded) return guarded
    if (res.connected === false) return err(NOT_CONNECTED)
    const unread = res.notifications.filter(n => n.unread)
    if (!unread.length) return ok(ansi.green('inbox zero'))
    const lines = unread.map(n =>
      `  ${ansi.yellow(n.reason)}  ${ansi.cyan(n.repo)}  ${n.title.slice(0, 70)}  ${ansi.dim(ago(n.updatedAt))}`
    )
    lines.push('', ansi.dim('open the GitHub panel to mark them read'))
    return ok(lines.join('\r\n'))
  }
}
