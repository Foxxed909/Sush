import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { usePolling } from '../../hooks/usePolling'
import { PanelEmpty, TabHeader } from './shared'

// ---------- Port Manager ----------
// Individual well-known dev ports plus inclusive ranges. Ranges catch the many
// fallback ports a dev server picks when its default is busy (e.g. Vite walking
// 5173 → 5180+, Next/CRA 3000 → 3005+), which a fixed list always misses.
const DEV_PORTS = new Set([4200, 4321, 6006, 7070, 8888, 9229, 24678])
const DEV_RANGES = [
  [3000, 3010], [4000, 4010], [5000, 5010], [5170, 5199],
  [7000, 7010], [8000, 8010], [8080, 8090], [9000, 9010]
]
function isDevPort(p) {
  if (DEV_PORTS.has(p)) return true
  return DEV_RANGES.some(([lo, hi]) => p >= lo && p <= hi)
}

// Ports that actually speak HTTP in a browser. Used to decide whether to show
// the "open in browser" shortcut — most listeners (SSH, databases, etc.) don't.
const WEB_PORTS = new Set([80, 443, 8080, 8443, 3000, 5000, 8000])
function isWebPort(port, processName) {
  const p = Number(port)
  if (WEB_PORTS.has(p)) return true
  if (isDevPort(p)) return true
  const name = (processName || '').toLowerCase()
  return ['nginx', 'apache', 'httpd', 'caddy', 'node', 'vite', 'next', 'nuxt'].some(k => name.includes(k))
}

const APP_KEYWORDS = ['node', 'bun', 'deno', 'python', 'python3', 'ruby', 'go', 'java', 'php', 'dotnet', 'vite', 'next', 'nuxt', 'cargo', 'uvicorn', 'gunicorn', 'puma', 'rails', 'flask', 'django', 'fastapi', 'express', 'esbuild']
const SVC_KEYWORDS = ['nginx', 'apache', 'httpd', 'postgres', 'mysqld', 'redis', 'mongod', 'rabbitmq', 'elastic', 'kafka', 'zookeeper', 'memcached', 'grafana', 'prometheus', 'caddy']

function categorizePort(port, processName) {
  const p = Number(port)
  const name = (processName || '').toLowerCase()
  if (p < 1024) return 'system'
  if (SVC_KEYWORDS.some(k => name.includes(k))) return 'service'
  if (APP_KEYWORDS.some(k => name.includes(k))) return 'app'
  if (isDevPort(p)) return 'app'
  return 'system'
}

const CAT = {
  app:     { label: 'App',     color: '#c3e88d', bg: 'rgba(195,232,141,0.1)', border: 'rgba(195,232,141,0.22)' },
  service: { label: 'Service', color: '#82aaff', bg: 'rgba(130,170,255,0.1)', border: 'rgba(130,170,255,0.22)' },
  system:  { label: 'System',  color: 'var(--text-3)', bg: 'rgba(105,115,125,0.1)', border: 'rgba(105,115,125,0.22)' }
}

const FILTER_OPTS = ['all', 'app', 'service', 'system']

