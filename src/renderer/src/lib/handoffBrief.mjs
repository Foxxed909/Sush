// The hand-off brief, shared by the desktop app (main process, via IPC) and
// Sush Terminal (`sush handoff`). Pure: callers pass what they read
// (transcript items, git state, a terminal tail, an optional AI summary).
//
// Recent-first under a size budget: the latest ask and the latest reply are
// what the next agent needs most, so they are kept whole (within a cap) and
// earlier asks are added newest to oldest until the budget runs out. Each
// section is bounded, so a huge session can never flood the next agent.

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim()

export const HANDOFF_BUDGET = 8000

export function buildHandoffBrief({
  fromLabel = 'another agent',
  cwd = '',
  items = [],
  git = null,
  tail = '',
  summary = '',
  reason = '',
  maxChars = HANDOFF_BUDGET
} = {}) {
  const asks = items.filter(i => i.role === 'user').map(i => String(i.text || '').trim()).filter(Boolean)
  const replies = items.filter(i => i.role === 'assistant').map(i => String(i.text || '').trim()).filter(Boolean)
  const files = [...new Set(items.filter(i => i.role === 'tool' && i.file).map(i => i.file).reverse())].slice(0, 20)

  const head = [`You are taking over a coding session from ${fromLabel}${cwd ? ` in ${cwd}` : ''}.`]
  if (reason) head.push(reason)
  if (git?.branch) head.push(`Git: on ${git.branch}${git.dirty ? `, ${git.dirty} changed file${git.dirty === 1 ? '' : 's'}` : ', clean'}.`)

  const job = ['## Your job', 'Check the current state first (git status, the files below, tests), then continue from where it stopped. Say briefly what you found before making large changes.']

  const sections = []
  if (summary) sections.push(['## Summary', clip(String(summary).trim(), 1200)])
  if (asks.length) sections.push(['## Latest ask', clip(asks[asks.length - 1], 1500)])
  if (replies.length) sections.push(['## Where it got to', clip(replies[replies.length - 1], 1500)])
  if (files.length) sections.push(['## Files touched (most recent first)', ...files.map(f => `- ${f}`)])
  if (!asks.length && !replies.length && tail) {
    sections.push(['## Terminal output (tail)', '```', clip(String(tail).trim().split('\n').slice(-40).join('\n'), 2500), '```'])
  }

  const assemble = (earlier) => [
    head.join(' '), '',
    ...sections.flatMap(s => [...s, '']),
    ...(earlier.length ? ['## Earlier asks (newest first)', ...earlier, ''] : []),
    ...job
  ].join('\n')

  // Earlier asks fill whatever budget is left, newest first.
  const earlier = []
  for (let i = asks.length - 2; i >= 0 && earlier.length < 8; i--) {
    const line = `- ${clip(oneLine(asks[i]), 300)}`
    if (assemble([...earlier, line]).length > maxChars) break
    earlier.push(line)
  }
  const text = assemble(earlier)
  return text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text
}

// The one line typed into the next agent: a pointer to the saved brief, so a
// long brief never has to survive being typed into a TUI.
export function handoffPointer(file, fromLabel = 'the previous agent') {
  return `Read the hand-off brief at ${file} (from ${fromLabel}) and continue the work from where it stopped.`
}
