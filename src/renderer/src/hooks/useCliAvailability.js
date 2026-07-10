import { useCallback, useEffect, useState } from 'react'
import { allAgents } from '../lib/agents'

export function executableFromCommand(command) {
  const value = String(command || '').trim()
  if (!value) return ''
  const quote = value[0]
  if (quote === '"' || quote === "'") {
    const end = value.indexOf(quote, 1)
    return end > 1 ? value.slice(1, end) : value.slice(1)
  }
  return value.match(/^\S+/)?.[0] || ''
}

// Which agent CLIs are actually installed: id -> true|false. A missing key
// means "probe still in flight" — treat it as available so tiles never lock
// by mistake while we're checking. PATH agents go through one cached
// where.exe sweep in main; local-folder agents (probeDir) just stat the dir.
export function useCliAvailability() {
  const [avail, setAvail] = useState({ shell: true })
  const [checking, setChecking] = useState(false)

  const scan = useCallback(async (refresh = false) => {
    setChecking(true)
    try {
      const bins = []
      const dirAgents = []
      for (const a of allAgents()) {
        if (a.id === 'shell') continue
        if (a.probeDir) dirAgents.push(a)
        else bins.push({ id: a.id, bin: executableFromCommand(a.command) })
      }
      const next = { shell: true }
      const res = await window.sush.checkClis?.({ names: [...new Set(bins.map(b => b.bin).filter(Boolean))], refresh })
      const found = res?.found || {}
      bins.forEach(({ id, bin }) => { next[id] = found[bin] !== false })
      await Promise.all(dirAgents.map(async (a) => {
        try {
          const r = await window.sush.dirExists({ path: a.probeDir })
          next[a.id] = r?.exists !== false
        } catch {
          next[a.id] = true
        }
      }))
      setAvail(next)
    } catch {}
    setChecking(false)
  }, [])

  useEffect(() => { scan(false) }, [scan])
  return { avail, rescan: () => scan(true), checking }
}
