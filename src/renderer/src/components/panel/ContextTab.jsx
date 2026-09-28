import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import { stripAnsi } from '../../lib/agentActivity'
import { rgba } from '../../lib/ui'
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

export default function ContextTab({ accent, cwd, activeTab, providerMeta, onOpenFile }) {
  const [data, setData] = useState({ loading: true, git: null, docs: [], tail: '' })
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestRef.current
    if (!cwd) {
      setData({ loading: false, git: null, docs: [], tail: '' })
      return
    }

    setData(prev => ({ ...prev, loading: true }))
    const docsPromise = Promise.all(PROJECT_DOCS.map(async doc => {
      const path = joinPath(cwd, doc.name)
      try {
        const res = await window.sush?.readFile?.({ path })
        if (!res?.ok || !res.content) return null
        return { ...doc, path, content: String(res.content) }
      } catch {
        return null
      }
    }))

    const gitPromise = window.sush?.gitStatus?.({ cwd }).catch?.(() => null) ?? Promise.resolve(null)
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
  }, [cwd, activeTab?.id])

  useEffect(() => {
    load()
    return () => { requestRef.current += 1 }
  }, [load])

  const changed = data.git?.files || []
  const contextSummary = useMemo(() => {
    const pieces = []
    if (data.docs.length) pieces.push(`${data.docs.length} project doc${data.docs.length === 1 ? '' : 's'}`)
    if (changed.length) pieces.push(`${changed.length} changed file${changed.length === 1 ? '' : 's'}`)
    if (data.tail) pieces.push('terminal tail')
    return pieces.length ? pieces.join(' · ') : 'No observed sources yet'
  }, [data.docs.length, changed.length, data.tail])

  if (!cwd) {
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
      />

      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        <section className="nightly-context-card">
          <div className="nightly-context-card-title">
            <span>Session</span>
            <small>observed</small>
          </div>
          <div className="nightly-context-kv"><span>Provider</span><strong>{providerName(activeTab)}</strong></div>
          <div className="nightly-context-kv"><span>Model</span><strong>{providerMeta?.model || activeTab?.model || 'Provider default'}</strong></div>
          <div className="nightly-context-kv"><span>Reasoning</span><strong>{providerMeta?.effort || activeTab?.effort || 'Provider default'}</strong></div>
          <div className="nightly-context-kv"><span>Account</span><strong>{providerMeta?.accountLabel || '—'}</strong></div>
          <div className="nightly-context-kv">
            <span>Context window</span>
            <strong>{providerMeta?.contextTokens != null ? providerMeta.contextTokens.toLocaleString() + ' tokens' : 'Not exposed by active CLI'}</strong>
          </div>
          {providerMeta?.usagePct != null && (
            <div className="nightly-context-kv">
              <span>Subscription usage</span>
              <strong>{providerMeta.usagePct}%</strong>
            </div>
          )}
        </section>

        <section className="nightly-context-card">
          <div className="nightly-context-card-title">
            <span>Project</span>
            <small>{data.git?.repo ? data.git.branch || 'git' : 'workspace'}</small>
          </div>
          <div className="nightly-context-path" title={cwd}>{cwd}</div>
          {changed.length > 0 && (
            <div className="nightly-context-files">
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
            <div className="nightly-context-muted">No AGENTS.md, CLAUDE.md, GEMINI.md, README.md, or Copilot instructions detected at the project root.</div>
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

        <div className="nightly-context-disclaimer" style={{ borderColor: rgba(accent, .16) }}>
          This pane shows context Sush can observe. It does not claim that every detected file is loaded into the provider's model context.
        </div>
      </div>
    </div>
  )
}
