import { useState, useEffect, useCallback, useRef } from 'react'
import { pickCandidate, suggestAliasName, dismissCommand } from '../lib/commandFrequency'

// Parse the [alias] section of a raw .sushrc into the alias names (keys) and the
// commands they map to (values). Used to avoid re-suggesting an existing alias.
function parseAliases(text) {
  const keys = new Set()
  const values = new Set()
  let inAlias = false
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (/^\[.+\]$/.test(line)) { inAlias = /^\[alias\]$/i.test(line); continue }
    if (!inAlias || !line || line.startsWith('#') || line.startsWith(';')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    keys.add(line.slice(0, eq).trim())
    values.add(line.slice(eq + 1).trim())
  }
  return { keys, values }
}

// Insert `name = command` into the [alias] section, creating it if absent.
function appendAlias(content, name, command) {
  const text = content || ''
  const lines = text.split(/\r?\n/)
  const idx = lines.findIndex(l => /^\[alias\]\s*$/i.test(l.trim()))
  const entry = `${name} = ${command}`
  if (idx < 0) {
    const sep = text === '' || text.endsWith('\n') ? '' : '\n'
    return `${text}${sep}\n[alias]\n${entry}\n`
  }
  lines.splice(idx + 1, 0, entry)
  return lines.join('\n')
}

// Watches the command-frequency table (re-evaluating whenever `tick` changes)
// and surfaces at most one alias suggestion at a time. `enabled` lets Settings
// switch the whole feature off without unmounting the host.
export function useAutoAlias(tick, enabled = true) {
  const [suggestion, setSuggestion] = useState(null)
  const aliasesRef = useRef({ keys: new Set(), values: new Set() })

  const refreshAliases = useCallback(async () => {
    try {
      const res = await window.sush?.sushrcRead?.()
      aliasesRef.current = parseAliases(res?.content || '')
    } catch { /* keep prior snapshot */ }
  }, [])

  useEffect(() => { refreshAliases() }, [refreshAliases])

  useEffect(() => {
    if (!enabled) { setSuggestion(null); return }
    const cand = pickCandidate(aliasesRef.current.values)
    if (!cand) { setSuggestion(null); return }
    const alias = suggestAliasName(cand.command, aliasesRef.current.keys)
    setSuggestion({ ...cand, alias })
  }, [tick, enabled])

  const accept = useCallback(async (aliasName, command) => {
    const name = String(aliasName || '').trim()
    if (!name || !command) return { ok: false, error: 'empty' }
    const res = await window.sush?.sushrcRead?.()
    const next = appendAlias(res?.content || '', name, command)
    const w = await window.sush?.sushrcWrite?.({ content: next })
    await refreshAliases()
    setSuggestion(null)
    return w || { ok: true }
  }, [refreshAliases])

  const dismiss = useCallback((command) => {
    dismissCommand(command)
    setSuggestion(null)
  }, [])

  return { suggestion, accept, dismiss }
}
