import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { expect, it } from 'vitest'

// The preload exposes window.sush.* as ipcRenderer.invoke('sush:...'). A
// channel with no ipcMain.handle rejects at runtime with "No handler
// registered", and a renderer catch usually hides that. Keep both sides in step.
function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : /\.m?js$/.test(name) ? [p] : []
  })
}
const channels = (src, re) => new Set([...src.matchAll(re)].map(m => m[1]))

it('every channel the preload invokes has a main-process handler', () => {
  const preload = readFileSync('src/preload/index.js', 'utf8')
  const main = walk('src/main').map(f => readFileSync(f, 'utf8')).join('\n')
  const invoked = channels(preload, /ipcRenderer\.invoke\(\s*['"`]([^'"`]+)['"`]/g)
  const handled = channels(main, /ipcMain\.handle\(\s*['"`]([^'"`]+)['"`]/g)
  expect(invoked.size).toBeGreaterThan(20)
  expect([...invoked].filter(c => !handled.has(c)).sort()).toEqual([])
})
