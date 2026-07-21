import { spawn } from 'child_process'
import { mkdirSync } from 'fs'
import { resolveExecutable, shimSpawnSpec } from '../exec'

// Keep the OAuth access token off argv and out of logs. gh accepts it through
// stdin and persists it in the active Sush identity's GH_CONFIG_DIR.
export function githubCliLoginSpec(token, configDir) {
  const value = String(token || '').trim()
  const dir = String(configDir || '').trim()
  if (!value) return { ok: false, error: 'No GitHub token is available for this identity.' }
  if (!dir) return { ok: false, error: 'No GitHub CLI config directory is available for this identity.' }
  return {
    ok: true,
    // --git-protocol prevents gh from asking a second interactive question
    // after it consumes the token from stdin.
    args: ['auth', 'login', '--hostname', 'github.com', '--with-token', '--git-protocol', 'https'],
    env: { GH_CONFIG_DIR: dir },
    input: `${value}\n`
  }
}

function firstUsefulLine(text) {
  return String(text || '').split(/\r?\n/).map(line => line.trim()).find(Boolean) || ''
}

export function syncGitHubCliToken({ token, configDir, timeoutMs = 20000 } = {}) {
  const spec = githubCliLoginSpec(token, configDir)
  if (!spec.ok) return Promise.resolve(spec)
  const bin = resolveExecutable('gh')
  if (!bin) return Promise.resolve({ ok: false, error: 'GitHub CLI (gh) was not found on PATH.' })
  try { mkdirSync(spec.env.GH_CONFIG_DIR, { recursive: true }) } catch {}

  const { file, args } = shimSpawnSpec(bin, spec.args)
  return new Promise(resolve => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let child
    let timer = null
    const done = (result) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      try { child?.kill() } catch {}
      resolve(result)
    }
    try {
      child = spawn(file, args, {
        windowsHide: true,
        env: { ...process.env, ...spec.env },
        stdio: ['pipe', 'pipe', 'pipe']
      })
      child.stdin.end(spec.input)
    } catch (e) {
      return done({ ok: false, error: e.message })
    }
    timer = setTimeout(() => done({ ok: false, error: 'gh auth login timed out after 20 seconds.' }), timeoutMs)
    child.stdout.on('data', d => { stdout = (stdout + d).slice(-3000) })
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-3000) })
    child.on('error', e => done({ ok: false, error: e.message }))
    child.on('close', code => {
      if (code === 0) return done({ ok: true })
      const detail = firstUsefulLine(`${stderr}\n${stdout}`)
      done({ ok: false, error: detail ? `gh auth login failed: ${detail}` : `gh auth login exited ${code}.` })
    })
  })
}
