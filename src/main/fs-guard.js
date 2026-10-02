import { homedir } from 'os'
import { basename, relative, resolve, sep, isAbsolute } from 'path'

// Paths the in-app editors must never write, even when the renderer asks:
// credential stores and shell startup files that run code on the next login.
// Reading them stays allowed (the Files pane can show them); writing is where
// a renderer bug or injected content could plant persistence.
const SENSITIVE_DIRS = ['.ssh', '.gnupg', '.aws', '.azure', '.kube', '.docker', '.config/gh', '.claude', '.codex']
const STARTUP_FILES = new Set([
  '.bashrc', '.bash_profile', '.bash_login', '.profile', '.zshrc', '.zshenv', '.zprofile', '.zlogin',
  '.config/fish/config.fish', '.gitconfig', '.npmrc', '.netrc', '.pypirc'
])

export function sensitiveWritePath(target, home = homedir(), platform = process.platform) {
  const fold = value => (platform === 'win32' ? value.toLowerCase() : value)
  const rel = relative(fold(resolve(home)), fold(resolve(target)))
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return false
  const posix = rel.split(sep).join('/')
  if (STARTUP_FILES.has(posix)) return true
  if (posix.split('/')[0] === 'Documents' && basename(posix).startsWith('Microsoft.PowerShell_profile')) return true
  return SENSITIVE_DIRS.some(dir => posix === dir || posix.startsWith(`${dir}/`))
}
