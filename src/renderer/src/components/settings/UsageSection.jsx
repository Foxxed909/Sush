import React, { useEffect, useState } from 'react'
import Icon from '../Icons'
import UsageBar from '../UsageBar'
import { rgba } from '../../lib/ui'
import { useEntitlements } from '../../hooks/useEntitlements'
import { useOnline } from '../../hooks/useOnline'
import { activeProviderUsage, claudeLimitStatus, providerNeedsNetwork } from '../../lib/usageStatus'
import { POOL_PROVIDERS } from '../../lib/agents'
import { Section, Row, Label, Hint, Segment, LockNote, ago } from './primitives'

const USAGE_INTERVALS = [[0, 'Off'], [30, '30s'], [60, '1 min'], [300, '5 min']]

const GUARD_PCTS = [50, 60, 70, 80, 90]
function guardPreview(mode, pct) {
  if (mode === 'handoff') return `At ${pct}%, Sush summarizes each live Claude session and hands the work to your next available model — hands-free.`
  if (mode === 'block') return `At ${pct}%, Sush stops sending new input to Claude sessions until the window resets (their current stream finishes; other agents are untouched).`
  return `At ${pct}%, Sush notifies you and flags Claude sessions in Mission Control with a one-click "Hand off" — nothing is interrupted.`
}

function UsageGuardBlock({ accent, settings, set }) {
  const ent = useEntitlements()
  const locked = !ent.can('usageGuard')
  const handoffLocked = !ent.can('autoHandoff')
  const enabled = settings.usageGuardEnabled === true && !locked
  const pct = settings.usageGuardPct ?? 80
  const mode = settings.usageGuardMode || 'warn'

  if (locked) {
    return (
      <Row>
        <Label>Usage Guard</Label>
        <LockNote accent={accent}>
          Stop Claude before the limit stops you: pick a threshold (e.g. 80%) and Sush warns,
          hands off, or blocks — your choice. A <strong style={{ color: accent }}>Pro</strong> feature — see <strong style={{ color: accent }}>Plan</strong>.
        </LockNote>
      </Row>
    )
  }

  return (
    <Row>
      <Label>Usage Guard · Claude quota</Label>
      <button
        onClick={() => set('usageGuardEnabled', !settings.usageGuardEnabled)}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, background: enabled ? rgba(accent, 0.1) : 'var(--surface-2)', border: `1px solid ${enabled ? rgba(accent, 0.4) : 'var(--border-2)'}`, color: enabled ? accent : 'var(--text-3)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, width: '100%' }}
      >
        <Icon name="doctor" size={14} strokeWidth={2} />
        {enabled ? `Guard armed at ${pct}%` : 'Guard off'}
      </button>
      {enabled && (
        <>
          <div style={{ marginTop: 8 }}>
            <Segment
              accent={accent}
              value={pct}
              options={GUARD_PCTS.map(p => [p, `${p}%`])}
              onChange={(p) => set('usageGuardPct', p)}
            />
          </div>
          <div style={{ marginTop: 6 }}>
            <Segment
              accent={accent}
              value={mode}
              options={[
                ['warn', 'Warn'],
                ['handoff', 'Auto-handoff', { locked: handoffLocked, lockTitle: 'Hands-free handoff is an Ultra feature — see Plan' }],
                ['block', 'Block']
              ]}
              onChange={(m) => set('usageGuardMode', m)}
            />
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.55, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border-2)' }}>
            <strong style={{ color: accent }}>Preview:</strong> {guardPreview(mode, pct)}
          </div>
          <Hint>Reads the passive rate-limit snapshot Claude already sends — no extra probes, no tokens spent.</Hint>
        </>
      )}
    </Row>
  )
}

