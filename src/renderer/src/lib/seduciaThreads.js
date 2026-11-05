import { useSyncExternalStore } from 'react'

// Seducia conversations as threads (after T3: every conversation is a thread
// with a status in the sidebar). A tiny external store shared by the chat
// pane and the sidebar, persisted per user (localStorage keys starting with
// `sush` are scoped by lib/userScope).
//
// thread: { id, title, log: [entry], ai: [{ role, content }], createdAt, updatedAt }
// Status is derived, never stored: working (a reply is streaming), needs
// (an action waits for approval), settled.

const KEY = 'sush-seducia-threads'
const MAX_THREADS = 30
const MAX_LOG = 200
const MAX_AI = 40

let seq = Date.now()
export const nextEntryId = () => ++seq
const newId = () => `sz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

function blank(now = Date.now()) {
  return { id: newId(), title: '', log: [], ai: [], createdAt: now, updatedAt: now }
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (raw && Array.isArray(raw.threads) && raw.threads.length) {
      // A reply that was streaming when the app closed will never finish.
      const threads = raw.threads.filter(t => t && t.id).map(t => ({
        ...t,
        log: (t.log || []).map(e => (e.streaming ? { ...e, streaming: false, doneAt: e.doneAt || t.updatedAt, text: e.text || '(interrupted)' } : e))
      }))
      const activeId = threads.some(t => t.id === raw.activeId) ? raw.activeId : threads[0].id
      return { threads, activeId }
    }
  } catch {}
  const t = blank()
  return { threads: [t], activeId: t.id }
}

let state = null
const listeners = new Set()
let saveTimer = null

function get() {
  if (!state) state = load()
  return state
}

function persist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const s = get()
      const threads = s.threads
        .filter(t => t.log.length)
        .slice(0, MAX_THREADS)
        .map(t => ({ ...t, log: t.log.slice(-MAX_LOG), ai: t.ai.slice(-MAX_AI) }))
      localStorage.setItem(KEY, JSON.stringify({ threads, activeId: s.activeId }))
    } catch {}
  }, 400)
}

function set(next) {
  state = next
  persist()
  listeners.forEach(l => l())
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useSeduciaThreads() {
  return useSyncExternalStore(subscribe, get, get)
}

export function activeThread(s = get()) {
  return s.threads.find(t => t.id === s.activeId) || s.threads[0]
}

const titleFrom = text => {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  return t.length > 48 ? `${t.slice(0, 47)}…` : t
}

export function updateThread(id, fn) {
  const s = get()
  let touched = false
  const threads = s.threads.map(t => {
    if (t.id !== id) return t
    touched = true
    const next = fn(t)
    const firstAsk = !next.title && next.log.find(e => e.role === 'you')
    return { ...next, title: next.title || (firstAsk ? titleFrom(firstAsk.text) : ''), updatedAt: Date.now() }
  })
  if (!touched) return
  // Most recently touched first.
  threads.sort((a, b) => b.updatedAt - a.updatedAt)
  set({ ...s, threads })
}

export function selectThread(id) {
  const s = get()
  if (s.threads.some(t => t.id === id) && s.activeId !== id) set({ ...s, activeId: id })
}

// A new chat; reuses an untouched empty one instead of piling them up.
export function newThread() {
  const s = get()
  const empty = s.threads.find(t => !t.log.length)
  if (empty) { set({ ...s, activeId: empty.id }); return empty.id }
  const t = blank()
  set({ threads: [t, ...s.threads].slice(0, MAX_THREADS), activeId: t.id })
  return t.id
}

export function removeThread(id) {
  const s = get()
  const threads = s.threads.filter(t => t.id !== id)
  if (!threads.length) threads.push(blank())
  set({ threads, activeId: s.activeId === id ? threads[0].id : s.activeId })
}

export function threadStatus(t) {
  const log = t?.log || []
  if (log.some(e => e.streaming)) return 'working'
  if (log.some(e => e.approvals?.some(a => !a.status))) return 'needs'
  return 'settled'
}

// Test hook.
export function __resetSeduciaThreads(next = null) {
  state = next
  listeners.forEach(l => l())
}
