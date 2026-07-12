export type HostPlatform = 'windows' | 'macos' | 'linux' | 'unknown'
export type PlanId = 'free' | 'air-monthly' | 'air-lifetime' | 'pro' | 'max'
export interface Entitlements { plan: PlanId; paid: boolean; dropDailyLimit: number | null; source: 'local' | 'license' | 'sush-account'; expiresAt?: string }
export interface ShellProfile { id: string; label: string; shell: string; theme: 'air' | 'mono' | 'ocean' }
export interface AirSession { id: string; label: string; cwd: string; shell: string; profileId: string; scratch: boolean; privacy: boolean; agent?: string; createdAt: number; lastActiveAt: number }
export interface WorkspaceCapsule { version: 1; id: string; label: string; cwd: string; shell: string; recipeIds: string[]; agent?: string; createdAt: number }
export interface ProjectFingerprint { cwd: string; kind: string; packageManager?: string; commands: string[]; markers: string[] }
export interface GitPulse { branch: string; dirty: number; staged: number; ahead: number; behind: number; conflicted: number }
export interface PortOwner { port: number; pid: number; process: string; address: string }
export interface TaskLane { id: string; label: string; command: string; cwd: string; status: 'queued' | 'running' | 'success' | 'failed' | 'stopped'; startedAt?: number; finishedAt?: number; output: string }
export interface ApprovalRequest { id: string; title: string; detail: string; risk: 'low' | 'medium' | 'high' | 'critical'; createdAt: number; expiresAt: number; action: string }
export interface AgentBudget { maxMinutes: number; maxCommands: number; maxEstimatedTokens: number }
export interface ResourceSnapshot { appMemoryMb: number; appCpuPercent: number; childProcesses: number; activeSessions: number; capturedAt: number }
export interface SyncPreferences { themes: boolean; recipes: boolean; capsules: boolean; agentPreferences: boolean }
export interface SyncPayload { version: 1; createdAt: number; preferences?: Record<string, unknown>; themes?: unknown[]; recipes?: Array<{ id: string; label: string; command: string }>; capsules?: WorkspaceCapsule[]; agentPreferences?: Record<string, string> }
export interface RuntimeInfo { tauri: boolean; platform: HostPlatform; version: string; homeDir: string; dropShortcutAvailable?: boolean }
