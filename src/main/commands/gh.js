import { execFile } from 'child_process'
import { promisify } from 'util'
import { ok, err, ansi } from './_helpers'

const execFileAsync = promisify(execFile)

export const gh = {
  name: 'gh',
  description: 'GitHub CLI commands',
  usage: 'gh <clone|repo|pr|issue|status> [args...]',
  async run([sub, ...args], ctx) {
    if (!sub) return ok(ghHelp())
    try {
      const { stdout } = await execFileAsync('gh', [sub, ...args], {
        encoding: 'utf8',
        cwd: ctx.cwd,
        windowsHide: true,
        timeout: 60000
      })
      return ok(stdout.trimEnd() || ansi.dim('(no output)'))
    } catch (e) {
      const msg = (e.stderr || e.message || '').trim()
      if (msg.includes('not logged in') || msg.includes('not found')) {
        return err(`gh: ${msg}\r\n${ansi.dim('Tip: run `gh auth login` in a real terminal first')}`)
      }
      return err(`gh: ${msg}`)
    }
  }
}

function ghHelp() {
  return [
    ansi.bold('gh') + ' — GitHub CLI',
    ansi.dim('─'.repeat(40)),
    `  ${ansi.cyan('gh clone <user/repo>')}    clone a repository`,
    `  ${ansi.cyan('gh repo list')}             list your repos`,
    `  ${ansi.cyan('gh repo create')}           create a new repo`,
    `  ${ansi.cyan('gh pr list')}               list open pull requests`,
    `  ${ansi.cyan('gh pr view <n>')}           view a pull request`,
    `  ${ansi.cyan('gh issue list')}            list open issues`,
    `  ${ansi.cyan('gh issue create')}          create a new issue`,
    `  ${ansi.cyan('gh status')}                your open PRs and issues`,
    `  ${ansi.cyan('gh run list')}              list CI runs`,
    `  ${ansi.cyan('gh release list')}          list releases`,
    ansi.dim('\r\nAll standard gh flags work. Pipe with | not yet supported.')
  ].join('\r\n')
}
