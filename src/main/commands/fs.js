import { readdir, stat, readFile, writeFile, mkdir as fsMkdir } from 'fs/promises'
import { existsSync, statSync } from 'fs'
import { homedir } from 'os'
import { resolve, join } from 'path'
import { ok, err, ansi } from './_helpers'

export const ls = {
  name: 'ls',
  description: 'List files and directories',
  usage: 'ls [path]',
  async run([target], ctx) {
    const dir = resolve(ctx.cwd, target ?? '.')
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      if (!entries.length) return ok(ansi.dim('(empty)'))
      const lines = entries.map(e => {
        const isDir = e.isDirectory()
        const color = isDir ? ansi.cyan : ansi.white
        const suffix = isDir ? '/' : ''
        return color(e.name + suffix)
      })
      return ok(lines.join('  '))
    } catch {
      return err(`ls: cannot access '${dir}'`)
    }
  }
}

export const cat = {
  name: 'cat',
  description: 'Print file contents',
  usage: 'cat <file>',
  async run([file], ctx) {
    if (!file) return err('cat: missing file argument')
    const path = resolve(ctx.cwd, file)
    try {
      const content = await readFile(path, 'utf8')
      return ok(content)
    } catch {
      return err(`cat: ${file}: No such file`)
    }
  }
}

export const touch = {
  name: 'touch',
  description: 'Create an empty file',
  usage: 'touch <file>',
  async run([file], ctx) {
    if (!file) return err('touch: missing file name')
    const path = resolve(ctx.cwd, file)
    try {
      await writeFile(path, '', { flag: 'a' })
      return ok(ansi.green(`created: ${file}`))
    } catch (e) {
      return err(`touch: ${e.message}`)
    }
  }
}

export const mkdir = {
  name: 'mkdir',
  description: 'Create a directory',
  usage: 'mkdir <dir>',
  async run([dir], ctx) {
    if (!dir) return err('mkdir: missing directory name')
    const path = resolve(ctx.cwd, dir)
    try {
      await fsMkdir(path, { recursive: true })
      return ok(ansi.green(`created: ${dir}`))
    } catch (e) {
      return err(`mkdir: ${e.message}`)
    }
  }
}

export const size = {
  name: 'size',
  description: 'Show total size of a directory',
  usage: 'size <dir>',
  async run([dir], ctx) {
    if (!dir) return err('size: missing directory argument')
    const path = resolve(ctx.cwd, dir)
    try {
      const total = await getDirSize(path)
      return ok(`${ansi.cyan(dir)}: ${formatBytes(total)}`)
    } catch {
      return err(`size: cannot read '${dir}'`)
    }
  }
}

export const pwd = {
  name: 'pwd',
  description: 'Print working directory',
  usage: 'pwd',
  async run(_, ctx) {
    return ok(ctx.cwd)
  }
}

export const cd = {
  name: 'cd',
  description: 'Change working directory',
  usage: 'cd <path>',
  async run([target], ctx) {
    const next = target ? resolve(ctx.cwd, target) : homedir()
    const label = target ?? next
    if (!existsSync(next)) return err(`cd: no such directory: ${label}`)
    try {
      if (!statSync(next).isDirectory()) return err(`cd: not a directory: ${label}`)
    } catch {
      return err(`cd: cannot access: ${label}`)
    }
    return {
      ...ok(`changing directory: ${next}`),
      action: { name: 'passthrough', input: buildCdPassthrough(next), cwd: ctx.cwd }
    }
  }
}

export const typeCmd = {
  name: 'type',
  description: 'Create a file with inline content',
  usage: 'type <file> "<content>"',
  async run([file, ...rest], ctx) {
    if (!file) return err('type: missing file name')
    const content = rest.join(' ')
    const path = resolve(ctx.cwd, file)
    try {
      await writeFile(path, content, 'utf8')
      return ok(ansi.green(`written: ${file}`))
    } catch (e) {
      return err(`type: ${e.message}`)
    }
  }
}

async function getDirSize(dir) {
  let total = 0
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) total += await getDirSize(full)
      else { const s = await stat(full); total += s.size }
    }
  } catch {}
  return total
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function quotePowerShellPath(path) {
  return `'${String(path).replace(/'/g, "''")}'`
}

function quotePosixPath(path) {
  return `'${String(path).replace(/'/g, "'\\''")}'`
}

function buildCdPassthrough(next) {
  if (process.platform === 'win32') return `Set-Location -LiteralPath ${quotePowerShellPath(next)}`
  return `cd ${quotePosixPath(next)}`
}
