import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import { PanelEmpty, TabHeader } from './shared'

// ---------- Scripts (npm/package.json) ----------
function ScriptsTab({ accent, cwd, onRun }) {
  const [data, setData] = useState(null)

  const load = () => {
    if (!cwd) { setData({ scripts: {} }); return }
    window.sush?.getNpmScripts?.({ cwd })
      .then(res => setData(res))
      .catch(() => setData({ scripts: {} }))
  }

  useEffect(() => { load() }, [cwd]) // eslint-disable-line react-hooks/exhaustive-deps

  const scripts = data?.scripts ?? {}
  const keys = Object.keys(scripts)

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader accent={accent} icon="rocket" title="npm Scripts" sub={data?.name || 'package.json'} onRefresh={load} />
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        {!data ? (
          <PanelEmpty icon="rocket" accent={accent}>Loading...</PanelEmpty>
        ) : !keys.length ? (
          <PanelEmpty icon="rocket" accent={accent} hint="No scripts found in package.json. Navigate to a project directory first.">No scripts</PanelEmpty>
        ) : keys.map(name => (
          <button
            key={name}
            onClick={() => onRun(`npm run ${name}`)}
            className="sush-row flex items-center"
            style={{ gap: 10, width: '100%', textAlign: 'left', border: '1px solid var(--border-1)', borderRadius: 9, background: 'var(--surface-2)', color: 'var(--text-2)', padding: '8px 11px', marginBottom: 7, cursor: 'pointer' }}
          >
            <Icon name="arrowRight" size={13} color={accent} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: accent }}>{name}</span>
              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', marginTop: 2 }}>{scripts[name]}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default ScriptsTab
