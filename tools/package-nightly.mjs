// Build the Nightly channel without changing the checked-in stable metadata.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const env = { ...process.env, SUSH_BUILD_CHANNEL: 'nightly' }
for (const [entry, args] of [
  [fileURLToPath(new URL('../node_modules/electron-vite/bin/electron-vite.js', import.meta.url)), ['build']],
  [fileURLToPath(new URL('../node_modules/electron-builder/cli.js', import.meta.url)), [
    '--config.productName=Sush Nightly',
    '--config.appId=com.sush.terminal.nightly',
    '--config.directories.output=dist-nightly',
    '--publish=never'
  ]]
]) {
  const result = spawnSync(process.execPath, [entry, ...args], { env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
