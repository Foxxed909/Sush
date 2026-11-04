// First-run harness: the launch splash and the onboarding flow, against the
// BUILT renderer with a stubbed IPC surface that has no users yet.
//
//   npx electron-vite build && node tools/shot-onboarding.mjs [outDir]
//
// Asserts the flow waits for GitHub (the old create form could be submitted
// while the device flow was still pending) and that the PIN confirm step
// rejects a mismatch.
import { createServer } from 'http'
import { readFileSync, mkdirSync, existsSync } from 'fs'
import { extname, isAbsolute, join, relative, resolve } from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = join(root, 'out', 'renderer')
const outDir = resolve(process.argv[2] || join(root, 'shots', 'onboarding'))
mkdirSync(outDir, { recursive: true })
if (!existsSync(join(dist, 'index.html'))) { console.error('run `npx electron-vite build` first'); process.exit(1) }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  try {
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname
    const file = resolve(dist, `.${decodeURIComponent(pathname === '/' ? '/index.html' : pathname)}`)
    const inside = relative(dist, file)
    if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('outside')
    const body = readFileSync(file)
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404); res.end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${server.address().port}/`

const stub = () => {
  const oauth = []
  window.__oauth = oauth
  window.__created = []
  window.__emitOauth = (ev) => oauth.forEach(fn => fn(ev))
  const answers = {
    platform: 'win32',
    appVersion: async () => '4.11.0',
    usersList: async () => ({ users: [], active: null, lastUserId: null }),
    usersCreate: async (form) => { window.__created.push(form); sessionStorage.setItem('__created', JSON.stringify(form)); return { ok: true, user: { id: 'u9', name: form.name, color: form.color } } },
    usersActivate: async () => ({ ok: true }),
    onOauthEvent: (fn) => { oauth.push(fn); return () => { const i = oauth.indexOf(fn); if (i >= 0) oauth.splice(i, 1) } },
    oauthGitHubStart: async () => {
      setTimeout(() => window.__emitOauth({ provider: 'github', phase: 'device-code', userCode: 'WXYZ-1234', verificationUri: 'https://github.com/login/device' }), 50)
      return { ok: true }
    },
    oauthGitHubCancel: async () => { window.__emitOauth({ provider: 'github', phase: 'cancelled' }); return { ok: true } },
    openExternal: async ({ url }) => { window.__opened = url; return { ok: true } },
    copyText: async () => ({ ok: true })
  }
  window.sush = new Proxy(answers, {
    get(target, prop) {
      if (prop in target) return target[prop]
      if (typeof prop === 'string' && prop.startsWith('on')) return () => () => {}
      return async () => ({ ok: true })
    }
  })
  // The real create reloads into the new profile; the harness stays put.
  try { Object.defineProperty(window.location, 'reload', { value: () => { window.__reloaded = true } }) } catch {}
}

const browserPath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  chromium.executablePath(),
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome'
].filter(Boolean).find(existsSync)
if (!browserPath) { server.close(); console.error('Chromium not found'); process.exit(1) }
const browser = await chromium.launch({ executablePath: browserPath })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', e => { errors.push(e.message); console.log('[pageerror]', e.message) })
await page.addInitScript(stub)
const shot = async (name) => { await page.screenshot({ path: join(outDir, `${name}.png`) }); console.log('✓', name) }

// Freeze timers so the splash can be photographed frame by frame: every CSS
// animation is paused and scrubbed to the same timeline position.
await page.clock.install()
await page.goto(url)
await page.locator('.splash').waitFor({ state: 'attached', timeout: 4000 })
for (const [ms, name] of [[160, 's1-mark'], [420, 's2-finger'], [760, 's3-cursors'], [1100, 's4-word'], [1300, 's5-meta']]) {
  await page.evaluate((t) => document.getAnimations().forEach(a => { a.pause(); a.currentTime = t }), ms)
  await shot(name)
}
await page.evaluate(() => document.getAnimations().forEach(a => a.play()))
await page.clock.runFor(1700)
await page.clock.resume()
await page.locator('.splash').waitFor({ state: 'detached', timeout: 4000 })
await page.locator('.onb-root').waitFor({ state: 'visible', timeout: 4000 })
await page.waitForTimeout(400)
await shot('o1-name-empty')
await page.locator('.onb-input').fill('Anmol')
await page.locator('.onb-swatch').nth(1).click()
await page.waitForTimeout(400)
await shot('o2-name-filled')
await page.locator('button', { hasText: 'Continue' }).click()
await page.waitForTimeout(450)
await shot('o3-pin')
await page.keyboard.type('1234')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
await page.keyboard.type('1235')
await page.keyboard.press('Enter')
await page.waitForTimeout(120)
await shot('o4-pin-mismatch')
if (!(await page.locator('.onb-error').count())) throw new Error('PIN mismatch did not show an error')
await page.waitForTimeout(500)
await page.keyboard.type('1234')
await page.keyboard.press('Enter')
await page.waitForTimeout(600)
await shot('o5-signin')
if (!(await page.locator('.onb-method').count())) throw new Error('Sign-in step did not render')
await page.locator('.onb-method', { hasText: 'GitHub' }).click()
await page.waitForTimeout(400)
await shot('o6-github-waiting')
await page.locator('button', { hasText: 'Open github.com' }).click()
await page.waitForTimeout(800)
if (await page.evaluate(() => window.__created.length)) throw new Error('Opening github.com created a profile before GitHub finished')
if (!(await page.locator('.onb-code').isVisible())) throw new Error('Flow moved on while GitHub was still waiting')
await page.evaluate(() => window.__emitOauth({ provider: 'github', phase: 'success', mode: 'signin', user: null, ticket: 't-1', profile: { login: 'anmol-dev', name: 'Anmol' } }))
await page.waitForTimeout(500)
await shot('o7-done')
const summary = await page.locator('.onb-summary').innerText()
if (!/GitHub/.test(summary) || !/anmol-dev/.test(summary)) throw new Error(`Done screen lost the GitHub link: ${summary}`)
await page.locator('button', { hasText: 'Open Sush' }).click()
await page.waitForTimeout(800)
const created = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__created') || 'null'))
if (!created || created.name !== 'Anmol' || created.pin !== '1234' || created.providerTicket !== 't-1') throw new Error(`Create got the wrong form: ${JSON.stringify(created)}`)

// Reduced motion: the splash is a quiet fade, under a second.
const reduced = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
await reduced.addInitScript(stub)
const t0 = Date.now()
await reduced.goto(url)
await reduced.locator('.onb-root').waitFor({ state: 'visible', timeout: 4000 })
await reduced.locator('.splash').waitFor({ state: 'detached', timeout: 4000 })
const took = Date.now() - t0
if (took > 2000) throw new Error(`Reduced-motion splash took ${took}ms`)

await browser.close()
server.close()
if (errors.length) { console.error('page errors:', errors); process.exit(1) }
console.log('done →', outDir)
