import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { rgba } from '../../lib/ui'
import { renderMarkdown } from '../../lib/markdown'
import { PanelEmpty, TabHeader, fileName } from './shared'

// ---------- Markdown Preview (renderer extracted to lib/markdown.jsx) ----------

function MarkdownTab({ accent, cwd, initialPath }) {
  const [path, setPath] = useState(initialPath ?? '')
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(false)
  const [mdError, setMdError] = useState(null)
  const aliveRef = useRef(true)
  useEffect(() => () => { aliveRef.current = false }, [])

  const load = useCallback(async (p) => {
    const target = (p ?? path).trim()
    if (!target) return
    setLoading(true); setMdError(null)
    try {
      const res = await window.sush?.readFile?.({ path: target })
      if (!aliveRef.current) return
      if (res?.ok) { setContent(res.content); setPath(target) }
      else setMdError(res?.error || 'Could not read file')
    } catch (e) { if (aliveRef.current) setMdError(e.message) }
    finally { if (aliveRef.current) setLoading(false) }
  }, [path])

  // Auto-load when initialPath changes (e.g. clicking a .md file in Files tab)
  useEffect(() => {
    if (initialPath) { setPath(initialPath); load(initialPath) }
  }, [initialPath]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader accent={accent} icon="fileText" title="Preview" sub={content ? fileName(path) : 'Markdown'} />

      <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--border-1)' }}>
        <input
          value={path}
          onChange={e => setPath(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(path)}
          placeholder={cwd ? `${cwd}/README.md` : 'Path to .md file...'}
          spellCheck={false}
          style={{ flex: 1, padding: '5px 8px', background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 7, color: 'var(--text-1)', fontSize: 11, outline: 'none', fontFamily: 'monospace' }}
        />
        <button
          onClick={() => load(path)}
          disabled={loading}
          style={{ padding: '5px 11px', borderRadius: 7, border: `1px solid ${rgba(accent, 0.35)}`, background: rgba(accent, 0.1), color: accent, fontSize: 11, fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? '...' : 'Load'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: '10px 14px' }}>
        {mdError && <div style={{ color: '#ff5370', fontSize: 12, padding: '6px 0' }}>{mdError}</div>}
        {content !== null && !mdError
          ? renderMarkdown(content, accent)
          : !mdError && <PanelEmpty icon="fileText" accent={accent} hint="Type a path above and press Enter, or click a .md file in the Files tab.">No file loaded</PanelEmpty>
        }
      </div>
    </div>
  )
}

export default MarkdownTab
