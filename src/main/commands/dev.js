import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { writeFile, mkdir } from 'fs/promises'
import { resolve, join } from 'path'
import { promisify } from 'util'
import { ok, err, ansi } from './_helpers'

const execFileAsync = promisify(execFile)

export const proj = {
  name: 'proj',
  description: 'Scaffold a new project',
  usage: 'proj <name> <type>  (type: node | react | python | rust)',
  async run([name, type], ctx) {
    if (!name || !type) {
      const opts = ['node', 'react', 'python', 'rust'].map(t => ansi.cyan(t)).join(' | ')
      return ok(
        `${ansi.bold('proj')} — scaffold a project\r\n` +
        `Usage: ${ansi.pink('proj <name> <type>')}\r\n` +
        `Types: ${opts}`
      )
    }
    const dest = resolve(ctx.cwd, name)
    const scaffolds = {
      node: nodeScaffold,
      react: reactScaffold,
      python: pythonScaffold,
      rust: rustScaffold
    }
    const fn = scaffolds[type.toLowerCase()]
    if (!fn) return err(`proj: unknown type '${type}'. Use: node | react | python | rust`)
    await fn(dest, name)
    return ok(ansi.green(`scaffolded ${ansi.bold(type)} project → ${dest}`))
  }
}

export const launch = {
  name: 'launch',
  description: 'Open an application',
  usage: 'launch <app>',
  async run([app]) {
    if (!app) return err('launch: missing app name or path')
    // The name reaches cmd.exe's parser via `start` — refuse its metacharacters.
    if (/[&|<>^"%]/.test(app)) return err('launch: app name contains unsupported characters')
    try {
      if (process.platform === 'win32') {
        await execFileAsync('cmd', ['/c', 'start', '', app], { windowsHide: true })
      } else if (process.platform === 'darwin') {
        await execFileAsync('open', [app])
      } else {
        await execFileAsync('xdg-open', [app])
      }
      return ok(ansi.green(`launching: ${app}`))
    } catch (e) {
      return err(`launch: ${e.message}`)
    }
  }
}

export const docker = {
  name: 'docker',
  description: 'Run docker commands',
  usage: 'docker <subcommand> [args...]',
  async run(args, ctx) {
    if (!args.length) return ok(dockerHelp())
    try {
      const { stdout, stderr } = await execFileAsync('docker', args, { encoding: 'utf8', cwd: ctx.cwd, windowsHide: true })
      return ok((stdout + stderr).trimEnd())
    } catch (e) {
      return err(e.stderr || e.message)
    }
  }
}

export const pkg = {
  name: 'pkg',
  description: 'Universal package manager',
  usage: 'pkg <install|remove|list|update> [package]',
  async run([sub, ...rest], ctx) {
    if (!sub) return ok(pkgHelp())
    const pkgName = rest.join(' ')

    const needsName = ['install', 'remove', 'update']
    if (needsName.includes(sub) && !pkgName) return err(`pkg ${sub}: missing package name`)

    const managers = detectManagers(ctx.cwd)
    if (!managers.length) return err('pkg: no package manager detected in current directory')

    const mgr = managers[0]
    const cmds = {
      npm: { install: ['npm', 'install', pkgName], remove: ['npm', 'uninstall', pkgName], list: ['npm', 'list', '--depth=0'], update: ['npm', 'update', pkgName] },
      pip: { install: ['pip', 'install', pkgName], remove: ['pip', 'uninstall', '-y', pkgName], list: ['pip', 'list'], update: ['pip', 'install', '--upgrade', pkgName] },
      cargo: { install: ['cargo', 'add', pkgName], remove: ['cargo', 'remove', pkgName], list: ['cargo', 'tree', '--depth', '1'], update: ['cargo', 'update', pkgName] },
      choco: { install: ['choco', 'install', pkgName, '-y'], remove: ['choco', 'uninstall', pkgName, '-y'], list: ['choco', 'list', '--local-only'], update: ['choco', 'upgrade', pkgName, '-y'] }
    }
    const cmdArgs = cmds[mgr]?.[sub]
    if (!cmdArgs) return err(`pkg: unknown subcommand '${sub}'`)
    if (pkgName && !/^[@a-zA-Z0-9._/ =~^<>-]+$/.test(pkgName)) {
      return err(`pkg ${sub}: package name contains unsupported characters`)
    }
    try {
      let [file, ...args] = cmdArgs.filter(Boolean)
      // npm is npm.cmd on Windows; execFile can't spawn a .cmd without a
      // shell, so route it through `cmd /c` (pkgName is validated above).
      if (file === 'npm' && process.platform === 'win32') {
        args = ['/c', 'npm', ...args]
        file = 'cmd'
      }
      const { stdout, stderr } = await execFileAsync(file, args, { encoding: 'utf8', cwd: ctx.cwd, windowsHide: true })
      return ok(`${ansi.dim(`[${mgr}]`)} ${(stdout + stderr).trimEnd()}`)
    } catch (e) {
      return err(e.stderr || e.message)
    }
  }
}

export function detectManagers(cwd, platform = process.platform) {
  const mgrs = []
  if (existsSync(join(cwd, 'package.json'))) mgrs.push('npm')
  if (existsSync(join(cwd, 'requirements.txt')) || existsSync(join(cwd, 'setup.py'))) mgrs.push('pip')
  if (existsSync(join(cwd, 'Cargo.toml'))) mgrs.push('cargo')
  // Chocolatey is a Windows machine package manager, not a universal fallback.
  // On macOS/Linux an unrecognized directory should report that honestly rather
  // than trying to spawn a command that normally cannot exist there.
  if (!mgrs.length && platform === 'win32') mgrs.push('choco')
  return mgrs
}

async function nodeScaffold(dest, name) {
  await mkdir(dest, { recursive: true })
  await mkdir(join(dest, 'src'), { recursive: true })
  await writeFile(join(dest, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'src/index.js', scripts: { start: 'node src/index.js' } }, null, 2))
  await writeFile(join(dest, 'src/index.js'), `console.log('${name} running')\n`)
  await writeFile(join(dest, '.gitignore'), 'node_modules\n')
}

async function reactScaffold(dest, name) {
  if (/[&|<>^%"]/.test(dest)) throw new Error('project path contains unsupported characters')
  await mkdir(dest, { recursive: true })
  const npmArgs = ['create', 'vite@latest', dest, '--', '--template', 'react']
  // npm is npm.cmd on Windows — execFile can't spawn a .cmd without a shell.
  const [file, args] = process.platform === 'win32'
    ? ['cmd', ['/c', 'npm', ...npmArgs]]
    : ['npm', npmArgs]
  await execFileAsync(file, args, { windowsHide: true })
}

async function pythonScaffold(dest, name) {
  await mkdir(dest, { recursive: true })
  await mkdir(join(dest, name.replace(/-/g, '_')), { recursive: true })
  await writeFile(join(dest, 'main.py'), `def main():\n    print("${name}")\n\nif __name__ == "__main__":\n    main()\n`)
  await writeFile(join(dest, 'requirements.txt'), '')
  await writeFile(join(dest, '.gitignore'), '__pycache__\n*.pyc\n.venv\n')
}

async function rustScaffold(dest, name) {
  await execFileAsync('cargo', ['new', dest], { windowsHide: true })
}

function dockerHelp() {
  return [
    ansi.bold('docker') + ' — available subcommands',
    ansi.dim('─'.repeat(35)),
    `  ${ansi.cyan('docker ps')}          list containers`,
    `  ${ansi.cyan('docker images')}      list images`,
    `  ${ansi.cyan('docker stop <id>')}   stop a container`,
    `  ${ansi.cyan('docker rm <id>')}     remove container`,
    `  ${ansi.cyan('docker build .')}     build from Dockerfile`,
    `  ${ansi.cyan('docker pull <img>')}  pull an image`
  ].join('\r\n')
}

function pkgHelp() {
  return [
    ansi.bold('pkg') + ' — universal package manager',
    ansi.dim('─'.repeat(35)),
    `  ${ansi.cyan('pkg install <name>')}   install a package`,
    `  ${ansi.cyan('pkg remove <name>')}    remove a package`,
    `  ${ansi.cyan('pkg update <name>')}    update a package`,
    `  ${ansi.cyan('pkg list')}             list installed packages`
  ].join('\r\n')
}
