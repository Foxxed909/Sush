import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { cliComplete } from '../../lib/ai'
import { PanelEmpty, TabHeader, copyToClipboard } from './shared'

// ---------- Command History + Explainer ----------
// One-shot via the logged-in CLI (no API key).
async function explainCommand(cmd) {
  const prompt = `Explain this shell command in 1-2 concise sentences for a developer. Be direct.\n\nCommand: ${cmd}`
  return cliComplete(prompt)
}

function HistoryTab({ accent, history, onRun, settings = {} }) {
  const [search, setSearch] = useState('')
  const [explanations, setExplanations] = useState({})
  const [explaining, setExplaining] = useState(new Set())
  const displayed = history.filter(cmd => !search || cmd.toLowerCase().includes(search.toLowerCase())).slice().reverse()

  const explain = async (cmd) => {
    if (explanations[cmd]) { setExplanations(p => { const n = { ...p }; delete n[cmd]; return n }); return }
    setExplaining(p => new Set([...p, cmd]))
    try {
      const text = await explainCommand(cmd)
      setExplanations(p => ({ ...p, [cmd]: text || 'Could not explain (is the Claude/Codex CLI installed and signed in?)' }))
    } catch (e) {
      setExplanations(p => ({ ...p, [cmd]: `Error: ${e.message}` }))
    } finally {
      setExplaining(p => { const n = new Set(p); n.delete(cmd); return n })
    }
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader accent={accent} icon="clock" title="History" sub={`${history.length} commands`} />
      <div style={{ padding: '8px 10px 0' }}>
        <div className="sush-omni flex items-center" style={{ height: 34, gap: 8 }}>
          <Icon name="search" size={13} color="var(--text-4)" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter history..."
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-1)', outline: 'none', fontSize: 12 }}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        {!displayed.length ? (
          <PanelEmpty icon="clock" accent={accent} hint="Commands you run in the active session will appear here.">No history yet</PanelEmpty>
        ) : displayed.map((cmd, i) => (
          <div key={i} style={{ marginBottom: 5 }}>
            <div className="flex items-center" style={{ gap: 6, border: '1px solid var(--border-1)', borderRadius: 8, background: 'var(--surface-2)', padding: '5px 6px 5px 10px' }}>
              <Icon name="chevronRight" size={11} color="var(--text-5)" />
              <button
                onClick={() => onRun(cmd)}
                title={`Run: ${cmd}`}
                style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 0 }}
              >
                {cmd}
              </button>
              <button
                onClick={() => copyToClipboard(cmd)}
                title="Copy command"
                style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 6, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="copy" size={11} />
              </button>
              <button
                onClick={() => explain(cmd)}
                title="Explain this command"
                style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 6, border: `1px solid ${explanations[cmd] ? rgba(accent, 0.4) : 'var(--border-2)'}`, background: explanations[cmd] ? rgba(accent, 0.1) : 'transparent', color: explanations[cmd] ? accent : 'var(--text-5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}
              >
                {explaining.has(cmd) ? '...' : '?'}
              </button>
            </div>
            {explanations[cmd] && (
              <div style={{ padding: '6px 10px 6px 12px', fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.55, borderLeft: `2px solid ${rgba(accent, 0.35)}`, marginLeft: 4, marginTop: 3 }}>
                {explanations[cmd]}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default HistoryTab
