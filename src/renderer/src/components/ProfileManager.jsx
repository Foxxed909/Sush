import React, { useState } from 'react'
import { allThemes } from '../themes'

const SHELL_OPTIONS = [
  { id: 'powershell', label: 'Windows PowerShell' },
  { id: 'pwsh', label: 'PowerShell 7' },
  { id: 'cmd', label: 'Command Prompt' }
]

const DEFAULT_PROFILES = [
  { id: 'powershell', label: 'PowerShell', shell: 'powershell', themeId: 'pink', icon: '>', profileVersion: 2 },
  { id: 'cmd', label: 'Command Prompt', shell: 'cmd', themeId: 'dark', icon: '>', profileVersion: 2 }
]

function normalizeProfile(profile) {
  const shell = profile.shell || (profile.prompt === 'cmd' ? 'cmd' : profile.prompt === 'pwsh' ? 'pwsh' : 'powershell')
  const migratedLabel = !profile.shell && profile.label === 'sh' ? 'PowerShell' : profile.label
  return {
    ...profile,
    shell,
    label: migratedLabel || SHELL_OPTIONS.find(item => item.id === shell)?.label || 'Shell',
    themeId: profile.themeId || 'pink',
    icon: profile.icon || '>',
    profileVersion: 2
  }
}

function normalizeProfiles(value) {
  if (!Array.isArray(value) || !value.length) return DEFAULT_PROFILES
  return value.map(normalizeProfile)
}

export function useProfiles() {
  const [profiles, setProfiles] = useState(() => {
    try {
      const saved = localStorage.getItem('sush-profiles')
      return saved ? normalizeProfiles(JSON.parse(saved)) : DEFAULT_PROFILES
    } catch {
      return DEFAULT_PROFILES
    }
  })

  const save = (next) => {
    const normalized = normalizeProfiles(next)
    setProfiles(normalized)
    localStorage.setItem('sush-profiles', JSON.stringify(normalized))
  }

  const addProfile = (p) => save([...profiles, { id: Date.now().toString(), ...p }])
  const updateProfile = (id, patch) => save(profiles.map(p => p.id === id ? { ...p, ...patch } : p))
  const deleteProfile = (id) => { if (profiles.length > 1) save(profiles.filter(p => p.id !== id)) }

  return { profiles, addProfile, updateProfile, deleteProfile }
}

export default function ProfileManager({ profiles, onAdd, onUpdate, onDelete, onClose, accent }) {
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ label: '', shell: 'powershell', themeId: 'pink', icon: '>', profileVersion: 2 })

  const startNew = () => {
    setEditing('new')
    setForm({ label: '', shell: 'powershell', themeId: 'pink', icon: '>', profileVersion: 2 })
  }

  const startEdit = (p) => {
    setEditing(p.id)
    setForm({
      label: p.label,
      shell: p.shell || 'powershell',
      themeId: p.themeId,
      icon: p.icon || '>'
    })
  }

  const submit = () => {
    if (!form.label.trim()) return
    if (editing === 'new') onAdd(form)
    else onUpdate(editing, form)
    setEditing(null)
  }

  const input = (field) => ({
    value: form[field],
    onChange: (e) => setForm(f => ({ ...f, [field]: e.target.value })),
    style: { background: '#1a1a1a', border: `1px solid ${accent}44`, color: '#eee', borderRadius: 4, padding: '4px 8px', width: '100%', fontSize: 13 }
  })

  const shellLabel = (shell) => SHELL_OPTIONS.find(item => item.id === shell)?.label || shell || 'Shell'

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: '#0008' }}>
      <div style={{ background: '#161616', border: `1px solid ${accent}44`, borderRadius: 8, width: 480, maxHeight: '80vh', overflow: 'auto', padding: 20 }}>
        <div className="flex justify-between items-center mb-4">
          <span style={{ color: accent, fontWeight: 700, fontSize: 15 }}>Profiles</span>
          <button onClick={onClose} style={{ color: '#666', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>x</button>
        </div>

        {!editing ? (
          <>
            {profiles.map(p => (
              <div key={p.id} className="flex items-center justify-between mb-2 p-2 rounded" style={{ background: '#1f1f1f' }}>
                <span style={{ color: '#eee', fontSize: 13 }}>{p.icon} {p.label} <span style={{ color: '#666' }}>({shellLabel(p.shell)})</span></span>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(p)} style={{ color: accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>edit</button>
                  <button onClick={() => onDelete(p.id)} style={{ color: '#ff5370', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>delete</button>
                </div>
              </div>
            ))}
            <button onClick={startNew} style={{ background: accent, color: '#000', border: 'none', borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, marginTop: 8 }}>
              + New Profile
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <div><label style={{ color: '#888', fontSize: 12 }}>Label</label><input {...input('label')} placeholder="Work Shell" /></div>
            <div>
              <label style={{ color: '#888', fontSize: 12 }}>Shell</label>
              <select value={form.shell} onChange={e => setForm(f => ({ ...f, shell: e.target.value }))}
                style={{ background: '#1a1a1a', border: `1px solid ${accent}44`, color: '#eee', borderRadius: 4, padding: '4px 8px', width: '100%', fontSize: 13 }}>
                {SHELL_OPTIONS.map(shell => <option key={shell.id} value={shell.id}>{shell.label}</option>)}
              </select>
            </div>
            <div><label style={{ color: '#888', fontSize: 12 }}>Icon</label><input {...input('icon')} /></div>
            <div>
              <label style={{ color: '#888', fontSize: 12 }}>Theme</label>
              <select value={form.themeId} onChange={e => setForm(f => ({ ...f, themeId: e.target.value }))}
                style={{ background: '#1a1a1a', border: `1px solid ${accent}44`, color: '#eee', borderRadius: 4, padding: '4px 8px', width: '100%', fontSize: 13 }}>
                {Object.values(allThemes()).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={submit} style={{ background: accent, color: '#000', border: 'none', borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Save</button>
              <button onClick={() => setEditing(null)} style={{ background: '#2a2a2a', color: '#aaa', border: 'none', borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