export default function UsageSection({ accent, settings, set }) {
  const online = useOnline()
  const [snap, setSnap] = useState(null)
  const [live, setLive] = useState(null)
  const [checking, setChecking] = useState({})
  const [checkError, setCheckError] = useState('')
  const [lastAt, setLastAt] = useState(null)
  const interval = settings.usageRefresh ?? 60

  const pull = React.useCallback(async () => {
    try {
      const r = await window.sush.usageSnapshot?.()
      if (r?.ok) { setSnap(r); setLastAt(Date.now()) }
    } catch {}
  }, [])

  useEffect(() => { pull() }, [pull])

  useEffect(() => {
    if (!interval) return
    const id = setInterval(pull, interval * 1000)
    return () => clearInterval(id)
  }, [interval, pull])

  const checkProvider = async (provider) => {
    if (providerNeedsNetwork(provider) && !online) return
    const slotId = snap?.[provider]?.account?.id
    if (!slotId) return
    setChecking(s => ({ ...s, [provider]: true }))
    setCheckError('')
    try {
      if (provider === 'claude') {
        const r = await window.sush.claudeLimitsCheck?.()
        if (r?.limits) setLive(r.limits)
        else if (r?.error) setCheckError(r.error)
      } else {
        const r = await window.sush.accountsUsageRead?.({
          provider,
          slotId,
          ...(provider === 'codex' ? { doctor: true } : {})
        })
        if (r?.error) setCheckError(r.error)
      }
    } catch (e) {
      setCheckError(e?.message || `Could not check ${provider}.`)
    } finally {
      setChecking(s => ({ ...s, [provider]: false }))
      pull()
    }
  }

  const claudeLimit = claudeLimitStatus(snap, live)
  const clock = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null

  const Card = ({ provider, label, sub, data, children }) => {
    const installed = data?.installed
    const checkLabel = provider === 'claude' ? 'Check quota' : provider === 'codex' ? 'Check health' : 'Check CLI'
    const needsNetwork = providerNeedsNetwork(provider)
    const isChecking = !!checking[provider]
    const blocked = !installed || (needsNetwork && !online)
    return (
      <div style={{ marginBottom: 12, borderRadius: 'var(--r-lg)', border: '1px solid var(--border-2)', background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div className="flex items-center" style={{ gap: 9, padding: '10px 13px', borderBottom: '1px solid var(--border-1)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: installed ? '#5fd3a8' : 'rgba(255,255,255,0.18)', boxShadow: installed ? '0 0 7px rgba(95,211,168,0.6)' : 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-2)' }}>{label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 1 }}>{sub}</div>
          </div>
          <div className="flex items-center" style={{ gap: 8 }}>
            {installed && (
              <button
                onClick={() => checkProvider(provider)}
                disabled={isChecking || blocked}
                title={needsNetwork && !online ? `${label} check waits for network` : `Check the active ${label} account`}
                className="flex items-center"
                style={{ gap: 5, fontSize: 9.5, fontWeight: 800, color: accent, background: rgba(accent, 0.08), border: `1px solid ${rgba(accent, 0.25)}`, borderRadius: 999, padding: '3px 8px', cursor: blocked ? 'default' : 'pointer', opacity: (isChecking || blocked) ? 0.55 : 1 }}
              >
                {isChecking && <span className="sush-spinner" style={{ width: 9, height: 9 }} />}
                {isChecking ? 'Checking…' : checkLabel}
              </button>
            )}
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: installed ? '#5fd3a8' : 'var(--text-3)' }}>
              {installed ? 'INSTALLED' : 'NOT FOUND'}
            </span>
          </div>
        </div>
        <div style={{ padding: '9px 13px', fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
          {!installed
            ? <span style={{ color: 'var(--text-3)' }}>This CLI isn’t on your PATH, so there’s nothing to report.</span>
            : children}
        </div>
      </div>
    )
  }

  const AccountLine = ({ account }) => {
    if (!account) return <div style={{ color: 'var(--text-3)' }}>Signed-in account: <span style={{ color: 'var(--text-2)' }}>default</span></div>
    const limited = ago(account.lastLimitAt)
    return (
      <>
        <div>Active account: <span style={{ color: 'var(--text-2)', fontWeight: 700 }}>{account.label}</span>{account.count > 1 ? <span style={{ color: 'var(--text-4)' }}> · {account.count} on file</span> : null}</div>
        <div>Last limit hit: {limited ? <span style={{ color: '#ffb74d', fontWeight: 700 }}>{limited}</span> : <span style={{ color: '#5fd3a8' }}>none recorded</span>}</div>
      </>
    )
  }

  const HealthLine = ({ provider, usage }) => {
    if (!usage) {
      const action = provider === 'codex' ? 'Run Check health to verify the active account.' : 'Run Check CLI to verify the active account.'
      return <div style={{ color: 'var(--text-4)' }}>{action}</div>
    }
    const healthy = usage.healthy ?? usage.signedIn ?? false
    return (
      <div style={{ color: 'var(--text-4)' }}>
        <span style={{ color: healthy ? '#5fd3a8' : '#ffb74d', fontWeight: 700 }}>{usage.status || 'check complete'}</span>
        {usage.note && <span> · {usage.note}</span>}
        {usage.detail && <span title={usage.detail}> · {usage.detail}</span>}
        {usage.at && <span style={{ color: 'var(--text-5)' }}> · checked {ago(usage.at)}</span>}
      </div>
    )
  }

  return (
    <Section id="Usage & Guard" icon="activity" label="Usage & Guard" accent={accent}>
      <Row>
        <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
          Live account & limit status for every agent CLI. The auto-refresh below reads a
          cheap snapshot (no CLI is launched) — install state, your active account, and when
          each account last got rate-limited. Use the check button on any provider card to
          verify its active account. Claude also reports its current quota window when available;
          the other CLIs show health only because they do not provide a portable quota API.
        </div>
      </Row>

      <UsageGuardBlock accent={accent} settings={settings} set={set} />

      <Row>
        <Label>Account pool</Label>
        <div style={{ display: 'grid', gap: 8 }}>
          {POOL_PROVIDERS.map(p => (
            <UsageBar key={p} provider={p} accent={accent} variant="provider-panel" />
          ))}
        </div>
        <Hint>
          Total is the sum of remaining % across slots. The status-bar circle opens the same
          breakdown for every CLI. Auto-switch prefers the healthiest slot first.
        </Hint>
      </Row>

      <Row>
        <div className="flex items-center" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>Auto-refresh</span>
          {USAGE_INTERVALS.map(([val, lbl]) => {
            const on = interval === val
            return (
              <button
                key={val}
                onClick={() => set('usageRefresh', val)}
                style={{ padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: on ? accent : 'var(--surface-2)', color: on ? '#0a0a0a' : 'var(--text-3)', border: `1px solid ${on ? accent : 'var(--border-2)'}` }}
              >
                {lbl}
              </button>
            )
          })}
        </div>

        <Card provider="claude" label="Claude Code" sub="Claude Pro / Max" data={snap?.claude}>
          <AccountLine account={snap?.claude?.account} />
          <div>
            Limit window:{' '}
            {!claudeLimit?.status
              ? <span style={{ color: 'var(--text-3)' }}>unknown — run a Claude panel session or click “Check quota”.</span>
              : claudeLimit.status === 'allowed'
                ? <span style={{ color: '#5fd3a8', fontWeight: 700 }}>OK</span>
                : <span style={{ color: '#ffb74d', fontWeight: 700 }}>{String(claudeLimit.status).replace(/_/g, ' ')}</span>}
            {claudeLimit?.resetsAt && <span style={{ color: 'var(--text-3)' }}> · resets {clock(claudeLimit.resetsAt)}</span>}
          </div>
        </Card>

        <Card provider="codex" label="Codex" sub="ChatGPT subscription" data={snap?.codex}>
          <AccountLine account={snap?.codex?.account} />
          <HealthLine provider="codex" usage={activeProviderUsage(snap, 'codex')} />
        </Card>

        <Card provider="gemini" label="Gemini" sub="Google account" data={snap?.gemini}>
          <AccountLine account={snap?.gemini?.account} />
          <HealthLine provider="gemini" usage={activeProviderUsage(snap, 'gemini')} />
        </Card>

        <Card provider="opencode" label="OpenCode" sub="any provider" data={snap?.opencode}>
          <AccountLine account={snap?.opencode?.account} />
          <HealthLine provider="opencode" usage={activeProviderUsage(snap, 'opencode')} />
        </Card>

        <Card provider="grok" label="Grok Build" sub="xAI SuperGrok / X Premium+" data={snap?.grok}>
          <AccountLine account={snap?.grok?.account} />
          <HealthLine provider="grok" usage={activeProviderUsage(snap, 'grok')} />
        </Card>

        {checkError && <div style={{ color: '#ff8aa0', fontSize: 10.5, fontWeight: 700, margin: '-2px 0 10px' }}>{checkError}</div>}

        <div style={{ fontSize: 10, color: 'var(--text-5)', marginTop: 4 }}>
          {lastAt ? `Snapshot updated ${clock(lastAt)}${interval ? ` · auto every ${interval < 60 ? interval + 's' : interval / 60 + ' min'}` : ' · auto-refresh off'}` : 'Loading…'}
        </div>
      </Row>
    </Section>
  )
}
