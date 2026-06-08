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

  // Preserve the command's original casing. Registry lookup is case-insensitive
  // (see registry.get), but passthrough to a real shell must keep the case the
  // user typed -- e.g. `Python`, `Get-ChildItem`, or any case-sensitive binary
  // on Linux/macOS would otherwise be mangled by a blanket toLowerCase().
  const [cmd, ...args] = tokens
  return { cmd, args }
}
