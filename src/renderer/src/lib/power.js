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
