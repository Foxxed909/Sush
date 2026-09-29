import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { agentById } from '../lib/agents'
import NightlyModelMenu from './NightlyModelMenu'
import { ShellComposerMore, ShellContextControl, ShellModelPicker } from './shell/ShellModelPicker'
import { useThreadFeed } from '../hooks/useThreadFeed'
import { latestContextTokens } from '../lib/threadTurns'
import { useGitBranch } from '../hooks/useGitBranch'
import { workspaceLabel } from '../lib/workspaces'

function compactTokens(value) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return String(Math.round(n))
}

// variant="t3": the Nightly shell's composer, after T3 Code's ChatComposer
// (MIT, (c) 2026 T3 Tools Inc.) — one card, round send, and a branch toolbar
// under it. The default variant is the Stable (Quiet Nights) composer.
export default function NightlyComposer({ activeTab, providerMeta, accent, disabled = false, onSend, onOpenLauncher, onChangeSessionModel, hushSlotRef, variant = 'default', onOpenPane, onNewThread }) {
  const t3 = variant === 't3'
  const branchRoot = t3 ? (activeTab?.sessionRootCwd || activeTab?.workspaceCwd || activeTab?.cwd || null) : null
  const branch = useGitBranch(branchRoot)
  // Context in use, from the bridged transcript's recorded usage (Nightly).
  const { items: threadItems } = useThreadFeed(t3 ? activeTab : null)
  const usedTokens = t3 ? latestContextTokens(threadItems) : null
  const [value, setValue] = useState('')
  const ref = useRef(null)
  const agent = agentById(activeTab?.agentId) || agentById('shell')

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j' && !e.target?.closest?.('.xterm')) {
        e.preventDefault()
        ref.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Other panes (Changes, Files) can drop text into the message box. It only
  // fills it: the user always presses Enter themselves.
  useEffect(() => {
    const onFill = (e) => {
      const text = String(e.detail?.text ?? '')
      if (!text) return
      setValue(prev => (prev ? `${prev.replace(/\s+$/, '')}\n\n${text}` : text))
      requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
      })
    }
    window.addEventListener('sush:composer-fill', onFill)
    return () => window.removeEventListener('sush:composer-fill', onFill)
  }, [])

  const submit = () => {
    const text = value.trim()
    if (!text || disabled || !activeTab) return
    onSend?.(text)
    setValue('')
  }

  return (
    <div className={`nightly-composer-wrap${t3 ? ' is-t3' : ''}`}>
      <div className="nightly-composer">
        <textarea
          ref={ref}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          disabled={disabled || !activeTab}
          placeholder={!activeTab ? 'Open a session to start' : t3 ? 'Ask for changes, send follow-ups, or paste context' : `Message ${agent?.label || activeTab.label}…`}
          spellCheck={false}
        />
        <div className="nightly-composer-meta">
          {t3 ? (
            <>
              <ShellModelPicker
                provider={activeTab?.agentId || 'shell'}
                model={providerMeta?.model || activeTab?.model || null}
                effort={providerMeta?.effort || activeTab?.effort || null}
                disabled={!activeTab?.id}
                onApply={onChangeSessionModel}
                onNewThread={({ agentId, model: nextModel } = {}) => onNewThread ? onNewThread({ agentId, model: nextModel }) : onOpenLauncher?.()}
              />
              <ShellContextControl
                provider={activeTab?.agentId || 'shell'}
                model={providerMeta?.model || activeTab?.model || null}
                usedTokens={usedTokens}
                disabled={!activeTab?.id || disabled}
                onCommand={(command) => onSend?.(command)}
              />
              <ShellComposerMore
                provider={activeTab?.agentId || 'shell'}
                model={providerMeta?.model || activeTab?.model || null}
                effort={providerMeta?.effort || activeTab?.effort || null}
                disabled={!activeTab?.id}
                onApply={onChangeSessionModel}
                onNewThread={() => onOpenLauncher?.()}
              />
            </>
          ) : (
          <span className="nightly-model-control">
            <span className="nightly-model-provider" style={{ color: agent?.color || accent }}>{agent?.mono || '>_'}</span>
            <NightlyModelMenu
              provider={activeTab?.agentId || 'shell'}
              model={providerMeta?.model || activeTab?.model || null}
              effort={providerMeta?.effort || activeTab?.effort || null}
              accent={accent}
              onApply={onChangeSessionModel}
              onOpenLauncher={onOpenLauncher}
            />
          </span>
          )}
          {/* Only real telemetry here: the topbar already carries account and
              quota, and an unavailable context window is simply not shown. */}
          {!t3 && providerMeta?.contextTokens != null && (
            <span className="nightly-context-note" title="Provider-reported input context for the latest observed turn">
              Context {compactTokens(providerMeta.contextTokens)}
            </span>
          )}
          {!t3 && <span className="nightly-composer-hint">Shift+Enter newline · Ctrl+J focus</span>}
          {t3 && <span className="nightly-composer-spacer" />}
          {/* Hush docks its mic here (portal) instead of floating over the rail. */}
          <span ref={hushSlotRef} className="nightly-hush-slot" />
          <button type="button" className="nightly-send" onClick={submit} disabled={!value.trim() || disabled || !activeTab} title="Send">
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </div>
      {t3 && activeTab?.id && (
        <div className="t3-branch-toolbar">
          <span className="t3-branch-env" title={activeTab.sessionRootCwd || activeTab.cwd}>
            <Icon name="folder" size={11} />
            {activeTab.sessionRootCwd && activeTab.workspaceCwd && activeTab.sessionRootCwd !== activeTab.workspaceCwd ? 'Worktree' : 'Local'} · {workspaceLabel(activeTab)}
          </span>
          <span className="nightly-composer-spacer" />
          {branch && (
            <button type="button" className="t3-branch-name" onClick={() => onOpenPane?.('changes')} title="Review changes on this branch">
              <Icon name="gitBranch" size={11} />
              <span>{branch.name}</span>
              {branch.changes > 0 && <em>{branch.changes} changed</em>}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
