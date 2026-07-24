// Boot the built Air and drive it, headless.
//
// Unit tests cover the pure layers. This covers what they cannot reach: that
// the app starts, that the bridge is the shape the renderer expects, that a
// real shell appears, and that a `:` command typed into the real input element
// does what it says. Four defects in Air's first version were findable only
// this way — all of them React state handling that reads correctly and behaves
// otherwise.
//
//   npm run build && npm run verify
//
// CommonJS on purpose. An ESM entry point with a top-level `await
// app.whenReady()` deadlocks under Electron: the await parks the module graph
// before the ready event can be dispatched, and the process hangs with no
// output at all. Cost an afternoon; hence this paragraph.

const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')
const { homedir } = require('node:os')
const { existsSync, readFileSync, writeFileSync, unlinkSync } = require('node:fs')

// The import flow only has anything to show when a Sush profile exists, so the
// harness writes one — including the two entries that are supposed to arrive
// switched off. Any existing .sushrc is stashed and put back in a finally, so
// running this on a machine you actually work on does not eat your aliases.
const SUSHRC = join(homedir(), '.sushrc')
const FIXTURE = `prompt = pink
cwd = ${homedir()}

[alias]
gs = git status

[env]
EDITOR = code
GITHUB_TOKEN = ghp_notarealtoken

[startup]
doctor
rm -rf ./build
`
const hadSushrc = existsSync(SUSHRC)
const previousSushrc = hadSushrc ? readFileSync(SUSHRC, 'utf8') : null

function restoreSushrc() {
  try {
    if (hadSushrc) writeFileSync(SUSHRC, previousSushrc, 'utf8')
    else if (existsSync(SUSHRC)) unlinkSync(SUSHRC)
  } catch {}
}

writeFileSync(SUSHRC, FIXTURE, 'utf8')
process.on('exit', restoreSushrc)

const checks = []
const failures = []

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  checks.push(ok
    ? `ok   ${name}`
    : `FAIL ${name}\n       expected ${JSON.stringify(expected)}\n       got      ${JSON.stringify(actual)}`)
  if (!ok) failures.push(name)
}

const wait = (ms) => new Promise(r => setTimeout(r, ms))

// Progress on stderr, so a stall names the step it stalled on. A harness that
// hangs silently teaches you nothing; one that prints its last step tells you
// where to look.
const step = (name) => process.stderr.write(`· ${name}\n`)

// Nothing here should take ninety seconds. If something does, exit with the
// pending step on screen rather than pinning a CI runner.
setTimeout(() => {
  process.stderr.write('\n!! verify timed out\n')
  process.exit(2)
}, 90_000).unref()

// Booting the real entry point, not a hand-rolled copy of it. If index.js
// changes how it names the app or registers its handlers, this harness inherits
// the change instead of quietly testing a fiction.
require(join(__dirname, '../out/main/index.js'))

