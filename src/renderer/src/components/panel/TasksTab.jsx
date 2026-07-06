import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { PanelEmpty, TabHeader } from './shared'

// ---------- Tasks (.sush project ledger) ----------
const TASK_ROLES = ['Scout', 'Builder', 'Reviewer', 'Tester', 'Docs', 'Security']
const TASK_STATUSES = ['todo', 'doing', 'review', 'blocked', 'done']
const TASK_STATUS_META = {
  todo: { label: 'Todo', color: '#8b9bb0' },
  doing: { label: 'Doing', color: '#89ddff' },
  review: { label: 'Review', color: '#ffcb6b' },
  blocked: { label: 'Blocked', color: '#ff5370' },
  done: { label: 'Done', color: '#c3e88d' }
}

function nextTaskStatus(status) {
  const i = TASK_STATUSES.indexOf(status)
  return TASK_STATUSES[(i + 1) % TASK_STATUSES.length] || 'todo'
}

function parseTaskList(value) {
  return String(value || '')
    .split(/[\n,]+/)
    .map(v => v.trim())
    .filter(Boolean)
}

function TaskPill({ children, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 20, padding: '2px 7px', borderRadius: 999, border: `1px solid ${rgba(color, 0.35)}`, background: rgba(color, 0.08), color, fontSize: 10, fontWeight: 800 }}>
      {children}
    </span>
  )
}

