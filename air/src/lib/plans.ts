import type { Entitlements, PlanId } from './types'
export const FREE_DROP_DAILY_LIMIT = 10
export const PLAN_LABELS: Record<PlanId, string> = { free: 'Air Free', 'air-monthly': 'Air Monthly', 'air-lifetime': 'Air Lifetime', pro: 'Sush Pro', max: 'Sush Max' }
export function entitlementsFor(plan: PlanId, source: Entitlements['source'] = 'local', expiresAt?: string): Entitlements { const paid = plan !== 'free'; return { plan, paid, dropDailyLimit: paid ? null : FREE_DROP_DAILY_LIMIT, source, ...(expiresAt ? { expiresAt } : {}) } }
export function normalizePlan(value: unknown): PlanId { const plan = String(value || '').toLowerCase(); return plan === 'air-monthly' || plan === 'air-lifetime' || plan === 'pro' || plan === 'max' ? plan : 'free' }
export function isExpired(value: Entitlements, now = Date.now()): boolean { if (!value.expiresAt) return false; const expiry = Date.parse(value.expiresAt); return !Number.isFinite(expiry) || now >= expiry }
export function dropAllowance(value: Entitlements, used: number) { const limit = isExpired(value) ? FREE_DROP_DAILY_LIMIT : value.dropDailyLimit; if (limit === null) return { allowed: true, remaining: null }; const remaining = Math.max(0, limit - Math.max(0, used)); return { allowed: remaining > 0, remaining } }
