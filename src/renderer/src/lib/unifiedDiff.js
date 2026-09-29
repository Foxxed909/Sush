// Parse `git diff` output into files → hunks → numbered lines, for the Nightly
// diff panel (after T3 Code's DiffPanel, MIT, (c) 2026 T3 Tools Inc.): line
// numbers on both sides, "N unmodified lines" between hunks, split pairing.

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/

function unquote(path) {
  const p = String(path || '').trim()
  if (p.startsWith('"') && p.endsWith('"')) return p.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  return p
}

function stripPrefix(path) {
  const p = unquote(path)
  if (p === '/dev/null') return null
  return p.replace(/^[ab]\//, '')
}

export function parseUnifiedDiff(text) {
  const files = []
  let file = null
  let hunk = null
  let oldNo = 0
  let newNo = 0
  for (const raw of String(text || '').split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const m = raw.match(/^diff --git ("?a\/.*?"?) ("?b\/.*"?)$/)
      file = { path: m ? stripPrefix(m[2]) : raw.slice(11), oldPath: m ? stripPrefix(m[1]) : null, status: 'modified', hunks: [], added: 0, removed: 0, binary: false }
      files.push(file)
      hunk = null
      continue
    }
    if (!file) {
      // `git diff --no-index` output for an untracked file still starts with diff --git;
      // anything before the first header is noise.
      continue
    }
    if (!hunk) {
      if (raw.startsWith('new file mode')) { file.status = 'added'; continue }
      if (raw.startsWith('deleted file mode')) { file.status = 'deleted'; continue }
      if (raw.startsWith('rename from ')) { file.status = 'renamed'; file.oldPath = raw.slice(12); continue }
      if (raw.startsWith('rename to ')) { file.path = raw.slice(10); continue }
      if (raw.startsWith('Binary files ')) { file.binary = true; continue }
      if (raw.startsWith('--- ')) { const p = stripPrefix(raw.slice(4)); if (p) file.oldPath = p; else file.status = 'added'; continue }
      if (raw.startsWith('+++ ')) { const p = stripPrefix(raw.slice(4)); if (p) file.path = p; else file.status = 'deleted'; continue }
    }
    const h = raw.match(HUNK)
    if (h) {
      hunk = {
        oldStart: Number(h[1]), oldLines: h[2] === undefined ? 1 : Number(h[2]),
        newStart: Number(h[3]), newLines: h[4] === undefined ? 1 : Number(h[4]),
        context: h[5].trim(), lines: []
      }
      oldNo = hunk.oldStart
      newNo = hunk.newStart
      file.hunks.push(hunk)
      continue
    }
    if (!hunk) continue
    if (raw.startsWith('\\')) continue   // "\ No newline at end of file"
    const mark = raw[0]
    const body = raw.slice(1)
    if (mark === '+') { hunk.lines.push({ kind: 'add', old: null, new: newNo++, text: body }); file.added++ }
    else if (mark === '-') { hunk.lines.push({ kind: 'del', old: oldNo++, new: null, text: body }); file.removed++ }
    // Git prefixes empty context lines with a space; a bare '' is the split's tail.
    else if (mark === ' ') hunk.lines.push({ kind: 'ctx', old: oldNo++, new: newNo++, text: body })
  }
  return files
}

// Unchanged lines between two hunks (or before the first one).
export function gapBefore(hunks, index) {
  const hunk = hunks[index]
  if (!hunk) return 0
  if (index === 0) return Math.max(0, hunk.oldStart - 1)
  const prev = hunks[index - 1]
  return Math.max(0, hunk.oldStart - (prev.oldStart + prev.oldLines))
}

// Side-by-side rows: deletions pair with the additions that follow them.
export function splitRows(hunk) {
  const rows = []
  const lines = hunk?.lines || []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.kind === 'ctx') { rows.push({ left: line, right: line }); i++; continue }
    const dels = []
    const adds = []
    while (i < lines.length && lines[i].kind === 'del') dels.push(lines[i++])
    while (i < lines.length && lines[i].kind === 'add') adds.push(lines[i++])
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push({ left: dels[k] || null, right: adds[k] || null })
  }
  return rows
}

export function diffTotals(files = []) {
  return files.reduce((t, f) => ({ added: t.added + f.added, removed: t.removed + f.removed }), { added: 0, removed: 0 })
}