async function main() {
  step('waiting for ready')
  await app.whenReady()
  await wait(600)

  const [win] = BrowserWindow.getAllWindows()
  if (!win) {
    process.stderr.write('!! no window was created\n')
    process.exit(2)
  }

  const errors = []
  win.webContents.on('console-message', (event) => {
    // Electron 43 passes an object; older versions passed positional args.
    const level = event?.level ?? arguments[1]
    const message = event?.message ?? arguments[2]
    if (level === 'error' || level >= 2) errors.push(String(message))
  })

  step('waiting for load')
  if (win.webContents.isLoading()) {
    await new Promise(resolve => win.webContents.once('did-finish-load', resolve))
  }
  step('waiting for a prompt')
  await wait(2500)

  const js = (code) => win.webContents.executeJavaScript(code, true)

  // Type into the real input element and press Enter, the way a person would.
  // The element is re-queried each time on purpose: `:zen` unmounts the input
  // row, so a held reference goes stale and every later command silently goes
  // nowhere.
  const run = async (line) => {
    await js(`(() => {
      const input = document.querySelector('input.air-input')
      if (!input) return 'no-input'
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, ${JSON.stringify(line)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      return 'ok'
    })()`)
    await wait(280)
  }

  const escape = async () => {
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await wait(220)
  }

  const sessions = () => js(`document.querySelectorAll('.air-tab:not(.air-tab-new)').length`)
  const flash = () => js(`document.querySelector('.air-flash')?.textContent ?? null`)

  // ── It starts, and it is Air ──────────────────────────────────────────────
  step('identity')
  check('renderer mounted', await js(`document.getElementById('air-root').children.length > 0`), true)
  check('bridge present', await js(`typeof window.air`), 'object')
  check('bridge stays narrow', await js(`Object.keys(window.air).length <= 20`), true)

  // The security claim, asserted rather than described. Air is a different
  // application now, so the privileged bridge is not merely unexposed here —
  // it does not exist in this process.
  check('no privileged bridge', await js(`typeof window.sush`), 'undefined')
  check('no node in the renderer', await js(`typeof window.require`), 'undefined')
  check('a real shell is running', await js(`/[$#>]/.test(document.body.innerText)`), true)
  check('one session at boot', await sessions(), 1)

  // ── The : layer ───────────────────────────────────────────────────────────
  step('commands')
  await run(':help')
  check(':help opens', await js(`!!document.querySelector('.air-sheet')`), true)
  await run(':help')
  check(':help toggles shut', await js(`!!document.querySelector('.air-sheet')`), false)

  await run(':theme paper')
  check(':theme paper repaints', await js(`getComputedStyle(document.documentElement).getPropertyValue('--air-bg').trim()`), '#f4f2ee')
  await run(':theme moonlight')
  check(':theme moonlight repaints', await js(`getComputedStyle(document.documentElement).getPropertyValue('--air-bg').trim()`), '#08090a')
  await run(':theme nonesuch')
  check('an unknown theme is refused, not silently applied', await flash(), 'No theme "nonesuch". Try: moonlight, harbor, ember, paper.')

  await run(':new')
  check(':new adds a session', await sessions(), 2)
  await run(':rename probed')
  // The regression that mattered: :new used to build the tab inside a state
  // updater and read its id back out, so :rename landed on the wrong tab.
  check(':rename lands on the new tab', await js(`document.querySelector('.air-tab.is-active .air-tab-label').textContent`), 'probed')

  await run(':split')
  check(':split tiles', await js(`!!document.querySelector('.air-stage.is-split')`), true)
  await run(':split')
  check(':split untiles', await js(`!!document.querySelector('.air-stage.is-split')`), false)

  await run(':font 20')
  check(':font persists', await js(`localStorage.getItem('sush-air:font')`), '20')
  await run(':note verified')
  check(':note stores', await js(`JSON.parse(localStorage.getItem('sush-air:notes')).at(-1).text`), 'verified')

  step('error messages')
  await run(':nonsense')
  check('unknown command explains itself', await flash(), 'Unknown command :nonsense. Try :help.')
  await run(':clera')
  check('a transposed typo is caught', await flash(), 'Unknown command :clera — did you mean :clear?')
  await run(':go 99')
  check('out-of-range :go explains itself', await flash(), 'No session 99.')

  step('zen')
  await run(':zen')
  check(':zen hides the chrome', await js(`!document.querySelector('.air-bar')`), true)
  check(':zen says how to leave', await flash(), 'Zen. Escape to come back.')
  await escape()
  check('Escape leaves zen', await js(`!!document.querySelector('.air-bar')`), true)

  // ── Import from Sush ──────────────────────────────────────────────────────
  step('import')
  await run(':import')
  await wait(400)   // the sheet scans on mount
  check(':import opens the sheet', await js(`!!document.querySelector('.air-import')`), true)
  check('it found every entry', await js(`document.querySelectorAll('.air-import-item').length`), 6)
  check('the sheet names what Air will never read', await js(`/never reads/i.test(document.querySelector('.air-import').innerText)`), true)

  // The subtractive default: everything on except the two entries Air has a
  // reason to distrust — the credential-shaped env var and the destructive
  // startup command.
  check('ordinary entries arrive on', await js(`document.querySelectorAll('.air-import-item.is-on').length`), 4)
  check('the token arrives off', await js(`
    [...document.querySelectorAll('.air-import-item')]
      .find(el => el.innerText.includes('GITHUB_TOKEN'))?.classList.contains('is-on')
  `), false)
  check('the token value is never rendered', await js(`document.querySelector('.air-import').innerText.includes('ghp_')`), false)
  check('the destructive startup command arrives off', await js(`
    [...document.querySelectorAll('.air-import-item')]
      .find(el => el.innerText.includes('rm -rf'))?.classList.contains('is-on')
  `), false)

  // Toggling is subtractive: click an on row and it goes off.
  await js(`[...document.querySelectorAll('.air-import-item')].find(el => el.innerText.includes('EDITOR')).click()`)
  await wait(150)
  check('clicking an entry turns it off', await js(`document.querySelectorAll('.air-import-item.is-on').length`), 3)

  await js(`[...document.querySelectorAll('.air-import-actions button')].find(b => /defaults/i.test(b.textContent)).click()`)
  await wait(150)
  check('"use the defaults" puts the recommended set back', await js(`document.querySelectorAll('.air-import-item.is-on').length`), 4)

  await js(`[...document.querySelectorAll('.air-import-actions button')].find(b => /^Import/.test(b.textContent)).click()`)
  await wait(400)
  check('importing closes the sheet', await js(`!!document.querySelector('.air-import')`), false)
  check('importing says what it took', await flash(), 'Imported a start folder, 1 alias, 1 env var, 1 startup command. New sessions will have them.')

  // What actually landed on disk. Main re-scans and writes, so this is the real
  // end of the flow rather than the renderer's opinion of it — and it is read
  // out of Air's own settings directory, which is the separation made visible.
  const profilePath = join(app.getPath('userData'), 'air-profile.json')
  check('Air writes into its own settings directory', /Sush Air/.test(profilePath), true)
  const imported = JSON.parse(readFileSync(profilePath, 'utf8'))
  check('the alias was written', imported.aliases, [{ name: 'gs', command: 'git status' }])
  check('the token was not written', imported.env, [{ name: 'EDITOR', value: 'code' }])
  check('the destructive command was not written', imported.startup, ['doctor'])
  check('the start folder was written', imported.cwd, homedir())

  await run(':forget')
  check(':forget says so', await flash(), 'Forgot everything from Sush. New sessions start clean.')

  // ── Closing ───────────────────────────────────────────────────────────────
  step('closing')
  await run(':close')
  check(':close removes a session', await sessions(), 1)
  await run(':close')
  // A terminal app with no terminal in it is a dead end, and the only way out
  // would be a shortcut you may not know.
  check('closing the last session leaves a fresh one', await sessions(), 1)

  check('no renderer errors', errors, [])

  process.stdout.write('\n' + checks.join('\n') + '\n')
  process.stdout.write(`\n${checks.length - failures.length}/${checks.length} passed\n`)
  app.exit(failures.length ? 1 : 0)
}

main().catch(err => {
  process.stderr.write(`\n!! ${err?.stack ?? err}\n`)
  app.exit(2)
})
