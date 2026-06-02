// Tokenizes shell input into cmd + args, respecting quoted strings
export function parseInput(input) {
  if (!input) return null
  const tokens = []
  let current = ''
  let inQuote = null

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === '"' || ch === "'") {
      if (inQuote === ch) {
        inQuote = null
      } else if (!inQuote) {
        inQuote = ch
      } else {
        current += ch
      }
    } else if (ch === ' ' && !inQuote) {
      if (current) { tokens.push(current); current = '' }
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  if (!tokens.length) return null

  const [cmd, ...args] = tokens
  return { cmd: cmd.toLowerCase(), args }
}
