import React, { useCallback, useEffect, useState } from 'react'
import { Section, Row, Label, Hint } from './primitives'

// Sush Finance: what this profile's agent work is worth at API rates, what
// its plans cost, and plain advice on where to save. Every number comes from
// transcripts already on disk; nothing is sent anywhere.

export const usd = (n) => (n == null ? '—' : `$${n >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(2)}`)
const tokens = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n || 0))
const ago = (ts) => {
  if (!ts) return 'never'
  const d = Math.floor((Date.now() - ts) / 864e5)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`
}
const SEVERITY_LABEL = { warn: 'Heads up', save: 'Save', info: 'Note' }
const BUDGET_TEXT = {
  ok: 'Inside budget',
  near: 'Past 80% of budget',
  'forecast-over': 'On pace to go over',
  over: 'Over budget'
}

function MoneyField({ value, placeholder, onSave, label }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  useEffect(() => { setDraft(value == null ? '' : String(value)) }, [value])
  const commit = () => {
    const next = draft.trim()
    if ((value == null ? '' : String(value)) !== next) onSave(next === '' ? null : Number(next))
  }
  return (
    <span className="fin-money">
      <span aria-hidden>$</span>
      <input
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        aria-label={label}
        onChange={e => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
    </span>
  )
}

function PriceForm({ model, onSave }) {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const ok = Number(input) >= 0 && Number(output) > 0 && input !== '' && output !== ''
  return (
    <div className="fin-price">
      <code>{model}</code>
      <MoneyFieldInline label={`${model} input price per million tokens`} value={input} onChange={setInput} hint="in / MTok" />
      <MoneyFieldInline label={`${model} output price per million tokens`} value={output} onChange={setOutput} hint="out / MTok" />
      <button className="fin-btn" disabled={!ok} onClick={() => onSave({ model, input: Number(input), output: Number(output) })}>Save price</button>
    </div>
  )
}
function MoneyFieldInline({ value, onChange, hint, label }) {
  return (
    <span className="fin-money">
      <span aria-hidden>$</span>
      <input inputMode="decimal" value={value} placeholder={hint} aria-label={label} onChange={e => onChange(e.target.value.replace(/[^\d.]/g, ''))} />
    </span>
  )
}

export default function FinanceSection() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const r = await window.sush?.financeSummary?.()
      if (r?.ok) { setData(r); setErr(''); setUpdatedAt(Date.now()) }
      else setErr(r?.error === 'no-user' ? 'Sign in to a profile to see its spend.' : (r?.error || 'Could not read usage.'))
    } catch (e) {
      setErr(e?.message || 'Could not read usage.')
    }
    setBusy(false)
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (patch) => {
    const r = await window.sush?.financeSet?.(patch)
    if (r && !r.ok) { setErr(r.error || 'Could not save.'); return }
    load()
  }

  const s = data
  return (
    <Section id="Finance" label="Finance">
      <Row>
        <div className="fin-head">
          <Label>This month</Label>
          <button className="fin-btn is-quiet" onClick={load} disabled={busy}>
            {busy ? 'Reading transcripts…' : updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Refresh` : 'Refresh'}
          </button>
        </div>
        {err && <div role="alert" className="fin-error">{err}</div>}
        {s && (
          <dl className="fin-stats">
            <div><dt>API-equivalent</dt><dd>{usd(s.usd)}</dd></div>
            <div><dt>Plans cost</dt><dd>{s.planUsd ? `${usd(s.planUsd)}/mo` : 'Not set'}</dd></div>
            <div><dt>Value</dt><dd>{s.valueRatio == null ? '—' : `${s.valueRatio}× plan price`}</dd></div>
            <div><dt>On pace for</dt><dd>{usd(s.forecastUsd)}</dd></div>
          </dl>
        )}
        <Hint>
          Counted from Claude Code and Codex transcripts in this profile's accounts, at published pay-as-you-go rates (as of {s?.pricesAsOf || '—'}). It's what the same tokens would cost on the API, not a bill. Gemini, OpenCode and Grok don't record token use locally, so they aren't included.
        </Hint>
      </Row>

      {s?.advice?.length > 0 && (
        <Row>
          <Label>Suggestions</Label>
          <ul className="fin-advice">
            {s.advice.map((a, i) => (
              <li key={`${a.kind}-${a.key || i}`} className={`is-${a.severity}`}>
                <span className="fin-tag">{a.severity === 'save' && a.saveUsd ? `Save ${usd(a.saveUsd)}/mo` : SEVERITY_LABEL[a.severity]}</span>
                <div>
                  <strong>{a.title}</strong>
                  <p>{a.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Row>
      )}

      {s && (
        <Row>
          <Label>Accounts</Label>
          <table className="fin-table">
            <thead><tr><th>Account</th><th>This month</th><th>Tokens</th><th>Last used</th><th>Plan / month</th></tr></thead>
            <tbody>
              {s.accounts.map(r => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td className="is-num">{r.unpricedTokens && !r.usd ? 'No price' : usd(r.usd)}</td>
                  <td className="is-num">{tokens(r.tokens)}</td>
                  <td>{ago(r.lastUsedAt)}</td>
                  <td><MoneyField label={`Monthly plan price for ${r.label}`} value={r.planUsd || null} placeholder="0" onSave={v => save({ plan: { key: r.key, usd: v } })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Hint>Enter what you pay for each login (0 for pay-as-you-go or free). Sush compares it with what that account's use is worth.</Hint>
        </Row>
      )}

      {s?.projects?.length > 0 && (
        <Row>
          <Label>Top projects</Label>
          <table className="fin-table">
            <tbody>
              {s.projects.map(p => (
                <tr key={p.key}><td>{p.key}</td><td className="is-num">{usd(p.usd)}</td><td className="is-num">{tokens(p.tokens)}</td><td className="is-num">{p.requests.toLocaleString()} requests</td></tr>
              ))}
            </tbody>
          </table>
        </Row>
      )}

      {s?.models?.length > 0 && (
        <Row>
          <Label>Models</Label>
          <table className="fin-table">
            <tbody>
              {s.models.map(m => (
                <tr key={m.key}><td><code>{m.key}</code></td><td className="is-num">{m.unpricedTokens ? 'No price' : usd(m.usd)}</td><td className="is-num">{tokens(m.tokens)}</td></tr>
              ))}
            </tbody>
          </table>
        </Row>
      )}

      {s && (
        <Row>
          <Label>Monthly budget</Label>
          <div className="fin-budget">
            <MoneyField label="Monthly budget in API-equivalent dollars" value={s.budgetUsd} placeholder="No budget" onSave={v => save({ budgetUsd: v })} />
            {s.budgetUsd != null && <span className={`fin-budget-state is-${s.budgetState}`}>{BUDGET_TEXT[s.budgetState]}</span>}
          </div>
          <Hint>A soft cap on API-equivalent spend. Sush only warns; it never stops a session.</Hint>
        </Row>
      )}

      {s?.unpricedModels?.length > 0 && (
        <Row>
          <Label>Missing prices</Label>
          {s.unpricedModels.map(m => <PriceForm key={m} model={m} onSave={price => save({ price })} />)}
          <Hint>Use the provider's published per-million-token rates. Cache reads default to 10% of the input price.</Hint>
        </Row>
      )}
    </Section>
  )
}
