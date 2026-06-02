import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba, accentVars } from '../lib/ui'

export default function SmartCommandBar({ activeTab, accent, onRun, onSeducia, onTogglePanel, rightOpen, busy }) {
  const [value, setValue] = useState('')
  const [history, setHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const inputRef = useRef(null)

  useEffect(() => {
    const handler = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    const input = value.trim()
    if (!input || busy) return
    setHistory(prev => [input, ...prev.filter(item => item !== input)].slice(0, 25))
    setHistoryIndex(-1)
    setValue('')
    await onRun(input)
  }

  const handleChange = (event) => {
    setValue(event.target.value)
    setHistoryIndex(-1)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const next = Math.min(historyIndex + 1, history.length - 1)
      if (next >= 0) {
        setHistoryIndex(next)
        setValue(history[next])
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      const next = Math.max(historyIndex - 1, -1)
      setHistoryIndex(next)
      setValue(next >= 0 ? history[next] : '')
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-center shrink-0"
      style={{
        ...accentVars(accent),
        gap: 12,
        height: 56,
        padding: '0 16px',
        background: '#0c0e11',
        borderBottom: `1px solid ${rgba(accent, 0.16)}`
      }}
    >
      <button
        type="button"
        title="Home dashboard"
        onClick={() => onRun('home')}
        className="sush-icon-btn flex items-center justify-center"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          border: `1px solid ${rgba(accent, 0.4)}`,
          background: rgba(accent, 0.1),
          color: accent,
          cursor: 'pointer',
          flexShrink: 0
        }}
      >
        <Icon name="home" size={17} strokeWidth={2.2} />
      </button>

      <div className="sush-omni flex items-center" style={{ flex: 1, minWidth: 0, gap: 10 }}>
        <Icon name="command" size={15} color={busy ? accent : '#5a646d'} className={busy ? 'sush-spin' : undefined} />
        <input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Smart command — try serve, ports, doctor, work <path>"
          spellCheck={false}
          style={{
            flex: 1,
            minWidth: 0,
            height: '100%',
            background: 'transparent',
            border: 'none',
            color: '#f1f4f6',
            outline: 'none',
            fontSize: 13.5
          }}
        />
        {!value && (
          <span
            className="flex items-center"
            style={{ gap: 4, color: '#5a646d', fontSize: 10.5, fontWeight: 700, flexShrink: 0, userSelect: 'none' }}
          >
            <kbd style={kbdStyle}>Ctrl</kbd>
            <kbd style={kbdStyle}>L</kbd>
          </span>
        )}
      </div>

      <button
        type="button"
        title="Summon Seducia (Ctrl+K)"
        onClick={() => onSeducia?.()}
        className="sush-btn flex items-center"
        style={{
          gap: 7,
          height: 36,
          padding: '0 13px',
          borderRadius: 10,
          border: `1px solid ${rgba(accent, 0.45)}`,
          background: `linear-gradient(135deg, ${rgba(accent, 0.22)}, ${rgba(accent, 0.06)})`,
          color: accent,
          fontWeight: 800,
          fontSize: 12,
          cursor: 'pointer',
          flexShrink: 0
        }}
      >
        <Icon name="sparkles" size={15} strokeWidth={2} />
        Seducia
      </button>

      <span
        title={activeTab?.cwd || activeTab?.profileLabel || ''}
        className="flex items-center"
        style={{
          gap: 6,
          maxWidth: 200,
          color: '#9aa3ab',
          fontSize: 11.5,
          background: '#11151a',
          border: '1px solid #20272e',
          borderRadius: 999,
          padding: '5px 11px',
          flexShrink: 0
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0, boxShadow: `0 0 6px ${accent}` }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTab?.label || 'Shell'}</span>
      </span>

      <button
        type="submit"
        disabled={busy}
        className="sush-btn flex items-center"
        style={{
          gap: 7,
          height: 38,
          padding: '0 16px',
          border: 'none',
          borderRadius: 10,
          background: busy ? '#1c2126' : accent,
          color: busy ? '#7a838b' : '#0a0a0a',
          fontSize: 12.5,
          fontWeight: 800,
          cursor: busy ? 'default' : 'pointer',
          boxShadow: busy ? 'none' : `0 6px 18px ${rgba(accent, 0.32)}`,
          flexShrink: 0
        }}
      >
        {busy ? 'Running' : 'Run'}
        {!busy && <Icon name="enter" size={14} strokeWidth={2.2} color="#0a0a0a" />}
      </button>

      <button
        type="button"
        title={rightOpen ? 'Hide panel (Ctrl+B)' : 'Show panel (Ctrl+B)'}
        onClick={() => onTogglePanel?.()}
        className="sush-icon-btn flex items-center justify-center"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          border: `1px solid ${rightOpen ? rgba(accent, 0.5) : '#20272e'}`,
          background: rightOpen ? rgba(accent, 0.12) : '#11151a',
          color: rightOpen ? accent : '#9aa3ab',
          cursor: 'pointer',
          flexShrink: 0
        }}
      >
        <Icon name="panel" size={16} />
      </button>
    </form>
  )
}

const kbdStyle = {
  background: '#171c22',
  border: '1px solid #262d35',
  borderRadius: 5,
  padding: '1px 5px',
  fontSize: 10,
  fontFamily: 'inherit',
  lineHeight: 1.4
}