function PortsTab({ accent, onRun }) {
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [killing, setKilling] = useState(new Set())

  const load = useCallback(() => {
    window.sush?.getPorts?.()
      .then(res => setData(res))
      .catch(() => setData({ ok: false, ports: [] }))
  }, [])

  usePolling(load, 4000)

  const killPort = useCallback(async (pid, port) => {
    setKilling(prev => new Set([...prev, port]))
    try {
      if (pid) {
        await window.sush?.killPid?.({ pid })
      } else {
        onRun?.(`kill ${port}`)
      }
      setTimeout(load, 600)
    } finally {
      setKilling(prev => { const n = new Set(prev); n.delete(port); return n })
    }
  }, [load, onRun])

  const openInBrowser = useCallback((port) => {
    window.sush?.openExternal?.({ url: `http://localhost:${port}` })
  }, [])

  if (!data) return <PanelEmpty icon="ports" accent={accent}>Scanning ports...</PanelEmpty>

  const ports = data.ports ?? []
  const counts = { all: ports.length }
  for (const f of ['app', 'service', 'system']) {
    counts[f] = ports.filter(p => categorizePort(p.port, p.process) === f).length
  }
  const q = search.trim().toLowerCase()
  const filtered = ports.filter(p => {
    if (filter !== 'all' && categorizePort(p.port, p.process) !== filter) return false
    if (q && !String(p.port).includes(q) && !(p.process || '').toLowerCase().includes(q)) return false
    return true
  })

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="ports"
        title="Port Manager"
        sub={`${ports.length} listening · auto-refreshes`}
        onRefresh={load}
      />

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 5, padding: '8px 10px 4px', borderBottom: '1px solid var(--surface-2)' }}>
        {FILTER_OPTS.map(f => {
          const active = filter === f
          const catInfo = f !== 'all' ? CAT[f] : null
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '3px 9px',
                borderRadius: 7,
                border: `1px solid ${active ? (catInfo?.border ?? rgba(accent, 0.45)) : 'var(--border-2)'}`,
                background: active ? (catInfo?.bg ?? rgba(accent, 0.12)) : 'transparent',
                color: active ? (catInfo?.color ?? accent) : 'var(--text-4)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {f === 'all' ? `All (${counts.all})` : `${CAT[f].label} (${counts[f]})`}
            </button>
          )
        })}
      </div>

      {/* Search filter */}
      <div style={{ padding: '6px 10px 2px' }}>
        <div className="sush-omni flex items-center" style={{ height: 30, gap: 7 }}>
          <Icon name="search" size={12} color="var(--text-4)" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by port or process..."
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-1)', outline: 'none', fontSize: 11.5 }}
          />
          {search && (
            <button onClick={() => setSearch('')} title="Clear" style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 8 }}>
        {!filtered.length ? (
          <PanelEmpty
            icon="ports"
            accent={accent}
            hint={q ? `No ports match "${search}".` : filter !== 'all' ? `No ${filter} ports are currently listening.` : 'No listening ports found.'}
          >
            No {filter === 'all' ? '' : CAT[filter]?.label + ' '}ports
          </PanelEmpty>
        ) : filtered.map(p => {
          const cat = categorizePort(p.port, p.process)
          const c = CAT[cat]
          const isKilling = killing.has(p.port)
          const isHttp = isWebPort(p.port, p.process)

          return (
            <div
              key={`${p.port}-${p.pid ?? 'x'}`}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', marginBottom: 5, border: '1px solid var(--border-1)', borderRadius: 9, background: 'var(--surface-2)' }}
            >
              {/* Port */}
              <span style={{ fontSize: 13.5, fontWeight: 800, color: accent, minWidth: 44, flexShrink: 0, fontFamily: 'monospace' }}>
                {p.port}
              </span>

              {/* Process info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: p.process ? 'var(--text-2)' : 'var(--text-5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.process || 'unknown'}
                </div>
                {p.pid && (
                  <div style={{ fontSize: 9.5, color: 'var(--text-5)', marginTop: 1 }}>PID {p.pid} · {p.protocol}</div>
                )}
              </div>

              {/* Category badge */}
              <span style={{ fontSize: 9.5, fontWeight: 800, color: c.color, background: c.bg, border: `1px solid ${c.border}`, padding: '2px 6px', borderRadius: 5, flexShrink: 0, letterSpacing: 0.3 }}>
                {c.label}
              </span>

              {/* Open in browser */}
              {isHttp && (
                <button
                  onClick={() => openInBrowser(p.port)}
                  title={`Open localhost:${p.port} in browser`}
                  style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, border: `1px solid ${rgba(accent, 0.25)}`, background: rgba(accent, 0.07), color: accent, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="globe" size={12} />
                </button>
              )}

              {/* Kill */}
              <button
                onClick={() => killPort(p.pid, p.port)}
                disabled={isKilling}
                title={`Kill port ${p.port}`}
                style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, border: '1px solid rgba(255,83,112,0.2)', background: isKilling ? 'transparent' : 'rgba(255,83,112,0.07)', color: isKilling ? '#3f2020' : '#ff5370', cursor: isKilling ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="stop" size={11} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PortsTab
