import { execFile, execSync } from 'child_process'
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
    try {
      await execFileAsync('cmd', ['/c', 'start', '', app], { windowsHide: true })
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
    const cmd = `docker ${args.join(' ')}`
    try {
      const out = execSync(cmd, { encoding: 'utf8', cwd: ctx.cwd })
      return ok(out.trimEnd())
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
    const managers = detectManagers(ctx.cwd)
    if (!managers.length) return err('pkg: no package manager detected in current directory')

    const mgr = managers[0]
    const cmds = {
      npm: { install: `npm install ${pkgName}`, remove: `npm uninstall ${pkgName}`, list: 'npm list --depth=0', update: `npm update ${pkgName}` },
      pip: { install: `pip install ${pkgName}`, remove: `pip uninstall -y ${pkgName}`, list: 'pip list', update: `pip install --upgrade ${pkgName}` },
      cargo: { install: `cargo add ${pkgName}`, remove: `cargo remove ${pkgName}`, list: 'cargo tree --depth 1', update: `cargo update ${pkgName}` },
      choco: { install: `choco install ${pkgName} -y`, remove: `choco uninstall ${pkgName} -y`, list: 'choco list --local-only', update: `choco upgrade ${pkgName} -y` }
    }
    const action = cmds[mgr]?.[sub]
    if (!action) return err(`pkg: unknown subcommand '${sub}'`)
    try {
      const out = execSync(action, { encoding: 'utf8', cwd: ctx.cwd })
      return ok(`${ansi.dim(`[${mgr}]`)} ${out.trimEnd()}`)
    } catch (e) {
      return err(e.stderr || e.message)
    }
  }
}

function detectManagers(cwd) {
  const { existsSync } = require('fs')
  const mgrs = []
  if (existsSync(join(cwd, 'package.json'))) mgrs.push('npm')
  if (existsSync(join(cwd, 'requirements.txt')) || existsSync(join(cwd, 'setup.py'))) mgrs.push('pip')
  if (existsSync(join(cwd, 'Cargo.toml'))) mgrs.push('cargo')
  if (!mgrs.length) mgrs.push('choco')
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
  await mkdir(dest, { recursive: true })
  execSync(`npm create vite@latest "${dest}" -- --template react`, { stdio: 'ignore' })
}

async function pythonScaffold(dest, name) {
  await mkdir(dest, { recursive: true })
  await mkdir(join(dest, name.replace(/-/g, '_')), { recursive: true })
  await writeFile(join(dest, 'main.py'), `def main():\n    print("${name}")\n\nif __name__ == "__main__":\n    main()\n`)
  await writeFile(join(dest, 'requirements.txt'), '')
  await writeFile(join(dest, '.gitignore'), '__pycache__\n*.pyc\n.venv\n')
}

async function rustScaffold(dest, name) {
  execSync(`cargo new "${dest}"`, { stdio: 'ignore' })
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
