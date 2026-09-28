// Screenshot harness: renders the BUILT renderer (out/renderer) in headless
// Chromium with a stubbed `window.sush` IPC surface, walks the main screens,
// and writes PNGs. No Electron needed — this is a pure-renderer visual check
// for design review and release notes.
//
//   npx electron-vite build && node tools/shot.mjs [outDir]
//
// NOTE (PRIVATE.md watchlist): the stub below mirrors the preload surface via
// a Proxy — update the explicit entries when a screen needs realistic data,
// otherwise the Proxy answers `{ ok: true }` and the screen renders empty.
import { createServer } from 'http'
import { readFileSync, mkdirSync, existsSync } from 'fs'
import { extname, isAbsolute, join, relative, resolve } from 'path'
import { fileURLToPath } from 'url'

import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const appVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const dist = join(root, 'out', 'renderer')
const cliArgs = process.argv.slice(2)
const plansOnly = cliArgs.includes('--plans-only')
const explicitOutDir = cliArgs.find(arg => arg !== '--plans-only')
const outDir = resolve(explicitOutDir || join(root, 'shots'))
mkdirSync(outDir, { recursive: true })
if (!existsSync(join(dist, 'index.html'))) {
  console.error('out/renderer missing — run `npx electron-vite build` first')
  process.exit(1)
}

