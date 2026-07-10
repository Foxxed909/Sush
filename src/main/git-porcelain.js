export function parseGitPorcelainZ(output) {
  const records = String(output ?? '').split('\0')
  const files = []
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (!record || record.length < 3) continue
    const rawStatus = record.slice(0, 2)
    const path = record.slice(3)
    if (!path) continue
    files.push({
      status: rawStatus.trim() || '??',
      rawStatus,
      path
    })
    // With -z, rename/copy records are `XY destination\0source\0`. The panel
    // operates on the destination; consume the source record so it is not
    // mistaken for a second status line.
    if (/[RC]/.test(rawStatus)) index += 1
  }
  return files
}
