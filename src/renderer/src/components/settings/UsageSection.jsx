import React, { useEffect, useState } from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { useEntitlements } from '../../hooks/useEntitlements'
import { useOnline } from '../../hooks/useOnline'
import { Section, Row, Label, Hint, Segment, LockNote, ago } from './primitives'

// Usage & Guard: the Usage Guard plus a live limit/account dashboard across
// every agent CLI. The auto-poll reads a cheap, spawn-free snapshot (install
// state, active account, last limit hit, Claude's last captured window); only
// the explicit "Check Claude live" button spawns a real probe.

const USAGE_INTERVALS = [[0, 'Off'], [30, '30s'], [60, '1 min'], [300, '5 min']]

// Usage Guard: watch Claude's utilization (from the passive rate-limit
// snapshot — no probe spawned) and act when it crosses the chosen threshold.
// The MODE is the user's choice, previewed in plain words before anything
// happens. Guard itself is Pro+; the hands-free handoff mode is Ultra+.
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
  const [live, setLive] = useState(null)        // live Claude probe result
  const [checking, setChecking] = useState(false)
  const [lastAt, setLastAt] = useState(null)
  const interval = settings.usageRefresh ?? 60   // seconds; 0 = off

  const pull = React.useCallback(async () => {
    try {
      const r = await window.sush.usageSnapshot?.()
      if (r?.ok) { setSnap(r); setLastAt(Date.now()) }
    } catch {}
  }, [])

  useEffect(() => { pull() }, [pull])

  // Auto-refresh on the chosen interval (cheap snapshot only).
  useEffect(() => {
    if (!interval) return
    const id = setInterval(pull, interval * 1000)
    return () => clearInterval(id)
  }, [interval, pull])

  const checkLive = async () => {
    if (!online) return
    setChecking(true)
    try {
      const r = await window.sush.claudeLimitsCheck?.()
      if (r?.limits) setLive(r.limits)
    } catch {}
    setChecking(false)
    pull()
  }

  const claudeLimit = live || snap?.claude?.limits || null
  const clock = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null

  const Card = ({ label, sub, data, children }) => {
    const installed = data?.installed
    return (
      <div style={{ marginBottom: 12, borderRadius: 'var(--r-lg)', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
        <div className="flex items-center" style={{ gap: 9, padding: '10px 13px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: installed ? '#5fd3a8' : 'rgba(255,255,255,0.18)', boxShadow: installed ? '0 0 7px rgba(95,211,168,0.6)' : 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-2)' }}>{label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 1 }}>{sub}</div>
          </div>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: installed ? '#5fd3a8' : 'var(--text-3)' }}>
            {installed ? 'INSTALLED' : 'NOT FOUND'}
          </span>
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

  return (
    <Section id="Usage & Guard" icon="activity" label="Usage & Guard" accent={accent}>
      <Row>
        <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
          Live account &amp; limit status for every agent CLI. The auto-refresh below reads a
          cheap snapshot (no CLI is launched) — install state, your active account, and when
          each account last got rate-limited. Use <strong style={{ color: accent }}>Check Claude live</strong> to
          actually probe Claude’s current window and reset time.
        </div>
      </Row>

      <UsageGuardBlock accent={accent} settings={settings} set={set} />

      <Row>
        {/* Controls */}
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
          <span style={{ flex: 1 }} />
          <button
            onClick={checkLive}
            disabled={checking || !online}
            title={online ? 'Probe Claude now' : 'Live probe waits for network'}
            className="flex items-center"
            style={{ gap: 6, fontSize: 10.5, fontWeight: 800, color: accent, background: rgba(accent, 0.1), border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 999, padding: '5px 13px', cursor: online ? 'pointer' : 'default', opacity: (checking || !online) ? 0.6 : 1 }}
          >
            {checking && <span className="sush-spinner" style={{ width: 10, height: 10 }} />}
            {checking ? 'Probing…' : 'Check Claude live'}
          </button>
        </div>

        <Card label="Claude Code" sub="Claude Pro / Max" data={snap?.claude}>
          <AccountLine account={snap?.claude?.account} />
          <div>
            Limit window:{' '}
            {!claudeLimit
              ? <span style={{ color: 'var(--text-3)' }}>unknown — run a Claude panel session or click “Check Claude live”.</span>
              : claudeLimit.status === 'allowed'
                ? <span style={{ color: '#5fd3a8', fontWeight: 700 }}>OK</span>
                : <span style={{ color: '#ffb74d', fontWeight: 700 }}>{String(claudeLimit.status).replace(/_/g, ' ')}</span>}
            {claudeLimit?.resetsAt && <span style={{ color: 'var(--text-3)' }}> · resets {clock(claudeLimit.resetsAt)}</span>}
          </div>
        </Card>

        <Card label="Codex" sub="ChatGPT subscription" data={snap?.codex}>
          <AccountLine account={snap?.codex?.account} />
          <div style={{ color: 'var(--text-4)' }}>Codex has no live usage probe — Sush tracks limits as its sessions hit them.</div>
        </Card>

        <Card label="Gemini" sub="Google account" data={snap?.gemini}>
          <AccountLine account={snap?.gemini?.account} />
          <div style={{ color: 'var(--text-4)' }}>No live usage probe; Sush can rotate slots when limits surface in-session.</div>
        </Card>

        <Card label="OpenCode" sub="any provider" data={snap?.opencode}>
          <AccountLine account={snap?.opencode?.account} />
          <div style={{ color: 'var(--text-4)' }}>No live usage probe; Sush keeps each slot in its own XDG config/data dirs.</div>
        </Card>

        <div style={{ fontSize: 10, color: 'var(--text-5)', marginTop: 4 }}>
          {lastAt ? `Snapshot updated ${clock(lastAt)}${interval ? ` · auto every ${interval < 60 ? interval + 's' : interval / 60 + ' min'}` : ' · auto-refresh off'}` : 'Loading…'}
        </div>
      </Row>
    </Section>
  )
}
