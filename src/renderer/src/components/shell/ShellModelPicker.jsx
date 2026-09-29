import React, { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import NightlyAnchoredPopover from '../NightlyAnchoredPopover'
import { agentById } from '../../lib/agents'
import {
  PICKER_PROVIDERS, effortLabelFor, effortOptionsFor, modelSpecFor, pickerModelLabel, pickerRows, providerCapabilities
} from '../../lib/nightlyModels'

// Nightly composer model controls, after T3 Code's ProviderModelPicker,
// ModelPickerContent and CompactComposerControlsMenu (MIT, (c) 2026 T3 Tools
// Inc.): a quiet "model ▾" control opening a provider rail + searchable model
// list, and a "…" menu for reasoning. Changing the model of a live session
// restarts its CLI and resumes the conversation (same as Stable); choosing
// another provider starts a new thread instead of pretending to switch.

const FAVORITES_KEY = 'sush-shell-model-favorites'

function loadFavorites() {
  try {
    const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')
    return new Set(Array.isArray(value) ? value : [])
  } catch {
    return new Set()
  }
}

function ProviderMark({ provider, size = 16 }) {
  const agent = agentById(provider) || agentById('shell')
  return (
    <span
      className="mp-mark"
      style={{ width: size, height: size, color: agent?.color, background: `${agent?.color || '#8b9bb0'}1f`, fontSize: size <= 16 ? 8.5 : 10 }}
      aria-hidden
    >
      {agent?.mono || '>_'}
    </span>
  )
}

function errorText(error) {
  if (error === 'invalid-model') return 'Use a model ID without spaces or shell characters.'
  if (error === 'invalid-effort') return 'That reasoning level is not supported by this provider.'
  if (error === 'resume-unsupported') return 'This CLI cannot resume a conversation, so the session was left running.'
  return 'This session cannot be restarted with that setting.'
}

export function ShellModelPicker({ provider, model, effort, onApply, onNewThread, disabled = false }) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState(provider || 'claude')
  const [query, setQuery] = useState('')
  const [favorites, setFavorites] = useState(loadFavorites)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [active, setActive] = useState(0)
  const anchorRef = useRef(null)
  const searchRef = useRef(null)
  const listRef = useRef(null)
  const spec = modelSpecFor(provider)
  const resumeOff = providerCapabilities(provider)?.resume === false

  useEffect(() => {
    if (!open) return
    setSection(PICKER_PROVIDERS.includes(provider) ? provider : 'favorites')
    setQuery('')
    setError('')
    requestAnimationFrame(() => searchRef.current?.focus())
  }, [open, provider])

  const rows = useMemo(() => pickerRows({ section, query, favorites }), [section, query, favorites])
  useEffect(() => { setActive(0) }, [section, query])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  const toggleFavorite = (key) => setFavorites(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next])) } catch {}
    return next
  })

  const choose = async (row) => {
    if (!row || busy) return
    if (row.provider !== provider) {
      // A running CLI can't become another provider; that's a new thread.
      setOpen(false)
      onNewThread?.({ agentId: row.provider, model: row.value })
      return
    }
    if ((row.value || null) === (model || null)) { setOpen(false); return }
    if (resumeOff) { setError(errorText('resume-unsupported')); return }
    setBusy(row.key)
    setError('')
    const result = await onApply?.({ model: row.value, effort: effort || null })
    setBusy(null)
    if (result?.ok === false) setError(errorText(result.error))
    else setOpen(false)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(rows.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(rows[active]) }
  }

  const label = spec ? pickerModelLabel(provider, model) : (agentById(provider)?.label || 'Terminal')

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="t3-control mp-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (spec ? setOpen(v => !v) : onNewThread?.({}))}
        title={spec ? `${agentById(provider)?.label} · ${label}` : 'Start an agent thread'}
      >
        <ProviderMark provider={provider || 'shell'} />
        <span className="mp-trigger-label">{label}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      <NightlyAnchoredPopover open={open} anchorRef={anchorRef} align="left" className="mp-popover" onClose={() => setOpen(false)}>
        <div className="mp-shell" data-model-picker-content>
          <nav className="mp-rail" aria-label="Providers">
            <button
              className={`mp-rail-btn${section === 'favorites' ? ' is-active' : ''}`}
              onClick={() => setSection('favorites')}
              title="Favorites"
              aria-label="Favorites"
            >
              <Icon name="star" size={16} />
            </button>
            <span className="mp-rail-sep" aria-hidden />
            {PICKER_PROVIDERS.map(id => (
              <button
                key={id}
                className={`mp-rail-btn${section === id ? ' is-active' : ''}`}
                onClick={() => { setSection(id); searchRef.current?.focus() }}
                title={agentById(id)?.label || id}
                aria-label={agentById(id)?.label || id}
              >
                <ProviderMark provider={id} size={22} />
                {id === provider && <i className="mp-rail-live" aria-label="This thread's provider" />}
              </button>
            ))}
          </nav>
          <div className="mp-main">
            <label className="mp-search">
              <Icon name="search" size={13} />
              <input
                ref={searchRef}
                value={query}
                placeholder="Search models..."
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                aria-label="Search models"
              />
            </label>
            <div className="mp-list sush-scroll" ref={listRef} role="listbox">
              {rows.map((row, index) => {
                const agent = agentById(row.provider)
                const selected = row.provider === provider && (row.value || null) === (model || null)
                const other = row.provider !== provider
                return (
                  <div
                    key={row.key}
                    data-index={index}
                    role="option"
                    aria-selected={selected}
                    className={`mp-row${index === active ? ' is-active' : ''}${busy === row.key ? ' is-busy' : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(row)}
                  >
                    <div className="mp-row-text">
                      <div className="mp-row-name">{row.label}</div>
                      <div className="mp-row-sub">
                        <ProviderMark provider={row.provider} size={12} />
                        <span>{agent?.label || row.provider}{other ? ' · new thread' : ''}</span>
                      </div>
                    </div>
                    {busy === row.key && <span className="mp-row-note">Restarting…</span>}
                    {selected && <Icon name="check" size={14} />}
                    {!row.custom && (
                      <button
                        type="button"
                        className={`mp-star${row.favorite ? ' is-on' : ''}`}
                        onClick={e => { e.stopPropagation(); toggleFavorite(row.key) }}
                        aria-label={row.favorite ? 'Remove from favorites' : 'Add to favorites'}
                        title={row.favorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Icon name="star" size={12} />
                      </button>
                    )}
                  </div>
                )
              })}
              {!rows.length && (
                <div className="mp-empty">
                  {section === 'favorites' && !query ? 'Star a model to keep it here.' : 'No models found'}
                </div>
              )}
            </div>
            {(error || resumeOff) && (
              <div className="mp-foot">
                {error || 'This CLI does not advertise resume, so its model can only change in a new thread.'}
              </div>
            )}
          </div>
        </div>
      </NightlyAnchoredPopover>
    </>
  )
}

// "…" — reasoning for this thread, plus a new thread. Mirrors T3's compact
// composer controls menu (Mode / Access become Reasoning here).
export function ShellComposerMore({ provider, model, effort, onApply, onNewThread, disabled = false }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const anchorRef = useRef(null)
  const options = useMemo(() => effortOptionsFor(provider, model), [provider, model])
  const spec = modelSpecFor(provider)
  const resumeOff = providerCapabilities(provider)?.resume === false

  const pick = async (value) => {
    if (busy || (value || '') === (effort || '')) { setOpen(false); return }
    setBusy(true)
    setError('')
    const result = await onApply?.({ model: model || null, effort: value || null })
    setBusy(false)
    if (result?.ok === false) setError(errorText(result.error))
    else setOpen(false)
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="t3-control is-icon"
        aria-label="More composer controls"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        title={effort ? `${spec?.effort?.label || 'Reasoning'}: ${effortLabelFor(provider, effort)}` : 'More'}
      >
        <span className="t3-dots" aria-hidden><i /><i /><i /></span>
      </button>
      <NightlyAnchoredPopover open={open} anchorRef={anchorRef} align="left" className="t3-menu" onClose={() => setOpen(false)}>
        <div role="menu" className="t3-menu-body">
          {options.length > 0 && (
            <>
              <div className="t3-menu-label">{spec?.effort?.label || 'Reasoning'}</div>
              {options.map(value => {
                const checked = (value || '') === (effort || '')
                return (
                  <button
                    key={value || 'default'}
                    role="menuitemradio"
                    aria-checked={checked}
                    className="t3-menu-item"
                    disabled={busy || resumeOff}
                    onClick={() => pick(value)}
                  >
                    <span className="t3-menu-radio" aria-hidden>{checked && <i />}</span>
                    {effortLabelFor(provider, value)}
                  </button>
                )
              })}
              <div className="t3-menu-sep" />
            </>
          )}
          <button role="menuitem" className="t3-menu-item" onClick={() => { setOpen(false); onNewThread?.({}) }}>
            <Icon name="plus" size={13} /> New thread…
          </button>
          {(error || (resumeOff && options.length > 0)) && (
            <div className="t3-menu-note">{error || 'Reasoning changes need resume, which this CLI does not advertise.'}</div>
          )}
          {busy && <div className="t3-menu-note">Restarting and resuming…</div>}
        </div>
      </NightlyAnchoredPopover>
    </>
  )
}
