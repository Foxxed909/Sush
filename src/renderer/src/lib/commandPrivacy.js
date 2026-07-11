const SECRET_SET = /^secrets\s+set(?:\s|$)/i
const JWT_DECODE = /^jwt(?:\s|$)/i

export function isSensitiveCommand(raw) {
  const command = String(raw || '').trim()
  return SECRET_SET.test(command) || JWT_DECODE.test(command)
}

export function redactSensitiveCommand(raw) {
  const command = String(raw || '').trim().replace(/\s+/g, ' ')
  if (SECRET_SET.test(command)) {
    const key = command.split(' ')[2]
    return key ? `secrets set ${key} <redacted>` : 'secrets set <redacted>'
  }
  if (JWT_DECODE.test(command)) return 'jwt <redacted>'
  return command
}
