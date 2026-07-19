import { quoteShellPath } from './shellQuote'

export function normalizeSshPort(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return '22'
  if (!/^\d+$/.test(raw)) return null
  const port = Number(raw)
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? String(port) : null
}

export function normalizeSshProfiles(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter(profile => profile && typeof profile === 'object' && String(profile.host ?? '').trim())
    .map((profile, index) => {
      const user = String(profile.user || '').trim()
      const host = String(profile.host || '').trim()
      const port = normalizeSshPort(profile.port)
      if (!port) return null
      return {
        id: String(profile.id || `ssh-${Date.now()}-${index}`),
        label: String(profile.label || '').trim() || `${user ? `${user}@` : ''}${host}`,
        user,
        host,
        port,
        keyPath: String(profile.keyPath || '').trim()
      }
    })
    .filter(Boolean)
}

export function buildSshCommand(profile, { platform = 'linux', shellId = '' } = {}) {
  const host = String(profile?.host ?? '').trim()
  const user = String(profile?.user ?? '').trim()
  const keyPath = String(profile?.keyPath ?? '').trim()
  const port = normalizeSshPort(profile?.port)
  if (!host || !port) return null
  // quoteShellPath intentionally assumes a real Windows path cannot contain a
  // double quote. These fields are typed text, so reject that character before
  // constructing a cmd.exe command rather than letting it terminate quoting.
  if (platform === 'win32' && String(shellId).toLowerCase() === 'cmd' && [host, user, keyPath].some(value => value.includes('"'))) return null

  const quote = value => quoteShellPath(value, { platform, shellId })
  const args = []
  if (port !== '22') args.push('-p', port)
  if (keyPath) args.push('-i', quote(keyPath))
  // End option parsing before the destination so a host beginning with '-'
  // cannot be interpreted as another ssh flag.
  args.push('--', quote(user ? `${user}@${host}` : host))
  return `ssh ${args.join(' ')}`
}
