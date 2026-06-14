import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

const TEMPLATE = `# ~/.sushrc — your Sush profile (applies to every shell)
# Top-level settings
prompt = pink
# cwd = ~/Coderoom

[alias]
gs = git status
gp = git pull
dev = npm run dev

[env]
EDITOR = code

[startup]
# commands that run automatically when a new session boots
# doctor
`

// Editor for ~/.sushrc — Sush's shell-agnostic declarative profile. Changes apply
// to sessions opened after saving.
export default function SushrcEditor({ accent, onClose }) {
  const [content, setContent] = useState('')
  const [path, setPath] = useState('')
  const [status, setStatus] = useState(null)   // 'saved' | 'error'
  const [loading, setLoading] = useState(true)
  const taRef = useRef(null)

  useEffect(() => {
    let alive = true
    window.sush?.sushrcRead?.()
      .then(res => {
        if (!alive) return
        setContent(res?.content ?? TEMPLATE)
        setPath(res?.path ?? '')
        setLoading(false)
      })
      .catch(() => { if (alive) { setContent(TEMPLATE); setLoading(false) } })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const save = async () => {
    try {
      const res = await window.sush.sushrcWrite({ content })
      setStatus(res?.ok ? 'saved' : 'error')
      setTimeout(() => setStatus(null), 2200)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus(null), 2200)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 520, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', paddingTop: '8vh' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="sush-fade-up"
        style={{ width: '100%', maxWidth: 640, background: '#0d1015', border: `1px solid ${rgba(accent, 0.32)}`, borderRadius: 'var(--r-xl)', boxShadow: '0 24px 64px rgba(0,0,0,0.7)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '82vh' }}
      >
        <div className="flex items-center justify-between" style={{ padding: '14px 18px', borderBottom: `1px solid ${rgba(accent, 0.12)}` }}>
          <div className="flex items-center" style={{ gap: 10, minWidth: 0 }}>
            <Icon name="fileText" size={17} color={accent} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 900, color: 'var(--text-1)' }}>.sushrc Profile</div>
              <div title={path} style={{ fontSize: 10.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420, fontFamily: 'monospace' }}>{path}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 'var(--r-sm)', border: '1px solid #20272e', background: '#11151a', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <textarea
          ref={taRef}
          value={loading ? 'Loading…' : content}
          onChange={e => setContent(e.target.value)}
          spellCheck={false}
          disabled={loading}
          style={{
            flex: 1, minHeight: 320, resize: 'none', background: '#07090b', color: 'var(--text-2)',
            border: 'none', outline: 'none', padding: '14px 18px', fontSize: 12.5, lineHeight: 1.6,
            fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace"
          }}
        />

        <div className="flex items-center justify-between" style={{ padding: '12px 18px', borderTop: `1px solid ${rgba(accent, 0.1)}`, gap: 10 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <button
              onClick={() => setContent(TEMPLATE)}
              className="sush-btn"
              style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', background: '#11151a', border: '1px solid #20272e', borderRadius: 'var(--r-sm)', padding: '7px 12px', cursor: 'pointer' }}
            >
              Reset to template
            </button>
            {status === 'saved' && <span style={{ fontSize: 11.5, color: '#7ee787', display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="check" size={12} color="#7ee787" strokeWidth={2.6} /> Saved — applies to new sessions</span>}
            {status === 'error' && <span style={{ fontSize: 11.5, color: '#ff5370' }}>Could not save</span>}
          </div>
          <button
            onClick={save}
            className="sush-btn"
            style={{ fontSize: 12, fontWeight: 800, color: '#0a0a0a', background: accent, border: 'none', borderRadius: 'var(--r-btn)', padding: '8px 16px', cursor: 'pointer', boxShadow: `0 4px 14px ${rgba(accent, 0.3)}` }}
          >
            Save (Ctrl+S)
          </button>
        </div>
      </div>
    </div>
  )
}
