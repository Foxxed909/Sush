// Git porcelain v1 uses the first status column for the index and the second
// for the working tree. Untracked/ignored markers are not staged entries.
export function isGitFileStaged(file) {
  const rawStatus = String(file?.rawStatus ?? '').padEnd(2, ' ')
  return rawStatus[0] !== ' ' && rawStatus[0] !== '?' && rawStatus[0] !== '!'
}
