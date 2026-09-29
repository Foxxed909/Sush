// Nightly channel shell: the T3-style layout with top-level modes. Pure
// helpers so the routing rules (which surface covers the terminals, where the
// terminal layer sits) are unit-tested rather than buried in App.jsx.

export const UI_CHANNELS = ['nightly', 'stable']

export const SHELL_MODES = [
  { id: 'chat', label: 'Chat', icon: 'sparkles', hint: 'Seducia — orchestrate agents in conversation' },
  { id: 'code', label: 'Code', icon: 'terminal', hint: 'Live terminal with diff panel' },
  { id: 'thread', label: 'Thread', icon: 'fileText', hint: 'Structured transcript, terminal in the drawer' },
  { id: 'agents', label: 'Agents', icon: 'grid', hint: 'Every session in every project' },
  { id: 'office', label: 'Office', icon: 'users', hint: '3D office — walk up to an agent to open it' }
]

const MODE_IDS = new Set(SHELL_MODES.map(mode => mode.id))

// Stable is the proven Quiet Nights shell; Nightly gets every change first and
// is promoted to Stable once it has held up.
export function normalizeChannel(value) {
  return value === 'stable' ? 'stable' : 'nightly'
}

export function normalizeShellMode(value) {
  return MODE_IDS.has(value) && value !== 'agents' ? value : 'code'
}

// Agents is the Overview view, so Ctrl+Shift+M and the header stay in sync.
export function activeShellMode(view, shellMode) {
  if (view === 'overview') return 'agents'
  return normalizeShellMode(shellMode)
}

export function threadCentered(tab) {
  return tab?.agentId === 'claude' && tab?.threadBridge === true
}

// Where the (never-remounted) terminal layer sits for the current mode:
// 'full'   — fills the work area (Code, or Thread for non-Claude sessions)
// 'drawer' — docked under the Thread transcript
// 'hidden' — covered by Chat / Agents / Office / Home, still mounted
export function terminalPlacement({ channel, mode, view, activeTab, drawerOpen }) {
  if (normalizeChannel(channel) === 'stable') return 'full'
  if (view === 'home' || view === 'overview') return 'full'
  if (mode === 'chat' || mode === 'office') return 'hidden'
  if (mode === 'thread' && threadCentered(activeTab)) return drawerOpen ? 'drawer' : 'hidden'
  return 'full'
}

export function modeFromShortcut(event) {
  if (!event?.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  const index = Number(event.key) - 1
  return Number.isInteger(index) && SHELL_MODES[index] ? SHELL_MODES[index].id : null
}
