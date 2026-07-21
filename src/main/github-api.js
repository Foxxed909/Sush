import { spawn } from 'child_process'
import { getActiveUser, activeUserEnv, userHomeDir } from './users'
import { resolveExecutable, shimSpawnSpec } from './exec'
import { getToken, encryptionAvailable } from './oauth/tokenStore'
import { getOauthConfig } from './oauth/config'
import { syncGitHubCliToken } from './oauth/github-cli-auth'

// GitHub REST client for the ACTIVE identity. Token resolution prefers the
// identity's gh CLI login (GH_CONFIG_DIR redirection makes `gh auth token`
// return THEIR login, not the host's), then the device-flow vault. Tokens
// stay in main — the renderer only ever sees mapped list data.

const API = 'https://api.github.com'
const TOKEN_TTL = 5 * 60 * 1000
const GH_MISS_TTL = 60 * 1000   // don't spawn gh on every poll after a miss

let tokenCache = null            // { userId, token, source, at }
const ghMissAt = new Map()       // userId -> last gh-cli miss timestamp
const etagCache = new Map()      // `${userId}:${key}` -> { etag, data }
const inflight = new Map()       // single-flight guard per cache key

export function clearGitHubCache() {
  tokenCache = null
  ghMissAt.clear()
  etagCache.clear()
  inflight.clear()
}

function ghCliToken() {
  return new Promise(resolve => {
    const bin = resolveExecutable('gh')
    if (!bin) return resolve(null)
    const { file, args } = shimSpawnSpec(bin, ['auth', 'token'])
    let out = ''
    let child
    try {
      child = spawn(file, args, { env: { ...process.env, ...activeUserEnv() }, windowsHide: true })
    } catch {
      return resolve(null)
    }
    const timer = setTimeout(() => { try { child.kill() } catch {} ; resolve(null) }, 8000)
    child.stdout.on('data', d => { out += d })
    child.on('error', () => { clearTimeout(timer); resolve(null) })
    child.on('close', code => {
      clearTimeout(timer)
      resolve(code === 0 && out.trim() ? out.trim() : null)
    })
  })
}

async function resolveGitHubToken() {
  const user = getActiveUser()
  if (!user) return null
  const now = Date.now()
  if (tokenCache && tokenCache.userId === user.id && now - tokenCache.at < TOKEN_TTL) return tokenCache
  if (now - (ghMissAt.get(user.id) || 0) > GH_MISS_TTL) {
    const cliToken = await ghCliToken()
    if (cliToken) {
      tokenCache = { userId: user.id, token: cliToken, source: 'gh-cli', at: now }
      return tokenCache
    }
    ghMissAt.set(user.id, now)
  }
  const vaultToken = getToken(user.id, 'github')
  if (vaultToken) {
    // Repair identities connected before Sush learned to hand the OAuth token
    // to gh. This runs only after gh auth token missed, never exposes the token
    // to the renderer, and leaves the vault as the fallback if gh is absent.
    const synced = await syncGitHubCliToken({ token: vaultToken, configDir: `${userHomeDir(user.id)}/.gh` })
    if (synced.ok) ghMissAt.delete(user.id)
    tokenCache = { userId: user.id, token: vaultToken, source: 'device', at: now }
    return tokenCache
  }
  return null
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Sush-Terminal'
  }
}

async function ghFetch(path, { etagKey } = {}) {
  const resolved = await resolveGitHubToken()
  if (!resolved) return { ok: false, error: 'not-connected' }
  const headers = authHeaders(resolved.token)
  const key = etagKey ? `${resolved.userId}:${etagKey}` : null
  const cached = key ? etagCache.get(key) : null
  if (cached?.etag) headers['If-None-Match'] = cached.etag

  let res
  try {
    res = await fetch(API + path, { headers })
  } catch {
    return { ok: false, error: 'offline' }
  }

  if (res.status === 304 && cached) return { ok: true, data: cached.data, headers: res.headers }
  if (res.status === 401) {
    // Stale or revoked token: drop the cache so the next call re-resolves
    // (giving the other source its chance).
    tokenCache = null
    return { ok: false, error: 'not-connected' }
  }
  if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
    const resetAt = Number(res.headers.get('x-ratelimit-reset') || 0) * 1000
    return { ok: false, error: 'rate-limited', rateLimited: true, resetAt }
  }
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json())?.message || '' } catch {}
    return { ok: false, error: detail || `GitHub returned ${res.status}` }
  }
  let data = null
  try { data = await res.json() } catch {}
  if (key) etagCache.set(key, { etag: res.headers.get('etag') || '', data })
  return { ok: true, data, headers: res.headers }
}

function singleFlight(key, fn) {
  if (inflight.has(key)) return inflight.get(key)
  const p = fn().finally(() => {
    // A user switch can clear the map and start a new request with the same
    // logical key before this older request settles. Never delete the newer one.
    if (inflight.get(key) === p) inflight.delete(key)
  })
  inflight.set(key, p)
  return p
}