// ── Tiny static server (ES modules don't load over file://) ────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  try {
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname
    const requested = decodeURIComponent(pathname === '/' ? '/index.html' : pathname)
    const file = resolve(dist, `.${requested}`)
    const inside = relative(dist, file)
    if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('outside renderer root')
    const body = readFileSync(file)
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404); res.end()
  }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${server.address().port}/`

// ── window.sush stub ─────────────────────────────────────────────────────────
// Explicit answers for the calls that shape the UI; a Proxy catches the rest.
const stub = `
(() => {
  const now = Date.now()
  const user = { id: 'u1', name: 'Taylor', color: '#ff6b9d', avatar: 'T', hasPin: false, isolation: 'cli', createdAt: now - 86400e3, lastUsedAt: now }
  const credits = { tier: 'enterprise', allowanceSec: 600000, usedSec: 4200, remainingSec: 595800, resetAt: now + 20 * 86400e3, period: '2026-07' }
  const ptyListeners = []
  const stateListeners = []
  const DEMO = [
    '\\u001b[38;2;255;107;157m\\u001b[1m   _____ _    _  _____ _    _\\r\\n  / ____| |  | |/ ____| |  | |\\r\\n | (___ | |  | | (___ | |__| |\\r\\n  \\\\___ \\\\| |  | |\\\\___ \\\\|  __  |\\r\\n  ____) | |__| |____) | |  | |\\r\\n |_____/ \\\\____/|_____/|_|  |_|\\u001b[0m\\r\\n',
    '\\u001b[2m  v${appVersion} · Helm  ·  bash · sush\\u001b[0m\\r\\n\\r\\n',
    '\\u001b[38;2;255;107;157m@ sush $ \\u001b[0mnpm test\\r\\n',
    '\\r\\n\\u001b[32m✓\\u001b[0m test suite passed\\r\\n',
    '\\r\\n\\u001b[38;2;255;107;157m@ sush $ \\u001b[0mclaude\\r\\n',
    '\\u001b[2m╭──────────────────────────────────────╮\\u001b[0m\\r\\n\\u001b[2m│\\u001b[0m  \\u001b[38;2;217;119;87mClaude Code\\u001b[0m — ready in ~/sush      \\u001b[2m│\\u001b[0m\\r\\n\\u001b[2m╰──────────────────────────────────────╯\\u001b[0m\\r\\n',
    '\\u001b[2m│\\u001b[0m > working on: fix the flaky scrollback test…\\r\\n'
  ]
  const answers = {
    platform: 'win32',
    usersList: async () => ({ users: [user], active: user, lastUserId: 'u1' }),
    usersActivate: async () => ({ ok: true, user }),
    licenseGet: async () => ({ tier: 'enterprise', expiry: null,
      features: { slots: 50, gridCap: 32, customAgents: true, cloudTts: true, usageGuard: true, autoHandoff: true, providerConnect: true, developerWorkflows: true, themes: 'all', fleetSeats: 20, privateFleet: true },
      tiers: {
        free:  { slots: 1,  gridCap: 4,  customAgents: false, cloudTts: false, usageGuard: false, autoHandoff: false, providerConnect: false, developerWorkflows: false, themes: 'base' },
        plus:  { slots: 4,  gridCap: 9,  customAgents: true,  cloudTts: true,  usageGuard: false, autoHandoff: false, providerConnect: true,  developerWorkflows: false, themes: 'all' },
        dev:   { slots: 5,  gridCap: 10, customAgents: true,  cloudTts: true,  usageGuard: false, autoHandoff: false, providerConnect: true,  developerWorkflows: true, themes: 'all' },
        pro:   { slots: 6,  gridCap: 12, customAgents: true,  cloudTts: true,  usageGuard: true,  autoHandoff: false, providerConnect: true,  developerWorkflows: false, themes: 'all' },
        ultra: { slots: 10, gridCap: 20, customAgents: true,  cloudTts: true,  usageGuard: true,  autoHandoff: true,  providerConnect: true,  developerWorkflows: false, themes: 'all' },
        max:   { slots: 16, gridCap: 25, customAgents: true,  cloudTts: true,  usageGuard: true,  autoHandoff: true,  providerConnect: true,  developerWorkflows: true, themes: 'all' },
        enterprise: { slots: 50, gridCap: 32, customAgents: true, cloudTts: true, usageGuard: true, autoHandoff: true, providerConnect: true, developerWorkflows: true, themes: 'all', fleetSeats: 20, privateFleet: true }
      } }),
    creditsGet: async () => credits,
    claudeLimitsGet: async () => ({ ok: true, limits: { status: 'allowed', rateLimitType: '', resetsAt: now + 3600e3, sessionPct: 42, weekPct: 18, at: now } }),
    batteryStatus: async () => ({ ok: true, hasBattery: true, percent: 74, charging: false }),
    startPty: async ({ tabId }) => {
      setTimeout(() => {
        let i = 0
        const drip = () => {
          if (i >= DEMO.length) return
          ptyListeners.forEach(fn => fn({ tabId, data: DEMO[i] }))
          i++; setTimeout(drip, 60)
        }
        drip()
      }, 250)
      return { pid: 4242, shell: 'bash -l', shellId: 'bash', shellLabel: 'bash', cwd: '/home/taylor/sush', profileId: 'powershell', status: 'running', lastActiveAt: now }
    },
    getScrollback: async () => ({ text: 'npm test\\ntest suite passed\\n' }),
    snippetsList: async () => ({ ok: true, snippets: [ { name: 'deploy', command: 'npm run deploy' }, { name: 'wtree', command: 'git worktree list' } ] }),
    checkClis: async ({ names } = {}) => ({ found: Object.fromEntries((names || []).map(n => [n, n === 'claude' || n === 'codex'])) }),
    accountsList: async () => ({ ok: true, providers: {
      claude: { active: 'default', limitPolicy: 'ask', slots: [ { id: 'default', label: 'Personal', lastLimitAt: null, usage: { status: 'allowed', sessionPct: 42, weekPct: 18, at: now }, usageHistory: [] }, { id: 'acct-2', label: 'Work', lastLimitAt: now - 7200e3, usage: null, usageHistory: [] } ] },
      codex: { active: 'default', limitPolicy: 'auto', slots: [ { id: 'default', label: 'Default', lastLimitAt: null, usage: null, usageHistory: [] } ] },
      gemini: { active: 'default', limitPolicy: 'ask', slots: [ { id: 'default', label: 'Default', lastLimitAt: null, usage: null, usageHistory: [] } ] },
      opencode: { active: 'default', limitPolicy: 'ask', slots: [ { id: 'default', label: 'Default', lastLimitAt: null, usage: null, usageHistory: [] } ] }
    } }),
    usageSnapshot: async () => ({ ok: true, signedIn: true,
      claude: { installed: true, account: { label: 'Personal', lastLimitAt: null, count: 2, usage: { status: 'allowed', sessionPct: 42, weekPct: 18, at: now } }, limits: { ok: true, limits: { status: 'allowed', sessionPct: 42, weekPct: 18, resetsAt: now + 3600e3, at: now } } },
      codex: { installed: true, account: { label: 'Default', lastLimitAt: null, count: 1 } },
      gemini: { installed: false, account: null },
      opencode: { installed: false, account: null } }),
    githubNotifications: async () => ({ ok: true, notifications: [], unreadCount: 3, connected: true }),
    githubStatus: async () => ({ configured: { github: true, google: false }, safeStorage: true, connected: true, source: 'gh-cli', login: 'taylor' }),
    gitStatus: async () => ({ repo: true, dir: '/home/taylor/sush', branch: 'main', files: [ { status: 'M', rawStatus: ' M', path: 'src/App.jsx' }, { status: '??', rawStatus: '??', path: 'notes.md' } ] }),
    sttConfigGet: async () => ({ provider: 'local', model: '', hasKey: false, localBin: 'C:/Users/Taylor/AppData/Roaming/sush/whisper/whisper-cli.exe', localModel: 'C:/Users/Taylor/AppData/Roaming/sush/whisper/models/ggml-base.en.bin', localStatus: { ready: true, missing: [], managedBin: 'C:/Users/Taylor/AppData/Roaming/sush/whisper/whisper-cli.exe', managedModel: 'C:/Users/Taylor/AppData/Roaming/sush/whisper/models/ggml-base.en.bin' }, safeStorage: true, defaults: { openai: { model: 'whisper-1' }, local: { model: 'base.en' } }, credits }),
    ttsConfigGet: async () => ({ provider: 'system', hasKey: false, voice: '', model: '', safeStorage: true }),
    getAllCommands: async () => ([
      { name: 'hunt', description: 'Search the output of every open session', usage: 'hunt <text>', aliases: ['searchall'] },
      { name: 'credits', description: 'Show your Quiet Credits dictation balance', usage: 'credits [reset]', aliases: ['quiet'] },
      { name: 'doctor', description: 'Check the Sush workspace environment', usage: 'doctor', aliases: [] },
      { name: 'jwt', description: 'Decode a JSON Web Token', usage: 'jwt <token>', aliases: [] }
    ]),
    sushrcRead: async () => ({ ok: true, path: '~/.sushrc', exists: true, content: '# ~/.sushrc\\nprompt = pink\\n\\n[alias]\\ngs = git status\\ndev = npm run dev\\n' }),
    appVersion: async () => '${appVersion}',
    homeDir: async () => '/home/taylor',
    listDir: async ({ path } = {}) => ({ path: path || '', entries: [ { name: 'sush', dir: true }, { name: 'notes.md', dir: false } ], exists: true }),
    sessionStats: async () => ({ sessions: 1, uptime: 4210, memoryMB: 182 }),
    getSystemStatsLite: async () => ({ cpu: { load: 23 }, memory: { total: 16e9, used: 9.2e9, available: 6.8e9 }, uptime: 4210 }),
    connectStatus: async () => ({ claude: { connected: true, account: 'taylor@example.com', expiresAt: now + 86400e3, expired: false, hasRefresh: true }, codex: { connected: false }, gemini: { connected: false } }),
    oauthConfigGet: async () => ({ github: { clientId: '' }, google: { clientId: '', hasSecret: false }, safeStorage: true }),
    getNpmScripts: async () => ({ ok: true, name: 'sush', scripts: { dev: 'electron-vite dev', test: 'vitest run', build: 'electron-vite build' } }),
    tasksRead: async () => ({ ok: true, file: '', tasks: [] }),
    memoryList: async () => ({ dir: '', notes: [] }),
    getPorts: async () => ({ ok: true, ports: [ { port: '5173', address: '127.0.0.1', pid: 812, process: 'node', protocol: 'tcp' } ] }),
    dockerPs: async () => ({ ok: true, containers: [] }),
    getTabMeta: async () => ({}),
    newTab: async ({ cwd } = {}) => ({ cwd: cwd || '/home/taylor' }),
    readFile: async ({ path } = {}) => String(path || '').replace(/\\\\/g, '/').endsWith('.sush/crew.json')
      ? { ok: true, content: JSON.stringify({ name: 'Sush dev crew', counts: { claude: 2, shell: 1 }, brief: 'Fix the flaky scrollback test, then run the suite.' }) }
      : { ok: false, error: 'not found' },
    huntSearch: async ({ term } = {}) => ({ ok: true, results: term && term.length >= 2 ? [
      { tabId: 'tab-1', label: 'sush', lines: [ { line: 12, text: '✓ test suite passed — ' + term + ' ok' }, { line: 31, text: 'claude: searching for ' + term + ' in src/' } ] },
      { key: 'u:u1:powershell:powershell:c:/users/taylor/docs', saved: true, label: 'docs', lines: [ { line: 3, text: 'npm ERR! ' + term + ' script missing' } ] }
    ] : [] }),
    onPtyData: (fn) => { ptyListeners.push(fn); return () => {} },
    onPtyState: (fn) => { stateListeners.push(fn); return () => {} },
    onClaudePanelEvent: (fn) => {
      const t = setTimeout(() => {
        fn({ panelId: 'nightly-demo', kind: 'init', cwd: '/home/taylor/sush', model: 'claude-sonnet-5', sessionId: 'demo-session' })
        fn({ panelId: 'nightly-demo', kind: 'usage', contextTokens: 28640, outputTokens: 1337 })
      }, 600)
      return () => clearTimeout(t)
    }
  }
  window.sush = new Proxy(answers, {
    get(target, prop) {
      if (prop in target) return target[prop]
      if (typeof prop === 'string' && prop.startsWith('on')) return () => () => {}
      return async () => ({ ok: true })
    }
  })
  try {
    sessionStorage.setItem('sush-skip-splash', '1')
    localStorage.setItem('sush-active-user', 'u1')
    localStorage.setItem('u:u1::sush-last-seen-version', '${appVersion}')
    localStorage.setItem('u:u1::sush-session-layout', JSON.stringify({
      activeKey: 'powershell:powershell:/home/taylor/sush:sess-demo',
      tabs: [{
        label: 'Claude Code',
        profileId: 'powershell',
        profileLabel: 'PowerShell',
        shell: 'powershell',
        shellLabel: 'PowerShell',
        cwd: '/home/taylor/sush',
        bootCommand: 'claude --model sonnet --effort high',
        agentId: 'claude',
        model: 'sonnet',
        effort: 'high',
        tag: 'sess-demo',
        groupId: 'grp-demo',
        groupLabel: 'Sush dev',
        startedAt: now - 180000,
        lastActiveAt: now - 5000
      }, {
        label: 'Codex Review',
        profileId: 'powershell',
        profileLabel: 'PowerShell',
        shell: 'powershell',
        shellLabel: 'PowerShell',
        cwd: '/home/taylor/sush',
        bootCommand: 'codex --model gpt-5.3-codex',
        agentId: 'codex',
        model: 'gpt-5.3-codex',
        effort: 'high',
        tag: 'sess-review',
        groupId: 'grp-demo',
        groupLabel: 'Sush dev',
        startedAt: now - 120000,
        lastActiveAt: now - 12000
      }]
    }))
  } catch {}
})()
`

const browserCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  chromium.executablePath(),
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe')
].filter(Boolean)
const browserPath = browserCandidates.find(existsSync)
if (!browserPath) {
  server.close()
  console.error('Chromium not found. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE or run `npx playwright-core install chromium`.')
  process.exit(1)
}
const browser = await chromium.launch({ executablePath: browserPath })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
await page.addInitScript(stub)
page.on('pageerror', e => console.error('[pageerror]', e.message))
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)

const shot = async (name) => {
  await page.waitForTimeout(450)
  await page.screenshot({ path: join(outDir, `${name}.png`) })
  console.log('✓', name)
}

// 1 — Home dashboard (the default view)
await shot('01-home')

// 2 — Terminal view: click the first session in the rail
await page.keyboard.press('Control+1').catch(() => {})
await page.waitForTimeout(1400)
await shot('02-terminal')

// Agent lifecycle regression: duplicate + close + reopen must preserve the
// provider/model/effort identity instead of degrading into a plain shell.
const baseThreadCount = await page.locator('.nightly-thread-row').count()
await page.keyboard.press('Control+Shift+d')
await page.waitForTimeout(700)
if (await page.locator('.nightly-thread-row').count() !== baseThreadCount + 1) {
  throw new Error('Nightly duplicate did not create a second session')
}
let chromeText = await page.locator('.nightly-topbar').innerText()
if (!chromeText.includes('sonnet') || !chromeText.includes('high')) {
  throw new Error('Nightly duplicate lost model/effort metadata')
}
await page.keyboard.press('Control+w')
await page.waitForTimeout(450)
await page.keyboard.press('Control+Shift+t')
await page.waitForTimeout(750)
if (await page.locator('.nightly-thread-row').count() !== baseThreadCount + 1) {
  throw new Error('Nightly reopen did not restore the closed agent session')
}
chromeText = await page.locator('.nightly-topbar').innerText()
if (!chromeText.includes('sonnet') || !chromeText.includes('high')) {
  throw new Error('Nightly reopen lost model/effort metadata')
}
await shot('02a-agent-lifecycle')
await page.keyboard.press('Control+w')
await page.waitForTimeout(450)
await page.keyboard.press('Control+1').catch(() => {})
await page.waitForTimeout(500)

// 2b — Account / usage popover in the Nightly title chrome.
const accountChip = page.locator('.nightly-account-chip').first()
if (await accountChip.count()) {
  await accountChip.click()
  await page.locator('.nightly-account-popover').waitFor({ state: 'visible' })
  await shot('02b-account-usage')
  await page.keyboard.press('Escape').catch(() => {})
  await page.mouse.click(800, 500)
}

// 2c — Workspace layout presets.
const layoutButton = page.locator('.nightly-layout-menu > button').first()
if (await layoutButton.count()) {
  await layoutButton.click()
  await page.locator('.nightly-layout-popover').waitFor({ state: 'visible' })
  await shot('02c-layout-menu')
  await page.locator('.nightly-layout-popover').getByText('Split', { exact: true }).click()
  await page.waitForTimeout(500)
  await shot('02d-split')

  await layoutButton.click()
  await page.locator('.nightly-layout-popover').getByText('Grid', { exact: true }).click()
  await page.waitForTimeout(500)
  await shot('02e-grid')

  await layoutButton.click()
  await page.locator('.nightly-layout-popover').getByText('Focus', { exact: true }).click()
  await page.waitForTimeout(350)
}

// 3 — Command palette
await page.keyboard.press('Control+p')
await shot('03-palette')
await page.keyboard.press('Escape')

// 4 — Nightly Overview (Mission Control evolved into a canvas layout)
await page.locator('.nightly-rail-actions').getByRole('button', { name: 'Overview', exact: true }).click()
await shot('04-overview')

// Return to the active session, then open the focused contextual inspector.
await page.keyboard.press('Control+1').catch(() => {})
await page.waitForTimeout(500)

// 5 — Focused right inspector
await page.keyboard.press('Control+b')
await page.waitForTimeout(250)
{
  const center = await page.locator('.nightly-topbar-center').boundingBox()
  const actions = await page.locator('.nightly-topbar-actions').boundingBox()
  if (center && actions && center.x + center.width > actions.x + 1) {
    throw new Error('Nightly topbar metadata overlaps its action controls with the inspector open')
  }
}
await shot('05-inspector')
await page.keyboard.press('Control+b')

// 6 — Settings
await page.keyboard.press('Control+,')
await shot('06-settings')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
// Close settings if Escape didn't (click the backdrop-ish close button)
await page.evaluate(() => { document.querySelector('[title="Close"], [aria-label="Close"]')?.click() })

// 7 — Plans page
await page.evaluate(() => window.dispatchEvent(new CustomEvent('sush:open-plans')))
await shot('07-plans')
await page.locator('.sush-fan-card[aria-pressed="true"]').screenshot({ path: join(outDir, '07-enterprise.png') })
console.log('✓', '07-enterprise')
await page.keyboard.press('Escape')
await page.evaluate(() => { document.querySelector('[title="Close"], [aria-label="Close"]')?.click() })

// The six-card deck switches to the same vertical card layout before it can
// crowd a compact window. Capture it independently from the desktop fan.
await page.setViewportSize({ width: 900, height: 900 })
await page.evaluate(() => window.dispatchEvent(new CustomEvent('sush:open-plans')))
await shot('07-plans-narrow')
await page.keyboard.press('Escape')
await page.evaluate(() => { document.querySelector('[title="Close"], [aria-label="Close"]')?.click() })
await page.setViewportSize({ width: 1440, height: 900 })

if (plansOnly) {
  await browser.close()
  server.close()
  console.log('done →', outDir)
  process.exit(0)
}

// Plans has several nested interactive surfaces. Reload before the launcher so
// a stale backdrop can never mask the next visual assertion.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

// 8 — New session launcher with provider model/reasoning controls visible.
await page.keyboard.press('Control+Shift+n')
const launcher = page.locator('.sush-backdrop').filter({ hasText: 'Agents & tools' }).last()
await launcher.getByText('Claude Code', { exact: true }).click()
await page.waitForTimeout(250)
await shot('08-launcher-models')
await page.keyboard.press('Escape')

// 9 — Changelog
await page.evaluate(() => window.dispatchEvent(new CustomEvent('sush:open-changelog')))
await shot('09-changelog')
await page.keyboard.press('Escape')   // ChangelogPage closes on Esc
await page.waitForTimeout(300)

// 10 — Hunt overlay (Ctrl+Shift+F) with a live query. Fresh reload first so
// no stray modal from the walk above holds focus.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.keyboard.press('Control+Shift+f')
await page.waitForTimeout(350)
await page.keyboard.type('test', { delay: 40 })
await page.waitForTimeout(600)
await shot('10-hunt')
await page.keyboard.press('Escape')

// 11-12 — Identity manager + destructive Fresh Start confirmation. Keep these
// in the visual walk so reset controls cannot silently regress off-screen.
await page.locator('[title="Signed in as Taylor"]').click()
await page.getByText('Manage users…', { exact: true }).click()
await shot('11-users')
await page.getByText('Start fresh…', { exact: true }).click()
await shot('12-fresh-start')

await browser.close()
server.close()
console.log('done →', outDir)
