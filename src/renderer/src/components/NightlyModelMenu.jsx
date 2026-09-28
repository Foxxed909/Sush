import React, { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icons'
import { modelSpecFor } from '../lib/nightlyModels'
import { rgba } from '../lib/ui'
import NightlyAnchoredPopover from './NightlyAnchoredPopover'

export default function NightlyModelMenu({
  provider,
  model,
  effort,
  accent,
  onApply,
  onOpenLauncher
}) {
  const spec = modelSpecFor(provider)
  const [open, setOpen] = useState(false)
  const [nextModel, setNextModel] = useState(model || '')
  const [nextEffort, setNextEffort] = useState(effort || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const anchorRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setNextModel(model || '')
    setNextEffort(effort || '')
    setError('')
  }, [open, model, effort])

  const dirty = useMemo(
    () => String(nextModel || '').trim() !== String(model || '').trim()
      || String(nextEffort || '').trim() !== String(effort || '').trim(),
    [nextModel, nextEffort, model, effort]
  )

  if (!spec) {
    return (
      <button type="button" className="nightly-model-pill" onClick={onOpenLauncher} title="Launch another agent/model">
        {provider || 'Shell'}
        <Icon name="chevronDown" size={10} />
      </button>
    )
  }

  const listId = `nightly-active-models-${provider}`

  return (
    <div className="nightly-model-menu">
      <button
        ref={anchorRef}
        type="button"
        className="nightly-model-pill"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        title="Change model or reasoning for this session"
      >
        {model || provider}
        {effort && <span className="nightly-effort-tag">{effort}</span>}
        <Icon name="chevronDown" size={10} />
      </button>

      <NightlyAnchoredPopover
        open={open}
        anchorRef={anchorRef}
        align="left"
        className="nightly-model-popover"
        onClose={() => setOpen(false)}
      >
          <div className="nightly-model-popover-head">
            <span>Session model</span>
            <small>restart + resume</small>
          </div>

          <label>
            <span>Model</span>
            <input
              list={listId}
              value={nextModel}
              onChange={e => setNextModel(e.target.value)}
              placeholder={spec.placeholder}
              spellCheck={false}
            />
            <datalist id={listId}>
              {spec.options.filter(o => o.value).map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </datalist>
          </label>

          {spec.effort && (
            <label>
              <span>{spec.effort.label}</span>
              <select value={nextEffort} onChange={e => setNextEffort(e.target.value)}>
                {spec.effort.options.map(v => (
                  <option key={v || 'default'} value={v}>{v || 'Provider default'}</option>
                ))}
              </select>
            </label>
          )}

          <div className="nightly-model-popover-note">
            Applying restarts this CLI and resumes its conversation in the same project.
          </div>
          {error && <div className="nightly-model-popover-error">{error}</div>}

          <div className="nightly-model-popover-actions">
            <button type="button" className="is-quiet" onClick={() => { setOpen(false); onOpenLauncher?.() }}>
              New session…
            </button>
            <button
              type="button"
              className="is-primary"
              disabled={!dirty || busy}
              style={{ '--model-accent': accent, '--model-accent-bg': rgba(accent, .12) }}
              onClick={async () => {
                if (!dirty || busy) return
                setBusy(true)
                setError('')
                const result = await onApply?.({
                  model: String(nextModel || '').trim() || null,
                  effort: String(nextEffort || '').trim() || null
                })
                setBusy(false)
                if (result?.ok !== false) {
                  setOpen(false)
                } else {
                  setError(result?.error === 'invalid-model'
                    ? 'Use a provider model ID without spaces or shell characters.'
                    : result?.error === 'invalid-effort'
                      ? 'That reasoning level is not supported by this provider.'
                      : 'This session cannot be resumed with that setting.')
                }
              }}
            >
              {busy ? 'Restarting…' : 'Apply'}
            </button>
          </div>
      </NightlyAnchoredPopover>
    </div>
  )
}
