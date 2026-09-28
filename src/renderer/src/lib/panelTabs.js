// Right-panel tab metadata, shared by the panel shell (RightPanel) and the
// Settings visibility chooser — kept here so a settings section doesn't have
// to import the entire panel (Browser, Seducia, every tab body) just to list
// tab names.
//
// Four honest clusters (the strip draws a hairline between them) so 14+ tools
// stop reading as one anonymous scroll. History and Snippets are hidden by
// default — they live in the command palette (Ctrl+P) — but stay toggleable
// per user in Settings ▸ Terminal.
export const TAB_GROUPS = [
  { id: 'ai', label: 'AI', tabs: [
    { id: 'agent', label: 'Agent', icon: 'sparkles' },
    { id: 'context', label: 'Context', icon: 'layers' },
    { id: 'thread', label: 'Thread', icon: 'fileText' },
    { id: 'claude', label: 'Claude', icon: 'sparkles' },
  ] },
  { id: 'project', label: 'Project', tabs: [
    { id: 'changes', label: 'Changes', icon: 'gitBranch' },
    { id: 'files', label: 'Files', icon: 'file' },
    { id: 'tasks', label: 'Tasks', icon: 'check' },
    { id: 'memory', label: 'Memory', icon: 'book' },
    { id: 'scripts', label: 'Scripts', icon: 'rocket' },
    { id: 'markdown', label: 'Preview', icon: 'fileText' },
  ] },
  { id: 'web', label: 'Web', tabs: [
    { id: 'browser', label: 'Browser', icon: 'globe' },
    { id: 'github', label: 'GitHub', icon: 'github' },
  ] },
  { id: 'ops', label: 'Ops', tabs: [
    { id: 'ports', label: 'Ports', icon: 'ports' },
    { id: 'docker', label: 'Docker', icon: 'layers' },
    { id: 'env', label: 'Env', icon: 'key' },
    { id: 'ssh', label: 'SSH', icon: 'lock' },
  ] },
  { id: 'more', label: 'More', tabs: [
    { id: 'history', label: 'History', icon: 'clock' },
    { id: 'snippets', label: 'Snippets', icon: 'command' },
  ] },
]

export const TABS = TAB_GROUPS.flatMap(g => g.tabs)

// Absorbed into the command palette, so off the strip unless the user opts in.
export const DEFAULT_HIDDEN_TABS = ['history', 'snippets']
