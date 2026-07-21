// The panel normally uses acceptEdits so existing profiles keep their current
// no-prompt editing flow. A profile may opt into a supported Claude Code mode
// in its isolated .claude/settings.json; the active account slot then owns the
// choice instead of it becoming a machine-wide default.
const PANEL_PERMISSION_MODES = new Set([
  'default',
  'acceptEdits',
  'plan',
  'dontAsk',
  'bypassPermissions'
])

export function resolvePanelPermissionMode(requestedMode, configuredMode) {
  if (PANEL_PERMISSION_MODES.has(requestedMode)) return requestedMode
  if (PANEL_PERMISSION_MODES.has(configuredMode)) return configuredMode
  return 'acceptEdits'
}
