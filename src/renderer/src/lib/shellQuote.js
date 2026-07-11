export function quoteShellPath(path, { platform = 'linux', shellId = '' } = {}) {
  const value = String(path ?? '')
  if (platform === 'win32' && String(shellId).toLowerCase() === 'cmd') {
    // Windows filenames cannot contain a double quote, and metacharacters such
    // as & and | are inert inside cmd.exe quotes.
    return `"${value}"`
  }
  if (platform === 'win32') {
    // PowerShell single-quoted literals escape a quote by doubling it.
    return `'${value.replace(/'/g, "''")}'`
  }
  // POSIX single quotes prevent command substitution, variable expansion, and
  // metacharacter execution. A literal quote is represented as: '\''.
  return `'${value.replace(/'/g, "'\\''")}'`
}
