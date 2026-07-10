import React, { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { unquoteEnvValue } from '../../lib/env'
import { PanelEmpty, TabHeader, copyToClipboard } from './shared'

function EnvManagerTab({ accent, cwd }) {
  const [pairs, setPairs] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState(null)
  const [visible, setVisible] = useState(new Set())
  const [envPath, setEnvPath] = useState(null)
  // The original file lines, kept so comments and ordering survive a round-trip.
  const rawLinesRef = useRef([])
  const loadRequestRef = useRef(0)
  const saveRequestRef = useRef(0)
  const loadedPathRef = useRef(null)
  const activeCwdRef = useRef(cwd)
  activeCwdRef.current = cwd

  const pathForCwd = useCallback((dir) => (
    dir ? (dir.includes('\\') ? `${dir}\\.env` : `${dir}/.env`) : null
  ), [])

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current
    saveRequestRef.current += 1
    loadedPathRef.current = null
    rawLinesRef.current = []
    setPairs([])
    setVisible(new Set())
    setSaveResult(null)
    setSaving(false)
    if (!cwd) {
      setEnvPath(null)
      setLoading(false)
      return
    }
    const p = pathForCwd(cwd)
    setEnvPath(p)
    setLoading(true)
    try {
      const res = await window.sush?.readFile?.({ path: p })
      if (requestId !== loadRequestRef.current || activeCwdRef.current !== cwd) return
      loadedPathRef.current = p
      if (res?.ok) {
        rawLinesRef.current = res.content.split('\n')
        const parsed = res.content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#')).map((line, i) => {
          const eq = line.indexOf('=')
          if (eq < 0) return { id: i, key: line.trim(), value: '' }
          return { id: i, key: line.slice(0, eq).trim(), value: unquoteEnvValue(line.slice(eq + 1)) }
        })
        setPairs(parsed)
      } else {
        rawLinesRef.current = []
        setPairs([])
      }
    } catch {
      if (requestId === loadRequestRef.current && activeCwdRef.current === cwd) {
        loadedPathRef.current = null
        rawLinesRef.current = []
        setPairs([])
      }
    } finally {
      if (requestId === loadRequestRef.current && activeCwdRef.current === cwd) setLoading(false)
    }
  }, [cwd, pathForCwd])

  useEffect(() => { load() }, [load])

  // Serialize while preserving comments/blank lines and original ordering.
  const serialize = () => {
    const live = pairs.filter(p => p.key.trim())
    const byKey = new Map(live.map(p => [p.key.trim(), p]))
    const used = new Set()
    const out = []
    for (const line of rawLinesRef.current) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) { out.push(line); continue }
      const eq = line.indexOf('=')
      const key = (eq < 0 ? trimmed : line.slice(0, eq).trim())
      if (byKey.has(key)) { out.push(`${key}=${byKey.get(key).value}`); used.add(key) }
      // keys removed in the editor are dropped
    }
    for (const p of live) {
      if (!used.has(p.key.trim())) out.push(`${p.key.trim()}=${p.value}`)
    }
    return out.join('\n').replace(/\n*$/, '') + '\n'
  }

  const save = async () => {
    const expectedPath = pathForCwd(cwd)
    const targetPath = loadedPathRef.current
    if (!targetPath || targetPath !== expectedPath || envPath !== expectedPath || loading) return
    const requestId = ++saveRequestRef.current
    setSaving(true); setSaveResult(null)
    const content = serialize()
    try {
      const res = await window.sush?.writeFile?.({ path: targetPath, content })
      if (requestId !== saveRequestRef.current || loadedPathRef.current !== targetPath || pathForCwd(activeCwdRef.current) !== targetPath) return
      setSaveResult(res?.ok ? 'Saved!' : (res?.error || 'Save failed'))
      if (res?.ok) rawLinesRef.current = content.split('\n')
    } catch (e) {
      if (requestId === saveRequestRef.current && loadedPathRef.current === targetPath && pathForCwd(activeCwdRef.current) === targetPath) {
        setSaveResult(e.message)
      }
    } finally {
      if (requestId === saveRequestRef.current && loadedPathRef.current === targetPath && pathForCwd(activeCwdRef.current) === targetPath) {
        setSaving(false)
        setTimeout(() => {
          if (saveRequestRef.current === requestId) setSaveResult(null)
        }, 2000)
      }
    }
  }

  const copyEnv = () => copyToClipboard(serialize())

  const addPair = () => setPairs(p => [...p, { id: Date.now(), key: '', value: '' }])
  const delPair = (id) => setPairs(p => p.filter(x => x.id !== id))
  const setPairKey = (id, key) => setPairs(p => p.map(x => x.id === id ? { ...x, key } : x))
  const setPairValue = (id, val) => setPairs(p => p.map(x => x.id === id ? { ...x, value: val } : x))
  const toggleVisible = (id) => setVisible(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  if (!cwd) return <PanelEmpty icon="key" accent={accent}>No active directory</PanelEmpty>

  const isSecret = (key) => /key|secret|token|password|pass|pwd|auth|api_key/i.test(key)
  const canSave = !loading && !saving && loadedPathRef.current === pathForCwd(cwd) && envPath === pathForCwd(cwd)

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="key"
        title=".env Manager"
        sub={envPath ? envPath.split(/[\\/]/).slice(-2).join('/') : '.env'}
        onRefresh={load}
        right={
          <button onClick={addPair} title="Add variable" className="sush-icon-btn flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${rgba(accent, 0.35)}`, background: rgba(accent, 0.1), color: accent, cursor: 'pointer' }}>
            <Icon name="plus" size={14} strokeWidth={2.4} />
          </button>
        }
      />

      {loading && <PanelEmpty icon="key" accent={accent}>Loading .env...</PanelEmpty>}

      {!loading && (
        <>
          <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 8 }}>
            {!pairs.length ? (
              <PanelEmpty icon="key" accent={accent} hint="No .env found. Press + to create variables.">No variables</PanelEmpty>
            ) : pairs.map(p => {
              const secret = isSecret(p.key)
              const shown = visible.has(p.id)
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                  <input
                    value={p.key}
                    onChange={e => setPairKey(p.id, e.target.value)}
                    placeholder="KEY"
                    spellCheck={false}
                    style={{ width: 110, padding: '4px 7px', background: 'var(--surface-2)', border: `1px solid ${rgba(accent, 0.2)}`, borderRadius: 6, color: accent, fontSize: 11, fontFamily: 'monospace', outline: 'none', fontWeight: 700 }}
                  />
                  <span style={{ color: 'var(--text-5)', flexShrink: 0 }}>=</span>
                  <input
                    value={p.value}
                    onChange={e => setPairValue(p.id, e.target.value)}
                    type={secret && !shown ? 'password' : 'text'}
                    placeholder="value"
                    spellCheck={false}
                    style={{ flex: 1, minWidth: 0, padding: '4px 7px', background: 'var(--surface-0)', border: '1px solid var(--border-1)', borderRadius: 6, color: 'var(--text-2)', fontSize: 11, fontFamily: 'monospace', outline: 'none' }}
                  />
                  {secret && (
                    <button onClick={() => toggleVisible(p.id)} title={shown ? 'Hide' : 'Show'} style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={shown ? 'eyeOff' : 'eye'} size={11} />
                    </button>
                  )}
                  <button onClick={() => delPair(p.id)} style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border-1)', background: 'transparent', color: 'var(--text-5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="trash" size={10} />
                  </button>
                </div>
              )
            })}
          </div>

          <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-1)' }}>
            {saveResult && (
              <div style={{ fontSize: 10.5, color: saveResult === 'Saved!' ? '#c3e88d' : '#ff5370', marginBottom: 5 }}>{saveResult}</div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={save}
                disabled={!canSave}
                style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', background: canSave ? accent : 'var(--border-1)', color: canSave ? '#0a0a0a' : 'var(--text-5)', fontSize: 12, fontWeight: 800, cursor: canSave ? 'pointer' : 'default' }}
              >
                {saving ? 'Saving...' : 'Save .env'}
              </button>
              <button
                onClick={copyEnv}
                disabled={!pairs.length}
                title="Copy .env to clipboard"
                className="flex items-center justify-center"
                style={{ width: 36, flexShrink: 0, borderRadius: 7, border: '1px solid var(--border-2)', background: 'var(--surface-1)', color: pairs.length ? 'var(--text-3)' : 'var(--border-2)', cursor: pairs.length ? 'pointer' : 'default' }}
              >
                <Icon name="copy" size={13} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default EnvManagerTab
