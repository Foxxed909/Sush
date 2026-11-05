// Screenshots of Sush Terminal (term/): runs the TUI in tmux, captures the
// pane with colours, converts the ANSI to HTML and photographs it.
//
//   node tools/term-shot.mjs [outDir]
import { execFileSync } from 'child_process'
import { mkdirSync, existsSync, writeFileSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright-core'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outDir = resolve(process.argv[2] || join(root, 'shots', 'term'))
mkdirSync(outDir, { recursive: true })
const COLS = 100, ROWS = 32
const tmux = (...a) => execFileSync('tmux', a, { encoding: 'utf8' })
const sleep = ms => new Promise(r => setTimeout(r, ms))

const PALETTE256 = (n) => {
  const base = ['#000000', '#cd0000', '#00cd00', '#cdcd00', '#0000ee', '#cd00cd', '#00cdcd', '#e5e5e5', '#7f7f7f', '#ff0000', '#00ff00', '#ffff00', '#5c5cff', '#ff00ff', '#00ffff', '#ffffff']
  if (n < 16) return base[n]
  if (n >= 232) { const v = 8 + (n - 232) * 10; return `rgb(${v},${v},${v})` }
  const i = n - 16, c = [0, 95, 135, 175, 215, 255]
  return `rgb(${c[Math.floor(i / 36)]},${c[Math.floor(i / 6) % 6]},${c[i % 6]})`
}
function ansiToHtml(text) {
  let fg = null, bold = false, dim = false, html = ''
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const parts = text.split(/(\x1b\[[0-9;]*m)/)
  for (const p of parts) {
    const m = p.match(/^\x1b\[([0-9;]*)m$/)
    if (!m) { if (p) html += `<span style="${fg ? `color:${fg};` : ''}${bold ? 'font-weight:700;' : ''}${dim ? 'opacity:.6;' : ''}">${esc(p)}</span>`; continue }
    const codes = (m[1] || '0').split(';').map(Number)
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i]
      if (c === 0) { fg = null; bold = false; dim = false }
      else if (c === 1) bold = true
      else if (c === 2) dim = true
      else if (c === 22) { bold = false; dim = false }
      else if (c === 39) fg = null
      else if (c === 38 && codes[i + 1] === 2) { fg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`; i += 4 }
      else if (c === 38 && codes[i + 1] === 5) { fg = PALETTE256(codes[i + 2]); i += 2 }
      else if (c >= 30 && c <= 37) fg = PALETTE256(c - 30)
      else if (c >= 90 && c <= 97) fg = PALETTE256(c - 90 + 8)
    }
  }
  return html
}

const home = join(outDir, '.home')
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true })
try { tmux('kill-session', '-t', 'sushterm') } catch {}
tmux('new-session', '-d', '-s', 'sushterm', '-x', String(COLS), '-y', String(ROWS),
  `env COLORTERM=truecolor SUSH_TERMINAL_HOME=${home} node ${join(root, 'term/bin/sush.mjs')}`)
const shots = []
const grab = async (name) => {
  await sleep(700)
  shots.push([name, tmux('capture-pane', '-t', 'sushterm', '-p', '-e')])
}
await sleep(2500)
await grab('t1-home')
tmux('send-keys', '-t', 'sushterm', '-l', 'refactor the auth flow and add tests')
await grab('t2-typing')
tmux('send-keys', '-t', 'sushterm', 'C-u')
for (let i = 0; i < 3; i++) { tmux('send-keys', '-t', 'sushterm', 'Tab'); await sleep(150) }
await grab('t3-opencode')
tmux('send-keys', '-t', 'sushterm', 'C-t'); await sleep(150)
tmux('send-keys', '-t', 'sushterm', 'Down'); await sleep(150)
tmux('send-keys', '-t', 'sushterm', 'Down')
await grab('t4-models')
tmux('send-keys', '-t', 'sushterm', 'Escape')
tmux('send-keys', '-t', 'sushterm', '-l', '?')
await grab('t5-help')
tmux('send-keys', '-t', 'sushterm', 'Escape')
tmux('send-keys', '-t', 'sushterm', 'C-c')
try { tmux('kill-session', '-t', 'sushterm') } catch {}

const browserPath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, chromium.executablePath(), '/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean).find(existsSync)
const browser = await chromium.launch({ executablePath: browserPath })
const page = await browser.newPage({ viewport: { width: 1000, height: 640 }, deviceScaleFactor: 2 })
for (const [name, ansi] of shots) {
  const doc = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#0b0910}
    .win{margin:20px;border-radius:12px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 .5px rgba(255,255,255,.12)}
    .bar{height:30px;background:#1c1622;display:flex;align-items:center;gap:8px;padding:0 12px}
    .bar i{width:12px;height:12px;border-radius:50%;display:block}
    pre{margin:0;padding:14px 16px;background:#0f0b14;color:#e8dfe6;font:13px/1.16 'DejaVu Sans Mono',monospace;white-space:pre}
  </style><div class="win"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div><pre>${ansiToHtml(ansi)}</pre></div>`
  await page.setContent(doc)
  const el = await page.$('.win')
  await el.screenshot({ path: join(outDir, `${name}.png`) })
  console.log('✓', name)
}
await browser.close()
writeFileSync(join(outDir, 'README.txt'), 'Sush Terminal screenshots (tools/term-shot.mjs)\n')
