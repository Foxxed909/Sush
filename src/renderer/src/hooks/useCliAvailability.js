import { useCallback, useEffect, useState } from 'react'
import { AGENTS } from '../lib/agents'

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
      for (const a of AGENTS) {
        if (a.id === 'shell') continue
        if (a.probeDir) dirAgents.push(a)
        else bins.push({ id: a.id, bin: String(a.command || '').split(/\s+/)[0] })
      }
      const next = { shell: true }
      const res = await window.sush.checkClis?.({ names: [...new Set(bins.map(b => b.bin))], refresh })
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
