// Build a bounded, explicit snapshot of context Sush can actually observe.
//
// This is intentionally NOT called "model context": it may include files or
// terminal output that the active provider has never loaded. The bundle exists
// for deliberate copy/paste or handoff workflows and keeps every section
// bounded so a large repo cannot accidentally flood the clipboard.

export const CONTEXT_BUNDLE_LIMITS = {
  docs: 5,
  docChars: 2000,
  changedFiles: 20,
  tailChars: 2500
}

function clean(text) {
  return String(text ?? '').replace(/\r/g, '').trim()
}

export function clipContextText(text, max) {
  const value = clean(text)
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value
}

export function buildContextBundle({
  projectRoot,
  checkoutRoot,
  liveCwd,
  provider = 'Shell',
  model = 'provider default',
  effort = 'provider default',
  account = '—',
  git = null,
  docs = [],
  tail = '',
  lineage = null
} = {}) {
  const lines = [
    '# Sush workspace context',
    '',
    `- Project root: ${projectRoot || '—'}`
  ]

  if (checkoutRoot && checkoutRoot !== projectRoot) lines.push(`- Checkout: ${checkoutRoot}`)
  if (liveCwd && liveCwd !== checkoutRoot) lines.push(`- Live cwd: ${liveCwd}`)

  lines.push(
    `- Provider: ${provider}`,
    `- Model: ${model || 'provider default'}`,
    `- Reasoning: ${effort || 'provider default'}`,
    `- Account: ${account || '—'}`
  )

  if (lineage?.from) {
    lines.push(`- Continued from: ${lineage.from.label || lineage.from.agentId || 'session'}${lineage.sourceAlive === false ? ' (closed)' : ''}`)
  }
  if (Array.isArray(lineage?.to) && lineage.to.length) {
    lines.push(`- Handed off to: ${lineage.to.map(item => item.label || item.agentId || 'session').join(', ')}`)
  }

  if (git?.repo) {
    lines.push(`- Git branch: ${git.branch || '—'}`)
    const files = (git.files || []).slice(0, CONTEXT_BUNDLE_LIMITS.changedFiles)
    if (files.length) {
      lines.push('', '## Working tree')
      for (const file of files) lines.push(`- ${file.status || file.rawStatus || '·'} ${file.path}`)
      if ((git.files || []).length > files.length) {
        lines.push(`- … +${git.files.length - files.length} more`)
      }
    }
  }

  for (const doc of (docs || []).slice(0, CONTEXT_BUNDLE_LIMITS.docs)) {
    const body = clipContextText(doc?.content, CONTEXT_BUNDLE_LIMITS.docChars)
    if (!body) continue
    lines.push('', `## ${doc.name || 'Project document'}`, '', body)
  }

  const tailText = clipContextText(tail, CONTEXT_BUNDLE_LIMITS.tailChars)
  if (tailText) lines.push('', '## Recent terminal tail', '', tailText)

  lines.push(
    '',
    '> Generated from context Sush can observe. This does not imply that every source above is loaded into the provider model context window.'
  )

  return lines.join('\n')
}