export async function getGitHubStatus() {
  const cfg = getOauthConfig()
  const base = {
    configured: {
      github: !!cfg.github.clientId,
      google: !!(cfg.google.clientId && cfg.google.clientSecret)
    },
    safeStorage: encryptionAvailable()
  }
  if (!getActiveUser()) return { ...base, connected: false, source: null }
  const resolved = await resolveGitHubToken()
  if (!resolved) return { ...base, connected: false, source: null }
  const me = await ghFetch('/user', { etagKey: 'user' })
  if (!me.ok) return { ...base, connected: me.error !== 'not-connected', source: resolved.source, error: me.error }
  return { ...base, connected: true, source: resolved.source, login: me.data?.login || '' }
}

export function listRepos({ query, page = 1 } = {}) {
  const q = String(query ?? '').trim()
  const p = Math.max(1, Number(page) || 1)
  return singleFlight(`repos:${q}:${p}`, async () => {
    // Plain text searches YOUR repos (it's a repo browser, not GitHub-wide
    // search). Queries with qualifiers or owner/name slashes go out as-is.
    let scoped = q
    if (q && !/[:/]/.test(q)) {
      const me = await ghFetch('/user', { etagKey: 'user' })
      const login = me.ok ? me.data?.login : ''
      if (login) scoped = `${q} user:${login} fork:true`
    }
    const path = q
      ? `/search/repositories?q=${encodeURIComponent(scoped)}&per_page=30&page=${p}`
      : `/user/repos?sort=pushed&per_page=30&page=${p}`
    const res = await ghFetch(path, { etagKey: `repos:${q}:${p}` })
    if (!res.ok) return res
    const items = q ? (res.data?.items || []) : (res.data || [])
    return {
      ok: true,
      repos: items.map(r => ({
        fullName: r.full_name,
        description: r.description || '',
        private: !!r.private,
        stars: r.stargazers_count || 0,
        language: r.language || '',
        updatedAt: r.pushed_at || r.updated_at || '',
        htmlUrl: r.html_url
      }))
    }
  })
}

function mapSearchItem(it) {
  return {
    repo: (it.repository_url || '').split('/repos/')[1] || '',
    number: it.number,
    title: it.title,
    htmlUrl: it.html_url,
    updatedAt: it.updated_at,
    draft: !!it.draft
  }
}

export function getWork() {
  return singleFlight('work', async () => {
    const search = async (q, etagKey) => {
      const res = await ghFetch(`/search/issues?q=${encodeURIComponent(q)}&per_page=20`, { etagKey })
      return res.ok ? { ok: true, items: (res.data?.items || []).map(mapSearchItem) } : res
    }
    const [prs, reviews, issues] = await Promise.all([
      search('is:open is:pr author:@me archived:false', 'work:prs'),
      search('is:open is:pr review-requested:@me archived:false', 'work:reviews'),
      search('is:open is:issue assignee:@me archived:false', 'work:issues')
    ])
    const failed = [prs, reviews, issues].find(r => !r.ok)
    if (failed) return failed
    return { ok: true, prs: prs.items, reviewRequests: reviews.items, issues: issues.items }
  })
}

// The notification subject URL is an API URL; turn it into the web page.
function threadWebUrl(n) {
  const api = n.subject?.url || ''
  if (!api) return n.repository?.html_url || ''
  return api
    .replace('https://api.github.com/repos/', 'https://github.com/')
    .replace('/pulls/', '/pull/')
}

export function getNotifications({ all = false } = {}) {
  return singleFlight(`notifs:${!!all}`, async () => {
    const res = await ghFetch(`/notifications${all ? '?all=true' : ''}`, { etagKey: `notifs:${!!all}` })
    if (!res.ok) {
      // Not connected is the normal state for non-GitHub users — the badge
      // poll must be a cheap no-op, not an error.
      if (res.error === 'not-connected') return { ok: true, notifications: [], unreadCount: 0, connected: false }
      return res
    }
    const list = (res.data || []).map(n => ({
      id: n.id,
      reason: n.reason,
      unread: !!n.unread,
      title: n.subject?.title || '',
      type: n.subject?.type || '',
      repo: n.repository?.full_name || '',
      updatedAt: n.updated_at,
      htmlUrl: threadWebUrl(n)
    }))
    const pollSeconds = Number(res.headers?.get?.('x-poll-interval')) || 60
    return { ok: true, notifications: list, unreadCount: list.filter(n => n.unread).length, pollSeconds, connected: true }
  })
}

export async function markNotificationRead(id) {
  const resolved = await resolveGitHubToken()
  if (!resolved) return { ok: false, error: 'not-connected' }
  try {
    const res = await fetch(`${API}/notifications/threads/${encodeURIComponent(String(id))}`, {
      method: 'PATCH',
      headers: authHeaders(resolved.token)
    })
    // Drop notification ETags so the next poll refetches fresh state.
    for (const key of [...etagCache.keys()]) {
      if (key.includes(':notifs:')) etagCache.delete(key)
    }
    return res.ok ? { ok: true } : { ok: false, error: `GitHub returned ${res.status}` }
  } catch {
    return { ok: false, error: 'offline' }
  }
}
