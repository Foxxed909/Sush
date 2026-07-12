export type FeatureGroup = 'instant' | 'sessions' | 'projects' | 'agents' | 'security' | 'integration'
export interface AirFeature { id: number; key: string; label: string; group: FeatureGroup; description: string; module: string; paidBehavior?: string }
export const AIR_FEATURES: AirFeature[] = [
  [1,'sush-drop','Sush Drop','instant','Global shortcut terminal overlay.','drop','Free daily quota; unlimited on paid plans.'],
  [2,'context-launch','Context Launch','instant','Open folders and deep links in the running app.','runtime'],
  [3,'tray-switcher','Tray Workspace Switcher','instant','Open recent workspaces from the system tray.','runtime'],
  [4,'tiny-mode','Tiny Mode','instant','Terminal-only rendering mode.','ui'],
  [5,'battery-guard','Battery Guard','instant','Pause polling and visual work while idle or on low battery.','power'],
  [6,'scratch-sessions','Scratch Sessions','sessions','Disposable sessions with no persisted metadata.','sessions'],
  [7,'instant-resume','Instant Resume','sessions','Restore the most recent safe session context.','persistence'],
  [8,'session-checkpoints','Session Checkpoints','sessions','Crash-safe sanitized session restoration.','persistence'],
  [9,'workspace-capsules','Workspace Capsules','sessions','Portable non-secret workspace manifests.','capsules'],
  [10,'single-instance','Single-Instance Router','sessions','Route new launches to the existing process.','runtime'],
  [11,'project-fingerprint','Project Fingerprint','projects','Detect stacks and likely commands.','projects'],
  [12,'dev-stack','Dev Stack Launcher','projects','Launch a project recipe with health tracking.','tasks'],
  [13,'task-lanes','Task Lanes','projects','Track servers, tests, builds, and agents.','tasks'],
  [14,'port-guardian','Port Guardian','projects','Inspect local listening ports and ownership.','ports'],
  [15,'micro-worktrees','Micro Worktrees','projects','Create safe disposable Git worktrees.','git'],
  [16,'agent-bridge','Agent Bridge','agents','Attach installed agent CLIs to a terminal.','agents'],
  [17,'error-to-agent','Error-to-Agent','agents','Send reviewed error context to an agent.','agents'],
  [18,'context-pack','Context Pack','agents','Preview files, diff, and errors before agent handoff.','agents'],
  [19,'approval-inbox','Approval Inbox','agents','Central queue for scoped tool approvals.','approvals'],
  [20,'budget-guard','Agent Budget Guard','agents','Enforce time, command, and token estimates.','agents'],
  [21,'air-vault','Air Vault','security','Stronghold-backed local secret storage.','vault'],
  [22,'privacy-session','Privacy Session','security','Disable persistence and background network activity.','sessions'],
  [23,'paste-guard','Secret Paste Guard','security','Detect likely credentials before paste.','security'],
  [24,'risk-preview','Command Risk Preview','security','Explain destructive command risk before execution.','security'],
  [25,'capability-inspector','Capability Inspector','security','Show the app permission surface.','capabilities'],
  [26,'git-pulse','Git Pulse','integration','Compact branch and dirty-state indicator.','git'],
  [27,'completion-alerts','Background Completion Alerts','integration','Native task and agent completion notifications.','notifications'],
  [28,'signed-updates','Signed Update Channels','integration','Stable, beta, and nightly signed updates.','updater'],
  [29,'edition-handoff','Cross-Edition Handoff','integration','Sanitized transfer between Air and full Sush.','handoff'],
  [30,'resource-dashboard','Resource Budget Dashboard','integration','CPU, memory, child process, and session budgets.','resources']
].map(([id,key,label,group,description,module,paidBehavior]) => ({ id, key, label, group, description, module, ...(paidBehavior ? { paidBehavior } : {}) }) as AirFeature)
export const CAPABILITY_SUMMARY = [
  { capability: 'terminal', scope: 'Spawn only an approved shell or detected agent CLI.' },
  { capability: 'filesystem', scope: 'Read selected workspaces; write exports only after user action.' },
  { capability: 'git', scope: 'Run fixed, bounded Git operations inside selected repositories.' },
  { capability: 'network', scope: 'Disabled except explicit account sync and signed update checks.' },
  { capability: 'vault', scope: 'Stronghold only; values never appear in listings or sync.' },
  { capability: 'shortcut', scope: 'Register only the configured Sush Drop shortcut.' }
]
