import si from 'systeminformation'
import { execSync } from 'child_process'
import { ok, err, ansi } from './_helpers'

export const top5 = {
  name: 'top5',
  description: 'Top 5 CPU and memory consuming processes',
  usage: 'top5',
  async run(_, ctx) {
    const procs = await si.processes()
    const byCpu = [...procs.list]
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 5)

    const header = ansi.bold(ansi.pink('TOP 5 PROCESSES'))
    const divider = ansi.dim('─'.repeat(55))
    const colHead = ansi.dim(`${'PID'.padEnd(8)}${'NAME'.padEnd(25)}${'CPU%'.padEnd(10)}MEM%`)
    const rows = byCpu.map(p =>
      `${String(p.pid).padEnd(8)}${p.name.slice(0, 23).padEnd(25)}${p.cpu.toFixed(1).padEnd(10)}${p.mem.toFixed(1)}`
    ).join('\r\n')
    return ok([header, divider, colHead, rows].join('\r\n'))
  }
}

export const sysinfo = {
  name: 'sysinfo',
  description: 'Show system information',
  usage: 'sysinfo',
  async run() {
    const [os, cpu, mem, disk] = await Promise.all([
      si.osInfo(), si.cpu(), si.mem(), si.fsSize()
    ])
    const totalDisk = disk.reduce((a, d) => a + d.size, 0)
    const usedDisk = disk.reduce((a, d) => a + d.used, 0)

    const lines = [
      ansi.bold(ansi.pink('SYSTEM INFO')),
      ansi.dim('─'.repeat(40)),
      `${ansi.cyan('OS        ')} ${os.distro} ${os.release} (${os.arch})`,
      `${ansi.cyan('Hostname  ')} ${os.hostname}`,
      `${ansi.cyan('CPU       ')} ${cpu.manufacturer} ${cpu.brand} × ${cpu.cores}`,
      `${ansi.cyan('RAM       ')} ${fmt(mem.used)} / ${fmt(mem.total)}`,
      `${ansi.cyan('Disk      ')} ${fmt(usedDisk)} / ${fmt(totalDisk)}`,
      `${ansi.cyan('Platform  ')} ${process.platform}`,
      `${ansi.cyan('Node      ')} ${process.version}`
    ]
    return ok(lines.join('\r\n'))
  }
}

export const envCmd = {
  name: 'env',
  description: 'Show or get environment variables',
  usage: 'env [get <key>]',
  async run([sub, key], ctx) {
    if (sub === 'get') {
      if (!key) return err('env get: missing key')
      const val = process.env[key]
      return val !== undefined
        ? ok(`${ansi.cyan(key)}=${val}`)
        : err(`env: '${key}' not set`)
    }
    const lines = Object.entries(process.env)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${ansi.cyan(k)}=${ansi.dim(v ?? '')}`)
    return ok(lines.join('\r\n'))
  }
}

export const scan = {
  name: 'scan',
  description: 'List active listening ports',
  usage: 'scan',
  async run() {
    try {
      const raw = execSync('netstat -ano -p TCP', { encoding: 'utf8' })
      const lines = raw.split('\n')
        .filter(l => l.includes('LISTENING'))
        .map(l => {
          const parts = l.trim().split(/\s+/)
          return `${ansi.pink(parts[1]?.padEnd(30) ?? '')}  PID: ${ansi.cyan(parts[4] ?? '')}`
        })
      if (!lines.length) return ok(ansi.dim('No listening ports found'))
      return ok([ansi.bold(ansi.pink('LISTENING PORTS')), ansi.dim('─'.repeat(50)), ...lines].join('\r\n'))
    } catch (e) {
      return err(`scan: ${e.message}`)
    }
  }
}

export const kill = {
  name: 'kill',
  description: 'Kill process on a port',
  usage: 'kill <port>',
  async run([port]) {
    const normalizedPort = normalizePort(port)
    if (!normalizedPort) return err('kill: missing or invalid port number')
    try {
      const raw = execSync(`netstat -ano -p TCP`, { encoding: 'utf8' })
      const pids = new Set()
      raw.split('\n').forEach(l => {
        const entry = parseListeningPortPid(l)
        if (entry?.port === normalizedPort) pids.add(entry.pid)
      })
      if (!pids.size) return err(`kill: nothing listening on port ${normalizedPort}`)
      for (const pid of pids) execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf8' })
      return ok(ansi.green(`killed process(es) on port ${normalizedPort}: ${[...pids].join(', ')}`))
    } catch (e) {
      return err(`kill: ${e.message}`)
    }
  }
}

export const shut = {
  name: 'shut',
  description: 'Kill all listening ports (confirms first)',
  usage: 'shut',
  async run() {
    return ok(ansi.yellow('Use: kill <port> to close a specific port. Run scan to see all ports.'))
  }
}

function fmt(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function normalizePort(port) {
  const raw = String(port ?? '').trim()
  if (!/^\d+$/.test(raw)) return null
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 65535) return null
  return String(value)
}

export function parseListeningPortPid(line) {
  if (!line.includes('LISTENING')) return null
  const parts = line.trim().split(/\s+/)
  const localAddress = parts[1]
  const pid = parts[4]
  const port = localAddress?.match(/:(\d+)$/)?.[1]
  if (!port || !/^\d+$/.test(pid ?? '')) return null
  return { port, pid }
}
