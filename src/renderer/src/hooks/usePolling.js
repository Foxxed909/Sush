import { useEffect, useRef } from 'react'

// Poll `fn` every `interval` ms — but ONLY while the window is focused AND the
// document is visible. When you alt-tab away or minimize, polling stops dead
// (no wasted CPU, no child-process spawns from system-stat calls in the
// background) and resumes — with one immediate read — the moment you come back.
//
// This is the single biggest "make it lighter" lever for the app: every live
// dashboard (status bar, system stats, ports, docker) used to keep hammering
// the OS on a timer regardless of whether anyone was looking.
export function usePolling(fn, interval, enabled = true) {
  const fnRef = useRef(fn)
  useEffect(() => { fnRef.current = fn }, [fn])

  useEffect(() => {
    if (!enabled) return
    let id = null
    // Idle sleep (body[data-sleeping]) gates every poll the same way blur
    // does — a resting app must not keep spawning system probes.
    const active = () => document.hasFocus() && !document.hidden && !document.body.dataset.sleeping

    const start = () => {
      if (id) return
      fnRef.current?.()                       // immediate read on (re)activation
      // Re-check per tick: sleep can begin without a focus/visibility event.
      id = setInterval(() => { if (active()) fnRef.current?.() }, interval)
    }
    const stop = () => { if (id) { clearInterval(id); id = null } }
    const sync = () => { active() ? start() : stop() }

    sync()
    window.addEventListener('focus', sync)
    window.addEventListener('blur', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      stop()
      window.removeEventListener('focus', sync)
      window.removeEventListener('blur', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [interval, enabled])
}
