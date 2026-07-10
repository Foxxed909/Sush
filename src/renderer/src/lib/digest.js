// Workspace digest — one markdown "crew report" for a whole workspace.
// Pure assembly lives here (testable); App gathers the inputs (scrollback
// tails via getScrollback, an optional AI summary via cliComplete) and hands
// them in. The digest is honest about its sources: the AI summary is labelled
// as inferred, the per-session tails are verbatim output.

const TAIL_CHARS = 1200   // per-session verbatim tail kept in the report

export function buildDigestMarkdown({ label, cwd, sessions = [], summary, generatedAt = new Date() }) {
  const head = [
    `# Crew report — ${label || 'Workspace'}`,
    '',
    '| | |',
    '|---|---|',
    `| Directory | \`${cwd || 'unknown'}\` |`,
    `| Sessions | ${sessions.length} |`,
    `| Generated | ${generatedAt.toLocaleString()} |`,
    ''
  ]
  const summaryBlock = summary
    ? ['## Summary (AI-inferred)', '', summary.trim(), '']
    : []
  const sessionBlocks = sessions.flatMap(s => [
    `## ${s.label || 'session'} (${s.agentId || 'shell'})`,
    '',
    '```text',
    // A fence inside captured output would break the block — soften it the
    // same way the session export does.
    (String(s.text || '').trim() || '(no captured output)').slice(-TAIL_CHARS).replace(/```/g, '``​`'),
    '```',
    ''
  ])
  return [...head, ...summaryBlock, ...sessionBlocks].join('\n')
}

// The prompt handed to the fallback CLI for the digest's summary section.
export function digestSummaryPrompt(label, sessions) {
  const joined = sessions
    .map(s => `--- ${s.label} (${s.agentId || 'shell'}) ---\n${String(s.text || '').slice(-1500)}`)
    .join('\n\n')
  return [
    `These are the recent output tails of ${sessions.length} terminal session(s) in the workspace "${label}".`,
    'Write a status digest for the human running this crew: what each session appears to be doing,',
    'what finished, what failed or needs attention, and the single most useful next action.',
    'Under 150 words, plain prose, no preamble.',
    '',
    joined
  ].join('\n')
}
