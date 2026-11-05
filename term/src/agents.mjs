import { execFileSync } from 'node:child_process'
import { MODEL_OPTIONS, EFFORT_OPTIONS, EFFORT_LABELS } from '../../src/renderer/src/lib/modelCatalog.mjs'

// The agents Sush Terminal can launch. Model lists come from the same
// catalog the desktop app uses (src/renderer/src/lib/modelCatalog.mjs).
export const AGENTS = [
  { id: 'claude', label: 'Claude Code', glyph: '✳', colour: '#d97757', bin: 'claude',
    launch: ({ model, prompt, resume, effort }) => ['claude', ...(resume ? ['--continue'] : []), ...(model ? ['--model', model] : []), ...(effort ? ['--effort', effort] : []), ...(prompt ? [prompt] : [])] },
  { id: 'codex', label: 'Codex', glyph: '◎', colour: '#10a37f', bin: 'codex',
    // TOML literal string: one argument, portable through cmd/PowerShell/sh.
    launch: ({ model, prompt, resume, effort }) => {
      const eff = effort ? ['-c', `model_reasoning_effort='${effort}'`] : []
      return resume ? ['codex', 'resume', '--last', ...eff] : ['codex', ...(model ? ['--model', model] : []), ...eff, ...(prompt ? [prompt] : [])]
    } },
  { id: 'gemini', label: 'Gemini', glyph: '✦', colour: '#4285f4', bin: 'gemini',
    launch: ({ model, prompt, resume }) => ['gemini', ...(resume ? ['--resume', 'latest'] : []), ...(model ? ['--model', model] : []), ...(prompt ? ['-i', prompt] : [])] },
  { id: 'opencode', label: 'OpenCode', glyph: '▣', colour: '#f5a742', bin: 'opencode',
    launch: ({ model, prompt, resume }) => ['opencode', ...(resume ? ['--continue'] : []), ...(model ? ['-m', model] : []), ...(prompt ? ['--prompt', prompt] : [])] }
]

export function agentById(id) { return AGENTS.find(a => a.id === id) || null }

export function modelsFor(id) {
  return (MODEL_OPTIONS[id] || []).map(o => ({ value: o.value || null, label: o.label, note: o.note || '', badge: o.badge || '' }))
}

export function effortsFor(id) { return EFFORT_OPTIONS[id] || [] }
export function effortLabel(value) { return value ? (EFFORT_LABELS[value] || value) : 'Default' }

export function modelLabel(id, value) {
  const hit = modelsFor(id).find(m => m.value === (value || null))
  return hit ? hit.label : (value || 'Default')
}

// Which CLIs are on PATH, and their versions (best-effort, 2s each).
export function detectInstalled(run = execFileSync) {
  const found = {}
  for (const a of AGENTS) {
    try {
      const out = String(run(a.bin, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000, shell: process.platform === 'win32' }))
      const v = out.match(/\d+\.\d+(\.\d+)?/)
      found[a.id] = { installed: true, version: v ? v[0] : '' }
    } catch {
      found[a.id] = { installed: false, version: '' }
    }
  }
  return found
}

// The argv to run, validated: models are plain ids, prompts are one argument.
const SAFE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/
export function commandFor(id, { model = null, prompt = '', resume = false, effort = null } = {}) {
  const agent = agentById(id)
  if (!agent) return null
  const m = model && SAFE_MODEL.test(model) ? model : null
  const p = String(prompt || '').trim()
  // Only levels this CLI accepts; anything else is dropped, never passed.
  const e = effort && effortsFor(id).includes(effort) ? effort : null
  return agent.launch({ model: m, prompt: p, resume, effort: e })
}
