import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { agentById } from '../lib/agents'

export default function NightlyComposer({ activeTab, providerMeta, accent, disabled = false, onSend, onOpenLauncher }) {
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
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          disabled={disabled || !activeTab}
          placeholder={activeTab ? `Message ${agent?.label || activeTab.label}…` : 'Open a session to start'}
          spellCheck={false}
        />
        <div className="nightly-composer-meta">
          <button type="button" className="nightly-model-pill" onClick={onOpenLauncher} title="Open agent/model launcher">
            <span style={{ color: agent?.color || accent, fontWeight: 900 }}>{agent?.mono || '>_'}</span>
            {providerMeta?.model || agent?.label || 'Shell'}
            <Icon name="chevronDown" size={10} />
          </button>
          <span className="nightly-context-note" title="Context-window telemetry stays separate from subscription usage and only appears when the CLI exposes it">
            Context {activeTab?.contextPct != null ? `${activeTab.contextPct}%` : '—'}
          </span>
          {providerMeta?.accountLabel && (
            <span className="nightly-context-note" title="Active CLI account slot">
              {providerMeta.accountLabel}
            </span>
          )}
          {providerMeta?.usagePct != null && (
            <span className="nightly-context-note" title={`Session ${providerMeta.sessionPct ?? '—'}% · week ${providerMeta.weekPct ?? '—'}%`}>
              Usage {providerMeta.usagePct}%
            </span>
          )}
          <span className="nightly-composer-hint">Shift+Enter newline · Ctrl+J focus</span>
          <button type="button" className="nightly-send" onClick={submit} disabled={!value.trim() || disabled || !activeTab} title="Send">
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
