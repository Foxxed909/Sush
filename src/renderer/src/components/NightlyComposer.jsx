import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { agentById } from '../lib/agents'
import NightlyModelMenu from './NightlyModelMenu'

function compactTokens(value) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return String(Math.round(n))
}

export default function NightlyComposer({ activeTab, providerMeta, accent, disabled = false, onSend, onOpenLauncher, onChangeSessionModel, hushSlotRef }) {
  const [drafts, setDrafts] = useState({})
  const draftKey = activeTab?.id || 'none'
  const value = drafts[draftKey] || ''
  const setValue = next => setDrafts(previous => ({
    ...previous,
    [draftKey]: typeof next === 'function' ? next(previous[draftKey] || '') : next
  }))
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
  }, [draftKey])

  const submit = () => {
    const text = value.trim()
    if (!text || disabled || !activeTab) return
    onSend?.(text)
    setValue('')
  }

  return (
    <div className="nightly-composer-wrap">
      <div className="nightly-composer">
        <textarea
          ref={ref}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault()
              submit()
            }
          }}
          aria-label="Message active session"
          rows={1}
          disabled={disabled || !activeTab}
          placeholder={activeTab ? `Message ${agent?.label || activeTab.label}…` : 'Open a session to start'}
          spellCheck={false}
        />
        <div className="nightly-composer-meta">
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
          {/* Only real telemetry here: the topbar already carries account and
              quota, and an unavailable context window is simply not shown. */}
          {providerMeta?.contextTokens != null && (
            <span className="nightly-context-note" title="Provider-reported input context for the latest observed turn">
              Context {compactTokens(providerMeta.contextTokens)}
            </span>
          )}
          <span className="nightly-composer-hint">Shift+Enter newline · Ctrl+J focus</span>
          {/* Hush docks its mic here (portal) instead of floating over the rail. */}
          <span ref={hushSlotRef} className="nightly-hush-slot" />
          <button type="button" className="nightly-send" onClick={submit} disabled={!value.trim() || disabled || !activeTab} title="Send">
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

