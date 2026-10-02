import React, { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import NightlyAnchoredPopover from '../NightlyAnchoredPopover'
import ProviderLogo from '../ProviderLogo'
import { agentById } from '../../lib/agents'
import { budgetRange, clampBudget, geminiThreshold, loadContextBudget, saveContextBudget } from '../../lib/contextBudget'
import {
  CONTEXT_COMMANDS, contextWindowFor, formatTokens, PICKER_PROVIDERS, effortLabelFor, effortOptionsFor, modelSpecFor, pickerModelLabel, pickerRows, providerCapabilities
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
  return <ProviderLogo provider={provider} size={size} title={agentById(provider)?.label} />
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
                <ProviderMark provider={id} size={18} />
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
                      {(query || section === 'favorites' || other) && (
                        <div className="mp-row-sub">
                          <ProviderMark provider={row.provider} size={12} />
                          <span>{agent?.label || row.provider}{other ? ' · new thread' : ''}</span>
                        </div>
                      )}
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

// Context: how much of the model's window this thread uses, and the CLI's own
// ways to shrink or reset it. Numbers come only from the transcript's recorded
// usage (bridged Claude threads); elsewhere the control says so plainly.
// "150k", "1.2m", "90000" → tokens.
export function parseTokenInput(text) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*([km])?\s*$/i.exec(String(text ?? ''))
  if (!m) return null
  const n = Number(m[1]) * (m[2] ? (m[2].toLowerCase() === 'm' ? 1_000_000 : 1000) : 1)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

const BUDGET_NOTES = {
  claude: 'Claude compacts once the conversation reaches this size. Its floor is 100K.',
  codex: 'Codex compacts once a turn crosses this many tokens.',
  gemini: 'Gemini compresses at this share of its window. It is a Gemini-wide setting, saved to your Gemini settings.'
}

// Auto-compact budget: a slider plus an exact field, from the CLI's floor up
// to the full window. It caps when the CLI compacts, not the model's window.
function ContextBudget({ provider, windowSize, onNewThread }) {
  const range = budgetRange(provider, windowSize)
  const [saved, setSaved] = useState(() => loadContextBudget(provider))
  const [draft, setDraft] = useState(saved)
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  useEffect(() => { const v = loadContextBudget(provider); setSaved(v); setDraft(v); setStatus('') }, [provider])
  if (!range) return null
  const value = draft == null ? range.max : Math.min(draft, range.max)
  const commit = async (next) => {
    const clean = clampBudget(provider, next, range.max)
    setDraft(clean)
    setSaved(saveContextBudget(provider, clean))
    setStatus('Applies from the next launch')
    if (provider === 'gemini') {
      const res = await window.sush?.geminiCompression?.({ threshold: clean == null ? null : geminiThreshold(clean, range.max) })
      if (res && !res.ok) setStatus(res.error || 'Could not update Gemini settings')
    }
  }
  const pct = Math.round((value / range.max) * 100)
  return (
    <div className="ctx-budget">
      <div className="t3-menu-label">Auto-compact at</div>
      <div className="ctx-budget-head">
        <strong>{draft == null ? 'Full window' : formatTokens(value)}</strong>
        <span>{draft == null ? formatTokens(range.max) : `${pct}% of ${formatTokens(range.max)}`}</span>
      </div>
      <input
        type="range"
        className="ctx-budget-range"
        aria-label="Auto-compact budget"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        style={{ '--ctx-fill': `${((value - range.min) / Math.max(1, range.max - range.min)) * 100}%` }}
        onChange={e => setDraft(Number(e.target.value) >= range.max ? null : Number(e.target.value))}
        onPointerUp={e => commit(Number(e.currentTarget.value))}
        onKeyUp={e => commit(Number(e.currentTarget.value))}
      />
      <div className="ctx-budget-scale"><span>{formatTokens(range.min)}</span><span>{formatTokens(range.max)}</span></div>
      <form
        className="ctx-budget-exact"
        onSubmit={e => { e.preventDefault(); const n = parseTokenInput(text); if (n) { commit(n); setText('') } }}
      >
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={`Exact, e.g. ${formatTokens(Math.round((range.min + range.max) / 2 / 1000) * 1000)}`}
          aria-label="Exact auto-compact budget"
        />
        <button type="submit" disabled={!parseTokenInput(text)}>Set</button>
        <button type="button" disabled={saved == null} onClick={() => commit(null)}>Full</button>
      </form>
      <div className="t3-menu-note">{BUDGET_NOTES[provider]}{status ? <><br /><b>{status}.</b></> : null}</div>
      {status && onNewThread && (
        <button type="button" className="t3-menu-item" onClick={onNewThread}>
          <Icon name="plus" size={13} /> New thread with this budget
        </button>
      )}
    </div>
  )
}

export function ShellContextControl({ provider, model, usedTokens = null, reportedWindow = null, onCommand, onNewThread, disabled = false }) {
  const [open, setOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const anchorRef = useRef(null)
  const windowSize = contextWindowFor(provider, model, reportedWindow)
  const commands = CONTEXT_COMMANDS[provider] || null
  const pct = windowSize && usedTokens != null ? Math.min(100, (usedTokens / windowSize) * 100) : null
  const tone = pct == null ? '' : pct >= 85 ? ' is-high' : pct >= 60 ? ' is-mid' : ''
  useEffect(() => { if (!open) setConfirmClear(false) }, [open])
  if (!commands) return null

  const run = (command) => {
    setOpen(false)
    onCommand?.(command)
  }
  const r = 6.5
  const circ = 2 * Math.PI * r

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`t3-control ctx-trigger${tone}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        title={pct != null ? `${Math.round(pct)}% of the ${formatTokens(windowSize)} context window` : 'Context'}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="ctx-ring">
          <circle cx="8" cy="8" r={r} className="ctx-ring-track" />
          {pct != null && (
            <circle cx="8" cy="8" r={r} className="ctx-ring-fill" strokeDasharray={`${(pct / 100) * circ} ${circ}`} transform="rotate(-90 8 8)" />
          )}
        </svg>
        <span>{usedTokens != null ? formatTokens(usedTokens) : 'Context'}{windowSize ? <em> / {formatTokens(windowSize)}</em> : null}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      <NightlyAnchoredPopover open={open} anchorRef={anchorRef} align="left" className="t3-menu" onClose={() => setOpen(false)}>
        <div role="menu" className="t3-menu-body ctx-menu">
          <div className="t3-menu-label">Context window</div>
          <div className="ctx-window">
            <strong>{windowSize ? `${formatTokens(windowSize)} tokens` : 'Set by the model'}</strong>
            <span>{windowSize ? 'Full window — the maximum this model offers' : `${agentById(provider)?.label || provider} picks its window per model`}</span>
          </div>
          <div className="ctx-bar" aria-hidden>
            <i style={{ width: `${pct ?? 0}%` }} className={tone.trim()} />
          </div>
          <div className="ctx-used">
            {usedTokens != null
              ? `${usedTokens.toLocaleString()} tokens in use${pct != null ? ` · ${pct.toFixed(pct < 10 ? 1 : 0)}%` : ''}`
              : 'Usage appears once the transcript records a reply.'}
          </div>
          <div className="t3-menu-sep" />
          <ContextBudget provider={provider} windowSize={windowSize} onNewThread={onNewThread ? () => { setOpen(false); onNewThread() } : null} />
          {budgetRange(provider, windowSize) && <div className="t3-menu-sep" />}
          <button role="menuitem" className="t3-menu-item" onClick={() => run(commands.compact)}>
            <Icon name="layers" size={13} /> Compact conversation <small>{commands.compact}</small>
          </button>
          <button
            role="menuitem"
            className={`t3-menu-item${confirmClear ? ' is-danger' : ''}`}
            onClick={() => (confirmClear ? run(commands.clear) : setConfirmClear(true))}
          >
            <Icon name="trash" size={13} /> {confirmClear ? 'Click again to clear' : 'Clear conversation'} <small>{commands.clear}</small>
          </button>
          <div className="t3-menu-note">Sent to the CLI as its own command — you'll see it in the terminal.</div>
        </div>
      </NightlyAnchoredPopover>
    </>
  )
}
