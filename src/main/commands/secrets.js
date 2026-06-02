import { ok, err, ansi } from './_helpers'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { mkdirSync } from 'fs'

const STORE_PATH = join(homedir(), '.sush', 'secrets.json')
const KEY_SALT = 'sush-secrets-v1'

function getKey() {
  const machineId = process.env.COMPUTERNAME || 'sush'
  return scryptSync(`${machineId}-${KEY_SALT}`, KEY_SALT, 32)
}

function loadStore() {
  if (!existsSync(STORE_PATH)) return {}
  try { return JSON.parse(readFileSync(STORE_PATH, 'utf8')) } catch { return {} }
}

function saveStore(data) {
  const dir = join(homedir(), '.sush')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8')
}

function encrypt(val) {
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', getKey(), iv)
  const enc = Buffer.concat([cipher.update(val, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + enc.toString('hex')
}

function decrypt(val) {
  const [ivHex, encHex] = val.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const enc = Buffer.from(encHex, 'hex')
  const decipher = createDecipheriv('aes-256-cbc', getKey(), iv)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

export const secrets = {
  name: 'secrets',
  description: 'Manage encrypted local secrets',
  usage: 'secrets <list|set|get|delete> [key] [value]',
  async run([sub, key, ...rest], ctx) {
    const store = loadStore()
    if (!sub || sub === 'list') {
      const keys = Object.keys(store)
      if (!keys.length) return ok(ansi.dim('No secrets stored'))
      const lines = keys.map(k => `  ${ansi.cyan(k)}  ${ansi.dim('••••••••')}`)
      return ok([ansi.bold(ansi.pink('SECRETS')), ansi.dim('─'.repeat(30)), ...lines].join('\r\n'))
    }
    if (sub === 'set') {
      if (!key) return err('secrets set: missing key')
      const value = rest.join(' ')
      if (!value) return err('secrets set: missing value')
      store[key] = encrypt(value)
      saveStore(store)
      return ok(ansi.green(`secret '${key}' saved`))
    }
    if (sub === 'get') {
      if (!key) return err('secrets get: missing key')
      if (!store[key]) return err(`secrets: '${key}' not found`)
      try {
        return ok(`${ansi.cyan(key)}: ${decrypt(store[key])}`)
      } catch {
        return err(`secrets: failed to decrypt '${key}'`)
      }
    }
    if (sub === 'delete') {
      if (!key) return err('secrets delete: missing key')
      if (!store[key]) return err(`secrets: '${key}' not found`)
      delete store[key]
      saveStore(store)
      return ok(ansi.yellow(`deleted: ${key}`))
    }
    return err(`secrets: unknown subcommand '${sub}'`)
  }
}
