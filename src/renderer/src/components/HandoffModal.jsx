import React, { useEffect, useMemo, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'
import { agentById } from '../lib/agents'

// Agents offered as handoff targets (a real brain on the other end — handing
// off to a bare shell is still possible but no longer the only option).
const TARGET_AGENTS = ['claude', 'codex', 'gemini', 'shell']

function shortPath(p) {
  if (!p) return ''
  const parts = String(p).split(/[\\/]/).filter(Boolean)
  return parts.length <= 2 ? p : `…/${parts.slice(-2).join('/')}`
}

function buildFullCard(card) {
  if (!card) return ''
  const { tab, branch, dirty, scroll, recent } = card
  const lines = [
    `# Session handoff — ${tab.label}`,
    `cwd: ${tab.cwd || '(none)'}`,
    `shell: ${tab.profileLabel || tab.shell}`,
  ]
  if (branch) lines.push(`branch: ${branch}${dirty ? ` (${dirty} changed)` : ' (clean)'}`)
  if (recent?.length) {
    lines.push('', 'recent commands:')
    recent.forEach(c => lines.push(`  - ${c}`))
  }
  if (scroll?.trim()) {
    lines.push('', 'recent output:', '```', scroll.trim(), '```')
  }
  return lines.join('\n')
}

function buildInject(card) {
  if (!card) return ''
  const { tab, branch, recent } = card
  const bits = [`Continuing work from "${tab.label}"`]
  if (tab.cwd) bits.push(`in ${tab.cwd}`)
  if (branch) bits.push(`on branch ${branch}`)
  let line = bits.join(' ') + '.'
  if (recent?.length) line += ` Recent commands: ${recent.slice(-4).join('; ')}.`
  line += ' Please continue from here.'
  return line
}

export default function HandoffModal({ accent, sourceId, tabs, build, onSubmit, onClose }) {
  const [card, setCard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [targetId, setTargetId] = useState(null)   // null = new session
  const [agentId, setAgentId] = useState('claude') // which brain a new session runs
  const [inject, setInject] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [sumError, setSumError] = useState('')

  const source = tabs.find(t => t.id === sourceId)
  const targets = useMemo(() => tabs.filter(t => t.id !== sourceId && t.status !== 'exited'), [tabs, sourceId])

  // The /compact of handoffs: feed the session's recent output to a logged-in
  // CLI (claude → codex → gemini cascade) and brief the next agent with what
  // actually happened — instead of a heuristic one-liner.
  const summarize = async () => {
    if (summarizing) return
    setSummarizing(true)
    setSumError('')
    const ctxText = buildFullCard(card)
    const prompt = [
      'Summarize this terminal session so another AI coding agent can pick up the work mid-stream.',
      'Cover: what was being worked on, the current state, any errors hit, and the immediate next step.',
      'Under 120 words, plain prose, no headings or lists. Output ONLY the summary.',
      '',
      ctxText
    ].join('\n')
    try {
      const res = await window.sush.seduciaCli({ prompt, cwd: source?.cwd, engine: 'claude' })
      if (res?.ok && res.text?.trim()) setInject(res.text.trim())
      else setSumError(res?.error || 'Summarizer came back empty.')
    } catch (e) {
      setSumError(e.message)
    }
    setSummarizing(false)
  }

  useEffect(() => {
    let alive = true
    build(sourceId).then(c => {
      if (!alive) return
      setCard(c)
      setInject(buildInject(c))
      setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [build, sourceId])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const fullText = useMemo(() => buildFullCard(card), [card])

  const submit = () => {
    onSubmit({
      targetId,
      openNew: targetId === null,
      agentId: targetId === null ? agentId : undefined,
      fullText,
      injectText: inject,
      // Project root, not the live shell cwd: after a `cd src` the handoff
      // must land in the same project, not open a new one called "src".
      sourceCwd: source?.workspaceCwd || source?.sessionRootCwd || source?.cwd || null
    })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 520, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', paddingTop: '7vh' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="sush-fade-up"
        style={{ width: '100%', maxWidth: 600, background: '#0d1015', border: `1px solid ${rgba(accent, 0.32)}`, borderRadius: 'var(--r-xl)', boxShadow: '0 24px 64px rgba(0,0,0,0.7)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '86vh' }}
      >
        <div className="flex items-center justify-between" style={{ padding: '14px 18px', borderBottom: `1px solid ${rgba(accent, 0.12)}` }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <Icon name="send" size={16} color={accent} strokeWidth={2} />
            <span style={{ fontSize: 14.5, fontWeight: 900, color: 'var(--text-1)' }}>Hand off session</span>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 'var(--r-sm)', border: '1px solid #20272e', background: '#11151a', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div style={{ padding: '16px 18px', overflowY: 'auto' }} className="sush-scroll">
          {/* Source summary */}
          <div style={{ background: '#0b0e11', border: '1px solid #1a2026', borderRadius: 'var(--r-lg)', padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>From</div>
            {loading ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Gathering context…</div>
            ) : (
              <div className="flex items-center" style={{ gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-2)' }}>
                <span style={{ fontWeight: 800, color: 'var(--text-1)' }}>{source?.label}</span>
                {source?.cwd && <span className="flex items-center" style={{ gap: 5 }}><Icon name="folder" size={12} color="var(--text-3)" />{shortPath(source.cwd)}</span>}
                {card?.branch && <span className="flex items-center" style={{ gap: 5 }}><Icon name="gitBranch" size={12} color={accent} />{card.branch}{card.dirty ? ` ·${card.dirty}` : ''}</span>}
                {!!card?.recent?.length && <span style={{ color: 'var(--text-3)' }}>{card.recent.length} recent cmds</span>}
              </div>
            )}
          </div>

          {/* Target picker */}
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Drop into</div>
          <div className="flex flex-col" style={{ gap: 6, marginBottom: 16 }}>
            <div
              onClick={() => setTargetId(null)}
              style={{ padding: '9px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                background: targetId === null ? rgba(accent, 0.1) : '#0f1318', border: `1px solid ${targetId === null ? rgba(accent, 0.45) : '#20272e'}`, color: 'var(--text-2)' }}
            >
              <div className="flex items-center" style={{ gap: 10 }}>
                <Icon name="plus" size={14} color={targetId === null ? accent : 'var(--text-3)'} strokeWidth={2.2} />
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>New session{source?.cwd ? ` in ${shortPath(source.cwd)}` : ''}</span>
              </div>
              {targetId === null && (
                <div className="flex" style={{ gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
                  {TARGET_AGENTS.map(id => {
                    const a = agentById(id)
                    if (!a) return null
                    const on = agentId === id
                    return (
                      <button
                        key={id}
                        onClick={(e) => { e.stopPropagation(); setAgentId(id) }}
                        className="flex items-center"
                        style={{ gap: 6, fontSize: 11, fontWeight: 800, padding: '4px 11px', borderRadius: 999, cursor: 'pointer',
                          background: on ? rgba(a.color, 0.16) : 'transparent', color: on ? a.color : 'var(--text-3)',
                          border: `1px solid ${on ? rgba(a.color, 0.5) : '#20272e'}` }}
                      >
                        <span style={{ fontWeight: 900 }}>{a.mono}</span>
                        {a.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            {targets.map(t => (
              <button
                key={t.id}
                onClick={() => setTargetId(t.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left',
                  background: targetId === t.id ? rgba(accent, 0.1) : '#0f1318', border: `1px solid ${targetId === t.id ? rgba(accent, 0.45) : '#20272e'}`, color: 'var(--text-2)' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#42d392', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.cwd || t.profileLabel || t.shell}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Inject text */}
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: 1, textTransform: 'uppercase' }}>The brief</span>
            <button
              onClick={summarize}
              disabled={summarizing || loading}
              title="Have your claude/codex CLI read the session output and write the brief"
              className="flex items-center"
              style={{ gap: 6, fontSize: 10.5, fontWeight: 800, color: accent, background: rgba(accent, 0.1), border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 999, padding: '3px 11px', cursor: summarizing ? 'default' : 'pointer', opacity: summarizing || loading ? 0.55 : 1 }}
            >
              <Icon name="sparkles" size={11} strokeWidth={2.2} className={summarizing ? 'sush-spin' : undefined} />
              {summarizing ? 'Reading session...' : 'AI summary'}
            </button>
          </div>
          {sumError && (
            <div style={{ fontSize: 10.5, color: '#ffb74d', marginBottom: 6, lineHeight: 1.4 }}>{sumError}</div>
          )}
          <textarea
            value={inject}
            onChange={e => setInject(e.target.value)}
            spellCheck={false}
            rows={3}
            placeholder="One-line context pasted at the target's prompt…"
            style={{ width: '100%', resize: 'vertical', background: '#07090b', color: 'var(--text-2)', border: '1px solid #1c232a', borderRadius: 'var(--r-md)', padding: '10px 12px', fontSize: 12, lineHeight: 1.5, outline: 'none', fontFamily: 'inherit' }}
          />
          <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 6, lineHeight: 1.5 }}>
            {targetId === null && agentId !== 'shell'
              ? 'A new agent session boots, then the brief is typed in and submitted automatically. The full context card lands on your clipboard for a richer paste.'
              : 'Pasted as a single line at the target prompt - press Enter there to submit. The full multi-line card is copied to your clipboard.'}
          </div>
        </div>

        <div className="flex items-center justify-end" style={{ padding: '12px 18px', borderTop: `1px solid ${rgba(accent, 0.1)}`, gap: 10 }}>
          <button
            onClick={onClose}
            style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', background: '#11151a', border: '1px solid #20272e', borderRadius: 'var(--r-sm)', padding: '8px 14px', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="sush-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, color: '#0a0a0a', background: loading ? '#1c2126' : accent, border: 'none', borderRadius: 'var(--r-btn)', padding: '8px 16px', cursor: loading ? 'default' : 'pointer', boxShadow: loading ? 'none' : `0 4px 14px ${rgba(accent, 0.3)}` }}
          >
            <Icon name="send" size={13} strokeWidth={2.2} color="#0a0a0a" />
            Hand off
          </button>
        </div>
      </div>
    </div>
  )
}
