import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import { stripAnsi } from '../../lib/agentActivity'
import { rgba } from '../../lib/ui'
import { agentById } from '../../lib/agents'
import { lineageOf } from '../../lib/lineage'
import { buildContextBundle } from '../../lib/contextBundle'
import { PanelEmpty, TabHeader, copyToClipboard, joinPath } from './shared'

const PROJECT_DOCS = [
  { name: 'AGENTS.md', kind: 'Agent instructions' },
  { name: 'CLAUDE.md', kind: 'Claude instructions' },
  { name: 'GEMINI.md', kind: 'Gemini instructions' },
  { name: 'README.md', kind: 'Project overview' },
  { name: '.github/copilot-instructions.md', kind: 'Copilot instructions' }
]

function preview(text, max = 460) {
  const value = String(text || '').replace(/\r/g, '').trim()
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value
}

function providerName(tab) {
  const id = tab?.agentId
  if (!id || id === 'shell') return 'Shell'
  if (id === 'claude') return 'Claude Code'
  if (id === 'codex') return 'Codex'
  if (id === 'gemini') return 'Gemini'
  if (id === 'opencode') return 'OpenCode'
  if (id === 'grok') return 'Grok'
  return id
}

export default function ContextTab({ accent, cwd, activeTab, tabs = [], providerMeta, onOpenFile }) {
  const [data, setData] = useState({ loading: true, git: null, docs: [], tail: '' })
  const [copied, setCopied] = useState(false)
  const requestRef = useRef(0)
  const copyTimerRef = useRef(null)
  const projectRoot = activeTab?.workspaceCwd || cwd || null
  const checkoutRoot = activeTab?.sessionRootCwd || cwd || projectRoot
  const liveCwd = activeTab?.cwd || checkoutRoot
  const agent = agentById(activeTab?.agentId)
  const lineage = lineageOf(activeTab, tabs)
  const model = providerMeta?.model || activeTab?.model || 'Provider default'
  const effort = providerMeta?.effort || activeTab?.effort || ''

  const load = useCallback(async () => {
    const requestId = ++requestRef.current
    if (!checkoutRoot) {
      setData({ loading: false, git: null, docs: [], tail: '' })
      return
    }

    setData(prev => ({ ...prev, loading: true }))
    const docsPromise = Promise.all(PROJECT_DOCS.map(async doc => {
      const path = joinPath(checkoutRoot, doc.name)
      try {
        const res = await window.sush?.readFile?.({ path })
        if (!res?.ok || !res.content) return null
        return { ...doc, path, content: String(res.content) }
      } catch {
        return null
      }
    }))

    const gitPromise = window.sush?.gitStatus?.({ cwd: checkoutRoot }).catch?.(() => null) ?? Promise.resolve(null)
    const tailPromise = activeTab?.id
      ? window.sush?.getScrollback?.({ tabId: activeTab.id, chars: 5000 }).catch?.(() => null)
      : Promise.resolve(null)

    const [docs, git, tail] = await Promise.all([docsPromise, gitPromise, tailPromise])
    if (requestId !== requestRef.current) return

    setData({
      loading: false,
      git: git || null,
      docs: docs.filter(Boolean),
      tail: stripAnsi(tail?.text || '').replace(/\r/g, '').trim()
    })
  }, [checkoutRoot, activeTab?.id])

  useEffect(() => {
    load()
    return () => {
      requestRef.current += 1
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [load])

  const changed = data.git?.files || []
  const contextSummary = useMemo(() => {
    const pieces = []
    if (data.docs.length) pieces.push(`${data.docs.length} project doc${data.docs.length === 1 ? '' : 's'}`)
    if (changed.length) pieces.push(`${changed.length} changed file${changed.length === 1 ? '' : 's'}`)
    if (data.tail) pieces.push('terminal tail')
    return pieces.length ? pieces.join(' · ') : 'No observed sources yet'
  }, [data.docs.length, changed.length, data.tail])

  if (!checkoutRoot) {
    return (
      <PanelEmpty icon="layers" accent={accent} hint="Open a project session to inspect the context Sush can actually observe.">
        No project context
      </PanelEmpty>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="layers"
        title="Context"
        sub={contextSummary}
        onRefresh={load}
        right={
          <button
            type="button"
            onClick={() => {
              const bundle = buildContextBundle({
                projectRoot,
                checkoutRoot,
                liveCwd,
                provider: providerName(activeTab),
                model,
                effort: effort || 'provider default',
                account: providerMeta?.accountLabel || '—',
                git: data.git,
                docs: data.docs,
                tail: data.tail,
                lineage
              })
              copyToClipboard(bundle)
              setCopied(true)
              if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
              copyTimerRef.current = setTimeout(() => setCopied(false), 1400)
            }}
            title={copied ? 'Context bundle copied' : 'Copy bounded context bundle'}
            aria-label={copied ? 'Context bundle copied' : 'Copy context bundle'}
            className="sush-icon-btn flex items-center justify-center"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: '1px solid var(--border-1)',
              background: copied ? rgba(accent, 0.1) : 'transparent',
              color: copied ? accent : 'var(--text-3)',
              cursor: 'pointer'
            }}
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        <section className="nightly-context-card">
          <div className="nightly-context-hero">
            <span className="nightly-context-mono" style={{ color: agent?.color || accent, background: rgba(agent?.color || accent, 0.1), borderColor: rgba(agent?.color || accent, 0.22) }}>{agent?.mono || '>_'}</span>
            <span className="nightly-context-hero-copy">
              <strong>{providerName(activeTab)}</strong>
              <small>{model}{effort ? ` · ${effort}` : ''}</small>
            </span>
            <span className="nightly-context-badge" title="Read from the running CLI and Sush's own records; nothing here is estimated.">observed</span>
          </div>

          <div className="nightly-context-facts">
            <div className="nightly-context-fact">
              <span>Model</span>
              <strong className={providerMeta?.model || activeTab?.model ? '' : 'is-muted'}>{model}</strong>
            </div>
            <div className="nightly-context-fact">
              <span>Reasoning</span>
              <strong className={providerMeta?.effort || activeTab?.effort ? '' : 'is-muted'}>{effort || 'Provider default'}</strong>
            </div>
            <div className="nightly-context-fact">
              <span>Account</span>
              <strong className={providerMeta?.accountLabel ? '' : 'is-muted'}>{providerMeta?.accountLabel || 'Not detected'}</strong>
            </div>
            <div className="nightly-context-fact">
              <span>Subscription usage</span>
              {providerMeta?.usagePct != null ? (
                <strong className="nightly-context-usage">
                  <span className="nightly-usage-bar"><span style={{ width: `${Math.max(3, Math.min(100, providerMeta.usagePct))}%` }} /></span>
                  {providerMeta.usagePct}%
                </strong>
              ) : <strong className="is-muted">Not available</strong>}
            </div>
          </div>

          {(lineage.from || lineage.to.length > 0) && (
            <div className="nightly-context-lineage">
              {lineage.from && (
                <span>Continued from <strong>{lineage.from.label || lineage.from.agentId}</strong>{lineage.sourceAlive ? '' : ' (closed)'}</span>
              )}
              {lineage.to.map(t => (
                <span key={t.id}>Handed off to <strong>{t.label}</strong></span>
              ))}
            </div>
          )}

          <div className={`nightly-context-window${providerMeta?.contextTokens != null ? '' : ' is-unavailable'}`}>
            <span>Context window</span>
            <strong>
              {providerMeta?.contextTokens != null
                ? `${providerMeta.contextTokens.toLocaleString()} tokens`
                : 'This CLI does not report it'}
            </strong>
          </div>
        </section>

        <section className="nightly-context-card">
          <div className="nightly-context-card-title">
            <span>Project</span>
            <small>{data.git?.repo ? data.git.branch || 'git' : 'workspace'}</small>
          </div>
          <div className="nightly-context-paths">
            <div>
              <span>Project root</span>
              <code title={projectRoot || ''}>{projectRoot || '—'}</code>
            </div>
            {checkoutRoot && checkoutRoot !== projectRoot && (
              <div>
                <span>Checkout</span>
                <code title={checkoutRoot}>{checkoutRoot}</code>
              </div>
            )}
            {liveCwd && liveCwd !== checkoutRoot && (
              <div>
                <span>Live cwd</span>
                <code title={liveCwd}>{liveCwd}</code>
              </div>
            )}
          </div>
          {changed.length > 0 && (
            <div className="nightly-context-files">
              <div className="nightly-context-files-title">Changes <small>{changed.length}</small></div>
              {changed.slice(0, 8).map(file => (
                <div key={file.path}>
                  <span>{file.status || file.rawStatus || '·'}</span>
                  <code>{file.path}</code>
                </div>
              ))}
              {changed.length > 8 && <small>+{changed.length - 8} more changes</small>}
            </div>
          )}
        </section>

        <section className="nightly-context-card">
          <div className="nightly-context-card-title">
            <span>Detected project docs</span>
            <small>{data.loading ? 'reading…' : data.docs.length}</small>
          </div>
          {!data.loading && !data.docs.length && (
            <div className="nightly-context-muted">No AGENTS.md, CLAUDE.md, GEMINI.md, README.md, or Copilot instructions detected at this checkout root.</div>
          )}
          {data.docs.map(doc => (
            <div key={doc.path} className="nightly-context-doc">
              <div className="nightly-context-doc-head">
                <button onClick={() => onOpenFile?.(doc.path)} title={doc.path}>
                  <Icon name="fileText" size={12} />
                  <span>{doc.name}</span>
                </button>
                <small>{doc.kind}</small>
              </div>
              <pre>{preview(doc.content)}</pre>
            </div>
          ))}
        </section>

        <section className="nightly-context-card">
          <div className="nightly-context-card-title">
            <span>Recent terminal tail</span>
            <button
              type="button"
              onClick={() => copyToClipboard(data.tail)}
              disabled={!data.tail}
              title="Copy terminal tail"
            >
              <Icon name="copy" size={11} />
            </button>
          </div>
          {data.tail
            ? <pre className="nightly-context-tail">{preview(data.tail, 1800)}</pre>
            : <div className="nightly-context-muted">No captured terminal output yet.</div>}
        </section>

        <div className="nightly-context-disclaimer">
          This pane shows context Sush can observe. It does not claim that every detected file is loaded into the provider's model context.
        </div>
      </div>
    </div>
  )
}
