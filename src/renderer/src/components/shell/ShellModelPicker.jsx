import React, { useEffect, useMemo, useRef, useState } from 'react'
import StatusIcon from '../StatusIcon'
import Icon from '../Icons'
import NightlyAnchoredPopover from '../NightlyAnchoredPopover'
import ProviderLogo from '../ProviderLogo'
import { agentById } from '../../lib/agents'
import { budgetRange, clampBudget, geminiThreshold, loadContextBudget, saveContextBudget } from '../../lib/contextBudget'
import {
  CONTEXT_COMMANDS, contextWindowFor, formatTokens, PICKER_PROVIDERS, effortLabelFor, effortOptionsFor, modelSpecFor, permissionLabel, permissionModesFor, pickerModelLabel, pickerRows, providerCapabilities
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

const EFFORT_HINTS = {
  default: "The CLI's own default",
  none: 'No extra reasoning',
  minimal: 'The lightest touch',
  low: 'Quick, light thinking',
  medium: 'Balanced',
  high: 'Deeper reasoning',
  xhigh: 'Thinks hard before acting',
  max: 'The longest, deepest thinking'
}

export function ShellModelPicker({ provider, model, effort, permission = null, onApply, onNewThread, disabled = false }) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState(provider || 'claude')
  const [query, setQuery] = useState('')
  const [favorites, setFavorites] = useState(loadFavorites)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [active, setActive] = useState(0)
  // Effort flyout: hover a model (or press →, or click its ›) and its effort
  // levels open beside the list. Picking one applies model + effort.
  const [flyout, setFlyout] = useState(null) // { row, top }
  const [permOpen, setPermOpen] = useState(false)
  const permModes = permissionModesFor(provider)
  const flyTimer = useRef(null)
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
    setFlyout(null)
    setPermOpen(false)
    requestAnimationFrame(() => searchRef.current?.focus())
  }, [open, provider]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const openFlyout = (row, el) => {
    clearTimeout(flyTimer.current)
    setPermOpen(false)
    if (!row || !effortOptionsFor(row.provider, row.value).length || !el) { setFlyout(null); return }
    const shell = el.closest('.mp-shell')
    const shellBox = shell?.getBoundingClientRect()
    const rowTop = el.getBoundingClientRect().top - (shellBox?.top || 0) - 8
    // Keep the whole flyout on screen: shift it up when it would run off the bottom.
    const height = 74 + effortOptionsFor(row.provider, row.value).length * 50
    const maxTop = window.innerHeight - 12 - height - (shellBox?.top || 0)
    setFlyout({ row, top: Math.min(Math.max(-((shellBox?.top || 0) - 12), rowTop), maxTop) })
  }
  const scheduleOpen = (row, el) => {
    clearTimeout(flyTimer.current)
    flyTimer.current = setTimeout(() => openFlyout(row, el), 140)
  }
  const scheduleClose = () => {
    clearTimeout(flyTimer.current)
    flyTimer.current = setTimeout(() => setFlyout(null), 220)
  }
  useEffect(() => () => clearTimeout(flyTimer.current), [])

  // effortChoice: undefined = keep the thread's effort if the model takes it.
  const choose = async (row, effortChoice) => {
    if (!row || busy) return
    const rowEfforts = effortOptionsFor(row.provider, row.value)
    const wanted = effortChoice !== undefined ? (effortChoice || '') : (row.provider === provider ? (effort || '') : '')
    const nextEffort = rowEfforts.includes(wanted) ? (wanted || null) : null
    if (row.provider !== provider) {
      // A running CLI can't become another provider; that's a new thread.
      setOpen(false)
      onNewThread?.({ agentId: row.provider, model: row.value, effort: nextEffort, permission: permission || null })
      return
    }
    if ((row.value || null) === (model || null) && (nextEffort || null) === (effort || null)) { setOpen(false); return }
    if (resumeOff) { setError(errorText('resume-unsupported')); return }
    setBusy(row.key)
    setError('')
    let result
    try {
      result = await onApply?.({ model: row.value, effort: nextEffort })
    } catch (err) {
      result = { ok: false, error: err?.message || 'restart-failed' }
    } finally {
      setBusy(null)
    }
    if (result?.ok === false) setError(errorText(result.error))
    else setOpen(false)
  }

  const choosePermission = async (value) => {
    setPermOpen(false)
    if (busy || (value || '') === (permission || '')) return
    if (resumeOff) { setError(errorText('resume-unsupported')); return }
    setBusy('perm')
    setError('')
    let result
    try {
      result = await onApply?.({ model: model || null, effort: effort || null, permission: value || '' })
    } catch (err) {
      result = { ok: false, error: err?.message || 'restart-failed' }
    } finally {
      setBusy(null)
    }
    if (result?.ok === false) setError(errorText(result.error))
    else setOpen(false)
  }
  const permCurrent = permModes.find(m => m.value === (permission || '')) || permModes[0]

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(rows.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(rows[active]) }
    else if (e.key === 'ArrowRight' && !query) { e.preventDefault(); openFlyout(rows[active], listRef.current?.querySelector(`[data-index="${active}"]`)) }
    else if (e.key === 'ArrowLeft' && flyout) { e.preventDefault(); setFlyout(null) }
  }

  const label = spec ? pickerModelLabel(provider, model) + (effort ? ` · ${effortLabelFor(provider, effort)}` : '') : (agentById(provider)?.label || 'Terminal')


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
        {spec && permission && (
          <span className={`mp-perm-chip is-${permission}`} title={`Permissions: ${permissionLabel(permission)}`}>
            <Icon name="shield" size={11} />
          </span>
        )}
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
                {id === provider && <span className="mp-rail-live" aria-label="This thread's provider"><StatusIcon tone="ok" size={11} /></span>}
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
                    onMouseEnter={(e) => { setActive(index); scheduleOpen(row, e.currentTarget) }}
                    onMouseLeave={scheduleClose}
                    onClick={() => choose(row)}
                  >
                    <div className="mp-row-text">
                      <div className="mp-row-name">
                        <span>{row.label}</span>
                        {row.badge && <span className={`mp-badge is-${row.badge.toLowerCase()}`}>{row.badge}</span>}
                      </div>
                      {(query || section === 'favorites' || other) ? (
                        <div className="mp-row-sub">
                          <ProviderMark provider={row.provider} size={12} />
                          <span>{agent?.label || row.provider}{other ? ' · new thread' : ''}{row.note ? ` · ${row.note}` : ''}</span>
                        </div>
                      ) : row.note ? (
                        <div className="mp-row-sub"><span>{row.note}</span></div>
                      ) : null}
                    </div>
                    {busy === row.key && <span className="mp-row-note">Restarting…</span>}
                    {selected && <Icon name="check" size={14} />}
                    {effortOptionsFor(row.provider, row.value).length > 0 && (
                      <button
                        type="button"
                        className={`mp-row-more${flyout?.row?.key === row.key ? ' is-open' : ''}`}
                        aria-label={`${row.label} effort levels`}
                        title="Effort levels"
                        onClick={e => { e.stopPropagation(); flyout?.row?.key === row.key ? setFlyout(null) : openFlyout(row, e.currentTarget.closest('.mp-row')) }}
                      >
                        <Icon name="chevronRight" size={12} />
                      </button>
                    )}
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
            {flyout && (
              <div
                className="mp-flyout"
                style={{ top: flyout.top }}
                role="menu"
                aria-label={`${flyout.row.label} effort`}
                onMouseEnter={() => clearTimeout(flyTimer.current)}
                onMouseLeave={scheduleClose}
              >
                <div className="mp-flyout-head">
                  <strong>{flyout.row.label}</strong>
                  <small>{modelSpecFor(flyout.row.provider)?.effort?.label || 'Effort'}</small>
                </div>
                {effortOptionsFor(flyout.row.provider, flyout.row.value).map(v => {
                  const current = flyout.row.provider === provider && (flyout.row.value || null) === (model || null) && (v || '') === (effort || '')
                  return (
                    <button
                      key={v || 'default'}
                      type="button"
                      role="menuitemradio"
                      aria-checked={current}
                      className={`mp-flyout-item${current ? ' is-on' : ''}`}
                      onClick={() => { setFlyout(null); choose(flyout.row, v || null) }}
                    >
                      <span className={`mp-effort-bars is-${v || 'default'}`} aria-hidden><i /><i /><i /><i /><i /></span>
                      <span className="mp-flyout-text">
                        <b>{v ? effortLabelFor(flyout.row.provider, v) : 'Default'}</b>
                        <small>{EFFORT_HINTS[v || 'default']}</small>
                      </span>
                      {current && <Icon name="check" size={13} />}
                    </button>
                  )
                })}
              </div>
            )}
            {permModes.length > 1 && (
              <button
                type="button"
                className={`mp-perm-row${permOpen ? ' is-open' : ''}${permission ? ` is-${permission}` : ''}`}
                aria-haspopup="menu"
                aria-expanded={permOpen}
                onClick={() => { setFlyout(null); setPermOpen(v => !v) }}
                onMouseEnter={() => { clearTimeout(flyTimer.current); flyTimer.current = setTimeout(() => { setFlyout(null); setPermOpen(true) }, 160) }}
                onMouseLeave={() => { clearTimeout(flyTimer.current); flyTimer.current = setTimeout(() => setPermOpen(false), 260) }}
              >
                <Icon name="shield" size={13} />
                <span className="mp-perm-label">Permissions</span>
                <span className="mp-perm-value">{busy === 'perm' ? 'Restarting…' : permCurrent?.label}</span>
                <Icon name="chevronRight" size={12} />
              </button>
            )}
            {permOpen && (
              <div
                className="mp-flyout is-perm"
                role="menu"
                aria-label="Permissions"
                onMouseEnter={() => clearTimeout(flyTimer.current)}
                onMouseLeave={() => { clearTimeout(flyTimer.current); flyTimer.current = setTimeout(() => setPermOpen(false), 260) }}
              >
                <div className="mp-flyout-head">
                  <strong>Permissions</strong>
                  <small>{agentById(provider)?.label || provider} · restarts and resumes</small>
                </div>
                {permModes.map(m => {
                  const current = (m.value || '') === (permission || '')
                  return (
                    <button
                      key={m.value || 'default'}
                      type="button"
                      role="menuitemradio"
                      aria-checked={current}
                      className={`mp-flyout-item${current ? ' is-on' : ''}${m.danger ? ' is-danger' : ''}`}
                      onClick={() => choosePermission(m.value)}
                    >
                      <span className={`mp-perm-glyph is-${m.value || 'default'}`} aria-hidden><Icon name={{ '': 'settings', ask: 'shield', plan: 'eye', edits: 'edit', auto: 'sparkles', full: 'key' }[m.value || '']} size={13} /></span>
                      <span className="mp-flyout-text">
                        <b>{m.label}</b>
                        <small>{m.hint}</small>
                      </span>
                      {current && <Icon name="check" size={13} />}
                    </button>
                  )
                })}
              </div>
            )}
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
        // Only keys that move the slider commit; tabbing past must not save.
        onKeyUp={e => { if (/^(Arrow|Page|Home|End)/.test(e.key)) commit(Number(e.currentTarget.value)) }}
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
