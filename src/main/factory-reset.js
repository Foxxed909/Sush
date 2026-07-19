import { existsSync, readdirSync, rmSync } from 'fs'
import { isAbsolute, join, parse, relative, resolve } from 'path'

const RESET_TARGETS = [
  'identities',
  '.legacy-migrations',
  'sush-users.json',
  'sush-scrollback.json',
  'sush-credits.json',
  'sush-stt.json',
  'sush-tts.json',
  'sush-oauth.json',
  'sush-profile.ps1'
]

function containedTarget(root, name) {
  const target = resolve(root, name)
  const inside = relative(root, target)
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) return null
  return target
}

export function resetSushUserData({ userData, keepLicense = false, confirmation } = {}) {
  if (confirmation !== 'RESET SUSH') return { ok: false, error: 'Type RESET SUSH to confirm.' }
  const root = resolve(String(userData || ''))
  if (!userData || root === parse(root).root) return { ok: false, error: 'Refusing to reset an unsafe data path.' }

  let identitiesRemoved = 0
  const identities = containedTarget(root, 'identities')
  try {
    if (identities && existsSync(identities)) {
      identitiesRemoved = readdirSync(identities, { withFileTypes: true }).filter(entry => entry.isDirectory()).length
    }
  } catch {}

  const targets = keepLicense ? RESET_TARGETS : [...RESET_TARGETS, 'sush-license.json']
  let removed = 0
  try {
    for (const name of targets) {
      const target = containedTarget(root, name)
      if (!target) throw new Error(`Unsafe reset target: ${name}`)
      if (!existsSync(target)) continue
      rmSync(target, { recursive: true, force: true })
      if (existsSync(target)) throw new Error(`Could not remove ${name}`)
      removed++
    }
  } catch (error) {
    return { ok: false, error: error?.message || 'Factory reset did not finish.', removed, identitiesRemoved }
  }

  return { ok: true, removed, identitiesRemoved, keptLicense: !!keepLicense }
}
