import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { usePolling } from '../../hooks/usePolling'
import { PanelEmpty, TabHeader, copyToClipboard } from './shared'

function DockerTab({ accent, onRun }) {
  const [data, setData] = useState(null)
  const [logs, setLogs] = useState({})
  const [loadingLogs, setLoadingLogs] = useState(new Set())
  const [stopping, setStopping] = useState(new Set())

  const load = useCallback(() => {
    window.sush?.dockerPs?.()
      .then(res => setData(res))
      .catch(() => setData({ ok: false, containers: [], error: 'Docker not available' }))
  }, [])

  usePolling(load, 5000)

  const fetchLogs = async (id) => {
    if (loadingLogs.has(id)) return
    if (logs[id]) { setLogs(p => { const n = { ...p }; delete n[id]; return n }); return }
    setLoadingLogs(prev => new Set([...prev, id]))
    try {
      const res = await window.sush?.dockerLogs?.({ id, tail: 80 })
      setLogs(p => ({ ...p, [id]: res?.logs || '(no logs)' }))
    } catch {}
    finally { setLoadingLogs(prev => { const n = new Set(prev); n.delete(id); return n }) }
  }

  const stop = async (id) => {
    setStopping(prev => new Set([...prev, id]))
    try {
      await window.sush?.dockerStop?.({ id })
      setTimeout(load, 800)
    } catch {}
    finally { setStopping(prev => { const n = new Set(prev); n.delete(id); return n }) }
  }

  const shell = (id) => onRun?.(`docker exec -it ${id} /bin/sh`)

  if (!data) return <PanelEmpty icon="layers" accent={accent}>Connecting to Docker...</PanelEmpty>
  if (!data.ok && data.error) return <PanelEmpty icon="layers" accent={accent} hint={data.error}>Docker unavailable</PanelEmpty>

  const containers = data.containers ?? []

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader accent={accent} icon="layers" title="Docker" sub={`${containers.length} running container${containers.length !== 1 ? 's' : ''}`} onRefresh={load} />
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 8 }}>
        {!containers.length ? (
          <PanelEmpty icon="layers" accent={accent} hint="No containers are currently running.">No containers</PanelEmpty>
        ) : containers.map(c => {
          const id = c.ID || c.Names || 'unknown'
          const name = c.Names || c.Name || id
          const image = c.Image || ''
          const status = c.Status || c.State || ''
          const ports = c.Ports || ''
          const hostPort = (ports.match(/:(\d+)->/) || [])[1]
          const isStopping = stopping.has(id)
          const hasLogs = !!logs[id]
          const isLoadingLogs = loadingLogs.has(id)

          return (
            <div key={id} style={{ marginBottom: 8, border: '1px solid var(--border-1)', borderRadius: 9, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#c3e88d', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{image}</div>
                </div>
                {hostPort && (
                  <button onClick={() => window.sush?.openExternal?.({ url: `http://localhost:${hostPort}` })} title={`Open localhost:${hostPort}`} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${rgba(accent, 0.25)}`, background: rgba(accent, 0.07), color: accent, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="globe" size={12} />
                  </button>
                )}
                <button onClick={() => copyToClipboard(id)} title="Copy container ID" style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="copy" size={11} />
                </button>
                <button onClick={() => fetchLogs(id)} title={hasLogs ? 'Hide logs' : 'View logs'} disabled={isLoadingLogs} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${hasLogs ? rgba(accent, 0.4) : 'var(--border-2)'}`, background: hasLogs ? rgba(accent, 0.1) : 'transparent', color: hasLogs ? accent : 'var(--text-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>
                  {isLoadingLogs ? '...' : '≡'}
                </button>
                <button onClick={() => shell(id)} title="Open shell" style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="terminal" size={12} />
                </button>
                <button onClick={() => stop(id)} disabled={isStopping} title="Stop container" style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(255,83,112,0.2)', background: 'rgba(255,83,112,0.06)', color: isStopping ? '#3f2020' : '#ff5370', cursor: isStopping ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="stop" size={11} />
                </button>
              </div>
              {ports && <div style={{ padding: '0 9px 5px', fontSize: 9.5, color: 'var(--text-4)', fontFamily: 'monospace' }}>{ports}</div>}
              {status && <div style={{ padding: '0 9px 5px', fontSize: 9, color: 'var(--text-5)' }}>{status}</div>}
              {hasLogs && (
                <pre style={{ margin: 0, padding: '8px 10px', background: 'var(--surface-0)', borderTop: '1px solid var(--surface-2)', fontSize: 10, lineHeight: 1.65, color: 'var(--text-3)', maxHeight: 160, overflowY: 'auto', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {logs[id]}
                </pre>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DockerTab