function TasksTab({ accent, cwd, onRun }) {
  const [ledger, setLedger] = useState(null)
  const [form, setForm] = useState({ title: '', role: 'Builder', files: '', gate: '' })
  const [evidenceDrafts, setEvidenceDrafts] = useState({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    if (!cwd) { setLedger({ ok: true, tasks: [] }); return }
    window.sush?.tasksRead?.({ cwd })
      .then(res => setLedger(res || { ok: false, tasks: [], error: 'Task ledger unavailable' }))
      .catch(e => setLedger({ ok: false, tasks: [], error: e.message }))
  }, [cwd])

  useEffect(() => { load(); setEvidenceDrafts({}) }, [load])

  const tasks = ledger?.tasks || []
  const counts = TASK_STATUSES.reduce((acc, status) => ({ ...acc, [status]: tasks.filter(t => t.status === status).length }), {})

  const saveNew = async () => {
    const title = form.title.trim()
    if (!title || busy) return
    setBusy(true)
    try {
      const res = await window.sush?.tasksAdd?.({
        cwd,
        task: {
          title,
          role: form.role,
          files: parseTaskList(form.files),
          gate: form.gate.trim()
        }
      })
      if (res?.ok) {
        setForm({ title: '', role: form.role, files: '', gate: '' })
        setLedger(res)
      } else {
        setLedger(res || { ok: false, tasks, error: 'Could not save task' })
      }
    } finally {
      setBusy(false)
    }
  }

  const patchTask = async (task, patch) => {
    const res = await window.sush?.tasksUpdate?.({ cwd, id: task.id, patch })
    if (res?.ok) setLedger(res)
  }

  const deleteTask = async (task) => {
    const res = await window.sush?.tasksDelete?.({ cwd, id: task.id })
    if (res?.ok) setLedger(res)
  }

  const addEvidence = async (task) => {
    const line = String(evidenceDrafts[task.id] || '').trim()
    if (!line) return
    await patchTask(task, { evidence: [...(task.evidence || []), line] })
    setEvidenceDrafts(d => ({ ...d, [task.id]: '' }))
  }

  const runGate = async (task) => {
    const cmd = String(task.gate || '').trim()
    if (!cmd) return
    onRun?.(cmd)
    await patchTask(task, { evidence: [...(task.evidence || []), `Queued gate: ${cmd}`] })
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="check"
        title="Tasks"
        sub={ledger?.file ? `${tasks.length} task${tasks.length === 1 ? '' : 's'} - .sush/tasks.json` : 'Project ledger'}
        onRefresh={load}
      />

      <div style={{ padding: 10, borderBottom: '1px solid var(--border-1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') saveNew() }}
          placeholder="New task..."
          spellCheck={false}
          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-1)', background: 'var(--surface-0)', color: 'var(--text-1)', outline: 'none', fontSize: 12.5 }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8 }}>
          <select
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            style={{ minWidth: 0, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border-1)', background: 'var(--surface-0)', color: 'var(--text-2)', fontSize: 11.5, outline: 'none' }}
          >
            {TASK_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
          </select>
          <input
            value={form.files}
            onChange={e => setForm(f => ({ ...f, files: e.target.value }))}
            placeholder="file claims, globs"
            spellCheck={false}
            style={{ minWidth: 0, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border-1)', background: 'var(--surface-0)', color: 'var(--text-2)', fontSize: 11.5, outline: 'none' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 74px', gap: 8 }}>
          <input
            value={form.gate}
            onChange={e => setForm(f => ({ ...f, gate: e.target.value }))}
            placeholder="gate command, e.g. npm run build"
            spellCheck={false}
            style={{ minWidth: 0, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border-1)', background: 'var(--surface-0)', color: 'var(--text-2)', fontSize: 11.5, outline: 'none', fontFamily: 'monospace' }}
          />
          <button
            onClick={saveNew}
            disabled={!form.title.trim() || busy}
            style={{ borderRadius: 8, border: 'none', background: form.title.trim() && !busy ? accent : 'var(--border-1)', color: form.title.trim() && !busy ? '#090b0f' : 'var(--text-5)', fontSize: 11.5, fontWeight: 900, cursor: form.title.trim() && !busy ? 'pointer' : 'default' }}
          >
            Add
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        {!ledger ? (
          <PanelEmpty icon="check" accent={accent}>Loading...</PanelEmpty>
        ) : !ledger.ok ? (
          <PanelEmpty icon="check" accent={accent} hint={ledger.error}>Task ledger error</PanelEmpty>
        ) : !tasks.length ? (
          <PanelEmpty icon="check" accent={accent} hint="Tasks live in .sush/tasks.json for this workspace. Add one with a role, file claim, and optional gate command.">No project tasks</PanelEmpty>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {TASK_STATUSES.map(status => (
                <TaskPill key={status} color={TASK_STATUS_META[status].color}>{TASK_STATUS_META[status].label}: {counts[status] || 0}</TaskPill>
              ))}
            </div>
            {tasks.map(task => {
              const meta = TASK_STATUS_META[task.status] || TASK_STATUS_META.todo
              const evidenceDraft = evidenceDrafts[task.id] || ''
              return (
                <div key={task.id} style={{ border: '1px solid var(--border-1)', background: 'var(--surface-2)', borderRadius: 10, padding: 10, marginBottom: 9 }}>
                  <div className="flex items-start" style={{ gap: 9 }}>
                    <button
                      onClick={() => patchTask(task, { status: nextTaskStatus(task.status) })}
                      title="Cycle status"
                      style={{ flexShrink: 0, marginTop: 1, width: 26, height: 26, borderRadius: 8, border: `1px solid ${rgba(meta.color, 0.4)}`, background: rgba(meta.color, 0.09), color: meta.color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Icon name={task.status === 'done' ? 'check' : 'arrowRight'} size={12} />
                    </button>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, lineHeight: 1.35, fontWeight: 850, color: 'var(--text-1)', wordBreak: 'break-word' }}>{task.title}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                        <TaskPill color={meta.color}>{meta.label}</TaskPill>
                        <TaskPill color={accent}>{task.role || 'Builder'}</TaskPill>
                        {task.files?.length ? <TaskPill color="#82aaff">{task.files.length} file claim{task.files.length === 1 ? '' : 's'}</TaskPill> : null}
                        {task.gate ? <TaskPill color="#c3e88d">gate</TaskPill> : null}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteTask(task)}
                      title="Delete task"
                      style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>

                  {task.files?.length ? (
                    <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'monospace', lineHeight: 1.5, wordBreak: 'break-word' }}>
                      {task.files.join(', ')}
                    </div>
                  ) : null}

                  {task.gate ? (
                    <button
                      onClick={() => runGate(task)}
                      style={{ marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', borderRadius: 8, border: `1px solid ${rgba(accent, 0.28)}`, background: rgba(accent, 0.07), color: accent, cursor: 'pointer', fontSize: 11, fontWeight: 800, textAlign: 'left' }}
                    >
                      <Icon name="rocket" size={12} />
                      <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{task.gate}</span>
                    </button>
                  ) : null}

                  {task.evidence?.length ? (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {task.evidence.slice(-3).map((line, i) => (
                        <div key={`${task.id}-e-${i}`} style={{ fontSize: 10.5, color: 'var(--text-3)', lineHeight: 1.45, padding: '4px 6px', borderRadius: 6, background: 'var(--surface-0)', border: '1px solid var(--border-1)' }}>{line}</div>
                      ))}
                    </div>
                  ) : null}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 58px', gap: 6, marginTop: 8 }}>
                    <input
                      value={evidenceDraft}
                      onChange={e => setEvidenceDrafts(d => ({ ...d, [task.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addEvidence(task) }}
                      placeholder="Add evidence..."
                      spellCheck={false}
                      style={{ minWidth: 0, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border-1)', background: 'var(--surface-0)', color: 'var(--text-2)', fontSize: 11, outline: 'none' }}
                    />
                    <button
                      onClick={() => addEvidence(task)}
                      disabled={!evidenceDraft.trim()}
                      style={{ borderRadius: 7, border: '1px solid var(--border-1)', background: evidenceDraft.trim() ? rgba(accent, 0.1) : 'var(--surface-1)', color: evidenceDraft.trim() ? accent : 'var(--text-5)', fontSize: 10.5, fontWeight: 850, cursor: evidenceDraft.trim() ? 'pointer' : 'default' }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

export default TasksTab
