import React, { useState } from 'react'
import { allThemes } from '../themes'

const WINDOWS_SHELL_OPTIONS = [
  { id: 'powershell', label: 'Windows PowerShell' },
  { id: 'pwsh', label: 'PowerShell 7' },
  { id: 'cmd', label: 'Command Prompt' }
]

const WINDOWS_DEFAULT_PROFILES = [
  { id: 'powershell', label: 'PowerShell', shell: 'powershell', themeId: 'pink', icon: '>', profileVersion: 2 },
  { id: 'cmd', label: 'Command Prompt', shell: 'cmd', themeId: 'dark', icon: '>', profileVersion: 2 }
]

export function shellOptionsForPlatform(platform) {
  if (platform === 'darwin') {
    return [
      { id: 'zsh', label: 'Z shell (zsh)' },
      { id: 'bash', label: 'Bash' }
    ]
  }
  if (platform === 'linux') {
    return [
      { id: 'bash', label: 'Bash' },
      { id: 'zsh', label: 'Z shell (zsh)' },
      { id: 'sh', label: 'POSIX shell (sh)' }
    ]
  }
  return WINDOWS_SHELL_OPTIONS
}

export function defaultProfilesForPlatform(platform) {
  if (platform === 'darwin') {
    return [
      { id: 'zsh', label: 'zsh', shell: 'zsh', themeId: 'pink', icon: '>', profileVersion: 2 },
      { id: 'bash', label: 'Bash', shell: 'bash', themeId: 'dark', icon: '>', profileVersion: 2 }
    ]
  }
  if (platform === 'linux') {
    return [
      { id: 'bash', label: 'Bash', shell: 'bash', themeId: 'pink', icon: '>', profileVersion: 2 },
      { id: 'sh', label: 'POSIX shell', shell: 'sh', themeId: 'dark', icon: '>', profileVersion: 2 }
    ]
  }
  return WINDOWS_DEFAULT_PROFILES
}

function hostPlatform() {
  return typeof window !== 'undefined' ? (window.sush?.platform || 'win32') : 'win32'
}

function normalizeProfile(profile, platform) {
  const fallbackShell = defaultProfilesForPlatform(platform)[0].shell
  const legacyShell = profile.prompt === 'cmd' ? 'cmd' : profile.prompt === 'pwsh' ? 'pwsh' : null
  const shell = profile.shell || legacyShell || fallbackShell
  const shellOptions = shellOptionsForPlatform(platform)
  const migratedLabel = !profile.shell && profile.label === 'sh'
    ? (shellOptions.find(item => item.id === shell)?.label || shell)
    : profile.label
  return {
    ...profile,
    shell,
    label: migratedLabel || shellOptions.find(item => item.id === shell)?.label || 'Shell',
    themeId: profile.themeId || 'pink',
    icon: profile.icon || '>',
    profileVersion: 2
  }
}

export function normalizeProfilesForPlatform(value, platform) {
  if (!Array.isArray(value) || !value.length) return defaultProfilesForPlatform(platform)
  return value.map(profile => normalizeProfile(profile, platform))
}

export function useProfiles() {
  const platform = hostPlatform()
  const [profiles, setProfiles] = useState(() => {
    try {
      const saved = localStorage.getItem('sush-profiles')
      return saved ? normalizeProfilesForPlatform(JSON.parse(saved), platform) : defaultProfilesForPlatform(platform)
    } catch {
      return defaultProfilesForPlatform(platform)
    }
  })

  const save = (next) => {
    const normalized = normalizeProfilesForPlatform(next, platform)
    setProfiles(normalized)
    localStorage.setItem('sush-profiles', JSON.stringify(normalized))
  }

  const addProfile = (p) => save([...profiles, { id: Date.now().toString(), ...p }])
  const updateProfile = (id, patch) => save(profiles.map(p => p.id === id ? { ...p, ...patch } : p))
  const deleteProfile = (id) => { if (profiles.length > 1) save(profiles.filter(p => p.id !== id)) }

  return { profiles, addProfile, updateProfile, deleteProfile }
}

export default function ProfileManager({ profiles, onAdd, onUpdate, onDelete, onClose, accent }) {
  const platform = hostPlatform()
  const shellOptions = shellOptionsForPlatform(platform)
  const defaultShell = shellOptions[0].id
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ label: '', shell: defaultShell, themeId: 'pink', icon: '>', profileVersion: 2 })

  const startNew = () => {
    setEditing('new')
    setForm({ label: '', shell: defaultShell, themeId: 'pink', icon: '>', profileVersion: 2 })
  }

  const startEdit = (p) => {
    setEditing(p.id)
    setForm({
      label: p.label,
      shell: p.shell || defaultShell,
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

  const shellLabel = (shell) => shellOptions.find(item => item.id === shell)?.label || shell || 'Shell'
  const formShellOptions = shellOptions.some(item => item.id === form.shell)
    ? shellOptions
    : [...shellOptions, { id: form.shell, label: `Saved shell (${form.shell})` }]

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
                {formShellOptions.map(shell => <option key={shell.id} value={shell.id}>{shell.label}</option>)}
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
