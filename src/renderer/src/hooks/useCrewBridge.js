import { useEffect, useRef, useState } from 'react'
import { agentById } from '../lib/agents'
import { usageKeys, usageSamples } from '../lib/usageRunway.mjs'

// Desktop half of the crew bridge. Every few seconds the app publishes its
// sessions and the usage samples it has seen (for Sush Terminal's board and
// runway); while the Agents board is open it reads Sush Terminal's sessions
// back. Refs keep this off the render path.
export function useCrewBridge({ tabs, states, limits, guardPct = 80, enabled = true, readTerminal = false, saver = false }) {
  const live = useRef({ tabs, states, limits, guardPct })
  live.current = { tabs, states, limits, guardPct }
  const [terminalSessions, setTerminalSessions] = useState([])

  useEffect(() => {
    if (!enabled || !window.sush?.bridgePublish) return undefined
    const publish = () => {
      const { tabs: t, states: st, limits: lim, guardPct: g } = live.current
      const sessions = (t || []).filter(tab => tab.agentId && tab.agentId !== 'shell').map(tab => ({
        id: tab.id, label: tab.label, agentId: tab.agentId, model: tab.model || null,
        cwd: tab.workspaceCwd || tab.sessionRootCwd || tab.cwd || null,
        state: tab.status === 'exited' ? 'done' : (st?.[tab.id] || 'idle'), limited: !!lim?.[tab.id], startedAt: tab.startedAt || null
      }))
      const usage = usageKeys().map(key => {
        const [provider, ...rest] = key.split(':')
        const samples = usageSamples(key)
        return { provider, providerLabel: agentById(provider)?.label || provider, label: rest.join(':'), pct: samples[samples.length - 1]?.pct ?? null, guardPct: g, samples }
      })
      window.sush.bridgePublish({ sessions, usage }).catch(() => {})
    }
    publish()
    const id = setInterval(publish, saver ? 12000 : 4000)
    return () => clearInterval(id)
  }, [enabled, saver])

  useEffect(() => {
    if (!enabled || !readTerminal || !window.sush?.bridgeTerminal) return undefined
    let alive = true
    const read = () => window.sush.bridgeTerminal().then(r => { if (alive && r?.ok) setTerminalSessions(r.sessions || []) }).catch(() => {})
    read()
    const id = setInterval(read, 5000)
    return () => { alive = false; clearInterval(id) }
  }, [enabled, readTerminal])

  return terminalSessions
}
