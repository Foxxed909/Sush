import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import { rgba } from '../../lib/ui'
import { buildSshCommand, normalizeSshPort, normalizeSshProfiles } from '../../lib/ssh'
import { PanelEmpty, TabHeader } from './shared'

// ---------- SSH Quick-Connect ----------
const SSH_PROFILES_KEY = 'sush-ssh-profiles'
function loadSshProfiles() {
  try { return normalizeSshProfiles(JSON.parse(localStorage.getItem(SSH_PROFILES_KEY) ?? '[]')) } catch { return [] }
}

function SshTab({ accent, onNewTab, onRun, shellId = 'powershell' }) {
  const [profiles, setProfiles] = useState(loadSshProfiles)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ label: '', user: '', host: '', port: '22', keyPath: '' })
  const labelRef = useRef(null)

  useEffect(() => { if (creating) labelRef.current?.focus() }, [creating])

  const persist = (next) => {
    setProfiles(next)
    localStorage.setItem(SSH_PROFILES_KEY, JSON.stringify(next))
  }

  const save = () => {
    const { label, user, host } = form
    const port = normalizeSshPort(form.port)
    if (!host.trim() || !port) return
    const entry = {
      id: `ssh-${Date.now()}`,
      label: label.trim() || `${user ? user + '@' : ''}${host}`,
      user: user.trim(),
      host: host.trim(),
      port,
      keyPath: form.keyPath.trim()
    }
    persist([...profiles, entry])
    setCreating(false)
    setForm({ label: '', user: '', host: '', port: '22', keyPath: '' })
  }

  const del = (id) => persist(profiles.filter(p => p.id !== id))

  const connect = (p) => {
    const cmd = buildSshCommand(p, { platform: window.sush?.platform || 'win32', shellId })
    if (!cmd) return
    if (onNewTab) onNewTab({ command: cmd })
    else onRun?.(cmd)
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader
        accent={accent}
        icon="lock"
        title="SSH Profiles"
        sub={`${profiles.length} saved`}
        right={
          <button onClick={() => setCreating(true)} title="Add profile" className="sush-icon-btn flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${rgba(accent, 0.35)}`, background: rgba(accent, 0.1), color: accent, cursor: 'pointer' }}>
            <Icon name="plus" size={14} strokeWidth={2.4} />
          </button>
        }
      />

      {creating && (
        <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--border-1)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { key: 'label', ph: 'Label (optional)...' },
            { key: 'host', ph: 'Host / IP *' },
            { key: 'user', ph: 'Username (optional)' },
            { key: 'port', ph: 'Port (default 22)' },
            { key: 'keyPath', ph: 'Key path (~/.ssh/id_rsa)' }
          ].map(({ key, ph }, i) => (
            <input
              key={key}
              ref={i === 0 ? labelRef : undefined}
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setCreating(false) }}
              placeholder={ph}
              spellCheck={false}
              style={{ padding: '5px 8px', background: 'var(--surface-2)', border: `1px solid ${key === 'host' ? rgba(accent, 0.3) : 'var(--border-2)'}`, borderRadius: 7, color: 'var(--text-1)', fontSize: 11, outline: 'none', fontFamily: key === 'keyPath' || key === 'host' ? 'monospace' : 'inherit' }}
            />
          ))}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setCreating(false)} style={{ padding: '4px 11px', borderRadius: 6, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
            <button onClick={save} disabled={!form.host.trim() || !normalizeSshPort(form.port)} style={{ padding: '4px 11px', borderRadius: 6, border: `1px solid ${rgba(accent, 0.4)}`, background: rgba(accent, 0.12), color: accent, fontSize: 11, fontWeight: 700, cursor: form.host.trim() && normalizeSshPort(form.port) ? 'pointer' : 'default', opacity: form.host.trim() && normalizeSshPort(form.port) ? 1 : 0.5 }}>Save</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 10 }}>
        {!profiles.length ? (
          <PanelEmpty icon="lock" accent={accent} hint="Save SSH connection details for one-click access. Press + to add.">No SSH profiles</PanelEmpty>
        ) : profiles.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 6, border: '1px solid var(--border-1)', borderRadius: 9, background: 'var(--surface-2)' }}>
            <Icon name="lock" size={14} color={accent} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'monospace', marginTop: 1 }}>
                {p.user ? `${p.user}@` : ''}{p.host}{p.port !== '22' ? `:${p.port}` : ''}
              </div>
            </div>
            <button
              onClick={() => connect(p)}
              title="Connect"
              style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${rgba(accent, 0.35)}`, background: rgba(accent, 0.1), color: accent, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="enter" size={13} />
            </button>
            <button onClick={() => del(p.id)} title="Delete" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border-1)', background: 'transparent', color: 'var(--text-5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="trash" size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SshTab
