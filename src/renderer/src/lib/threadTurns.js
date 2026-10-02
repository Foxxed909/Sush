// Shape a flat structured Thread feed into T3-style blocks: user and assistant
// messages stay as they are, and each consecutive run of tool calls becomes one
// collapsible "work log" with every result paired to the call that produced it.

export function groupThreadTurns(items = []) {
  const blocks = []
  let work = null

  const closeWork = () => {
    if (work) blocks.push(work)
    work = null
  }

  for (const item of items) {
    if (!item) continue
    if (item.type === 'tool_use' || item.type === 'tool_result') {
      if (!work) work = { kind: 'work', id: `work:${item.id}`, steps: [] }
      if (item.type === 'tool_use') {
        work.steps.push({ id: item.id, use: item, result: null })
        continue
      }
      const step = item.toolUseId
        ? work.steps.find(s => s.use?.toolUseId === item.toolUseId && !s.result)
        : null
      if (step) step.result = item
      else work.steps.push({ id: item.id, use: null, result: item })
      continue
    }
    closeWork()
    if (item.type === 'user' || item.type === 'assistant') blocks.push({ kind: item.type, id: item.id, item })
  }
  closeWork()
  return blocks
}

// One-line summary of a tool call for the collapsed work log row.
export function describeToolUse(use) {
  if (!use) return 'Result'
  const input = use.input || {}
  const target = input.command || input.file_path || input.path || input.pattern || input.url || input.description || ''
  const text = String(target).replace(/\s+/g, ' ').trim()
  return text ? `${use.name} · ${text.length > 90 ? `${text.slice(0, 90)}…` : text}` : use.name
}

export function workSummary(block) {
  const steps = block?.steps || []
  const errors = steps.filter(step => step.result?.isError).length
  const calls = steps.filter(step => step.use).length || steps.length
  return `${calls} tool call${calls === 1 ? '' : 's'}${errors ? ` · ${errors} error${errors === 1 ? '' : 's'}` : ''}`
}

// ── T3-style turns ─────────────────────────────────────────────────────────
// After T3 Code's MessagesTimeline (MIT, (c) 2026 T3 Tools Inc.): within each
// turn (a user message and everything until the next one), the first reply
// and the final reply stay visible; tool work and the narration between them
// fold into one "Worked for …" row, followed by the files the turn changed.

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

function lineCount(text) {
  const value = String(text ?? '')
  return value ? value.split('\n').length : 0
}

// `*** Update File: path` sections of a Codex apply_patch envelope, with the
// +/- lines each one carries.
export function patchEnvelopeFiles(patch = '') {
  const files = []
  let current = null
  for (const line of String(patch).split('\n')) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line)
    if (header) {
      current = { path: header[2].trim(), added: 0, removed: 0 }
      files.push(current)
      continue
    }
    if (!current || line.startsWith('***') || line.startsWith('@@')) continue
    if (line.startsWith('+')) current.added++
    else if (line.startsWith('-')) current.removed++
  }
  return files
}

// Files a turn touched, from the edit tools' own inputs. Counts are the lines
// those calls replaced and wrote — what the transcript records, not a git diff.
export function changedFilesFromSteps(steps = []) {
  const files = new Map()
  for (const step of steps) {
    const use = step.use
    if (!use || step.result?.isError) continue
    const input = use.input || {}
    // Codex edits arrive as one apply_patch envelope spanning several files.
    if (use.name === 'Patch' && typeof input.patch === 'string') {
      for (const file of patchEnvelopeFiles(input.patch)) {
        const entry = files.get(file.path) || { path: file.path, added: 0, removed: 0 }
        entry.added += file.added
        entry.removed += file.removed
        files.set(file.path, entry)
      }
      continue
    }
    if (!EDIT_TOOLS.has(use.name)) continue
    const path = input.file_path || input.notebook_path || input.path
    if (!path) continue
    const entry = files.get(path) || { path, added: 0, removed: 0 }
    if (use.name === 'Write') entry.added += lineCount(input.content)
    else if (use.name === 'MultiEdit' && Array.isArray(input.edits)) {
      for (const edit of input.edits) {
        entry.added += lineCount(edit?.new_string)
        entry.removed += lineCount(edit?.old_string)
      }
    } else {
      entry.added += lineCount(input.new_string ?? input.new_source)
      entry.removed += lineCount(input.old_string)
    }
    files.set(path, entry)
  }
  return [...files.values()]
}

function stamp(item) {
  const t = Date.parse(item?.timestamp || '')
  return Number.isFinite(t) ? t : null
}

export function formatWorkedFor(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h ? `${h}h ${m}m` : `${m}m ${s}s`
}

export function buildTurns(items = []) {
  const turns = []
  let current = null
  const flush = () => { if (current) turns.push(current); current = null }
  for (const item of items) {
    if (!item) continue
    if (item.type === 'user') {
      flush()
      current = { user: item, body: [] }
      continue
    }
    if (!current) current = { user: null, body: [] }
    current.body.push(item)
  }
  flush()

  const blocks = []
  for (const turn of turns) {
    if (turn.user) blocks.push({ kind: 'user', id: turn.user.id, item: turn.user })
    const body = turn.body
    const toolIdx = body.map((it, i) => (it.type === 'tool_use' || it.type === 'tool_result' ? i : -1)).filter(i => i >= 0)
    if (!toolIdx.length) {
      for (const it of body) if (it.type === 'assistant') blocks.push({ kind: 'assistant', id: it.id, item: it })
      continue
    }
    const firstTool = toolIdx[0]
    const lastTool = toolIdx[toolIdx.length - 1]
    // The first reply before any tool, and the replies after the last tool.
    const lead = body.slice(0, firstTool).filter(it => it.type === 'assistant')
    const tail = body.slice(lastTool + 1).filter(it => it.type === 'assistant')
    const folded = body.slice(firstTool, lastTool + 1)
    for (const it of lead) blocks.push({ kind: 'assistant', id: it.id, item: it })
    const steps = groupThreadTurns(folded.filter(it => it.type !== 'assistant')).flatMap(b => b.steps || [])
    const narration = folded.filter(it => it.type === 'assistant')
    const start = stamp(lead[lead.length - 1]) ?? stamp(turn.user) ?? stamp(folded[0])
    const end = stamp(tail[tail.length - 1]) ?? stamp(folded[folded.length - 1])
    blocks.push({
      kind: 'work',
      id: `work:${folded[0].id}`,
      steps,
      narration,
      durationMs: start != null && end != null ? end - start : null,
      files: changedFilesFromSteps(steps)
    })
    for (const it of tail) blocks.push({ kind: 'assistant', id: it.id, item: it })
  }
  return blocks
}

// Context in use for the next turn, from the latest assistant record's own
// usage (prompt incl. cache reads/writes + that reply). Null when the
// transcript has not recorded usage yet — never estimated.
export function latestContextTokens(items = []) {
  for (let i = items.length - 1; i >= 0; i--) {
    const usage = items[i]?.usage
    if (!usage || typeof usage !== 'object') continue
    const parts = [usage.input_tokens, usage.cache_creation_input_tokens, usage.cache_read_input_tokens, usage.output_tokens]
    const total = parts.reduce((n, v) => n + (Number.isFinite(Number(v)) ? Number(v) : 0), 0)
    if (total > 0) return total
  }
  return null
}
