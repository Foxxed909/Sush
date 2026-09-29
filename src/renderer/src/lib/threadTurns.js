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
