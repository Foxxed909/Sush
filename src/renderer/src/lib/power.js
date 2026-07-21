// The performance-mode ladder. One enum replaced three overlapping booleans
// (lite / powerSaver / ecoMode) whose containment relationships (eco ⊃ saver
// ⊃ reduced) were real in App's class algebra but invisible in the UI. Each
// rung includes everything below it.
export const PERF_MODES = ['full', 'reduced', 'saver', 'eco']

// Resolve the active mode. Legacy boolean settings (pre-ladder installs)
// still map correctly — highest rung wins — so no migration step is needed:
// the first time the user touches the ladder, `perfMode` is written and the
// legacy keys are dropped.
export function perfModeOf(settings = {}) {
  if (PERF_MODES.includes(settings.perfMode)) return settings.perfMode
  if (settings.ecoMode) return 'eco'
  if (settings.powerSaver) return 'saver'
  if (settings.lite) return 'reduced'
  return 'full'
}

// Write a mode, retiring the legacy booleans in the same save.
export function withPerfMode(settings, mode) {
  const next = { ...settings, perfMode: PERF_MODES.includes(mode) ? mode : 'full' }
  delete next.ecoMode
  delete next.powerSaver
  delete next.lite
  return next
}

// ── Feather mode ─────────────────────────────────────────────────────────────
// One-click light profile: the eco rung plus reduced motion and a solid window
// material, as a single named toggle. It composes existing settings rather than
// adding a parallel rendering path — turning it off restores exactly what the
// user had before (kept in `featherRestore`). Feather is only a rendering
// profile; it never changes plans, features, or terminal behavior.

export function isFeather(settings = {}) {
  return settings.featherMode === true
}

export function withFeather(settings, on) {
  if (on) {
    if (isFeather(settings)) return settings
    const featherRestore = {
      perfMode: perfModeOf(settings),
      reduceMotion: settings.reduceMotion === true,
      windowMaterial: settings.windowMaterial ?? 'solid'
    }
    return {
      ...withPerfMode(settings, 'eco'),
      reduceMotion: true,
      windowMaterial: 'solid',
      featherMode: true,
      featherRestore
    }
  }
  if (!isFeather(settings)) return settings
  const r = settings.featherRestore || {}
  const next = withPerfMode(settings, PERF_MODES.includes(r.perfMode) ? r.perfMode : 'full')
  next.reduceMotion = r.reduceMotion === true
  next.windowMaterial = r.windowMaterial ?? 'solid'
  delete next.featherMode
  delete next.featherRestore
  return next
}
