import React from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'

const SECTIONS = [
  {
    title: 'Navigation',
    rows: [
      { keys: ['Ctrl', 'K'], label: 'Open Seducia AI' },
      { keys: ['Ctrl', 'B'], label: 'Toggle right panel' },
      { keys: ['Ctrl', 'P'], label: 'Command palette' },
      { keys: ['Ctrl', 'L'], label: 'Focus command bar' },
      { keys: ['Ctrl', ','], label: 'Open Settings' },
      { keys: ['Ctrl', 'Shift', 'Home'], label: 'Go to Home screen' },
      { keys: ['Ctrl', 'Shift', 'Z'], label: 'Toggle focus mode' },
      { keys: ['Ctrl', '?'], label: 'This help screen' },
    ]
  },
  {
    title: 'Terminal',
    rows: [
      { keys: ['Ctrl', 'F'], label: 'Search in terminal' },
      { keys: ['Ctrl', '+'], label: 'Increase font size' },
      { keys: ['Ctrl', '−'], label: 'Decrease font size' },
      { keys: ['Ctrl', '0'], label: 'Reset font size' },
      { keys: ['Ctrl', 'Shift', 'C'], label: 'Copy selection' },
      { keys: ['Ctrl', 'Shift', 'V'], label: 'Paste' },
    ]
  },
  {
    title: 'Sessions',
    rows: [
      { keys: ['Ctrl', 'T'], label: 'New terminal tab' },
      { keys: ['Ctrl', 'W'], label: 'Close current tab' },
      { keys: ['Ctrl', 'Shift', 'T'], label: 'Reopen last closed session' },
      { keys: ['Ctrl', 'Shift', 'N'], label: 'New session launcher' },
      { keys: ['Ctrl', '1-9'], label: 'Jump to session 1–9 (9 = last)' },
      { keys: ['Ctrl', 'PgDn / PgUp'], label: 'Next / previous session' },
      { keys: ['Ctrl', 'Tab'], label: 'Quick switch (hold Ctrl, tap Tab)' },
      { keys: ['Ctrl', 'Shift', 'Tab'], label: 'Quick switch backwards' },
      { keys: ['Ctrl', 'Shift', 'D'], label: 'Duplicate active session' },
      { keys: ['Ctrl', 'Shift', 'G'], label: 'Toggle grid layout' },
      { keys: ['Ctrl', 'Shift', 'B'], label: 'Toggle broadcast mode' },
      { keys: ['Ctrl', 'Shift', 'M'], label: 'Mission Control' },
      { keys: ['Ctrl', 'Shift', 'F'], label: 'Hunt — search all session output' },
      { keys: ['Ctrl', 'Shift', 'S'], label: 'Hush voice dictation' },
      { keys: ['Ctrl', 'Shift', 'E'], label: 'Toggle power saver' },
      { keys: ['F2'], label: 'Rename active session' },
      { keys: ['Double-click'], label: 'Rename session in rail' },
    ]
  },
  {
    title: 'Built-in Commands',
    rows: [
      { keys: ['help'], label: 'List all commands', isCmd: true },
      { keys: ['scripts'], label: 'Show npm scripts', isCmd: true },
      { keys: ['todo add <task>'], label: 'Add a project todo', isCmd: true },
      { keys: ['snippet set <n> <cmd>'], label: 'Save a snippet', isCmd: true },
      { keys: ['alias x=cmd'], label: 'Create session alias', isCmd: true },
      { keys: ['ask <question>'], label: 'Ask Seducia from terminal', isCmd: true },
      { keys: ['zen'], label: 'Toggle zen mode', isCmd: true },
      { keys: ['calc <expr>'], label: 'Quick calculation', isCmd: true },
      { keys: ['find <pattern>'], label: 'Find files by pattern', isCmd: true },
      { keys: ['grep <pat> <file>'], label: 'Search file contents', isCmd: true },
      { keys: ['note <text>'], label: 'Add a quick memory note', isCmd: true },
      { keys: ['diff <f1> <f2>'], label: 'Compare two files', isCmd: true },
      { keys: ['b64 encode <text>'], label: 'Base64 encode', isCmd: true },
      { keys: ['hash <text|file>'], label: 'SHA-256 hash', isCmd: true },
      { keys: ['weather [city]'], label: 'Current weather', isCmd: true },
      { keys: ['ping <host>'], label: 'Ping a host', isCmd: true },
      { keys: ['timer <secs>'], label: 'Start a countdown', isCmd: true },
      { keys: ['duplicate'], label: 'Duplicate current session', isCmd: true },
      { keys: ['handoff'], label: 'Hand off session context', isCmd: true },
      { keys: ['sushrc'], label: 'Edit your .sushrc profile', isCmd: true },
    ]
  }
]

export default function ShortcutsHelp({ accent, onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', overflowY: 'auto', padding: '32px 16px 48px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="sush-fade-up" style={{ width: '100%', maxWidth: 720, background: '#0d1015', border: `1px solid ${rgba(accent, 0.3)}`, borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.7)', overflow: 'hidden' }}>
        <div className="flex items-center justify-between" style={{ padding: '16px 20px', borderBottom: `1px solid ${rgba(accent, 0.12)}` }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <Icon name="command" size={18} color={accent} />
            <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-1)' }}>Keyboard Shortcuts</span>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #20272e', background: '#11151a', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 0 }}>
          {SECTIONS.map(section => (
            <div key={section.title} style={{ padding: '16px 20px', borderBottom: `1px solid ${rgba(accent, 0.07)}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: accent, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>{section.title}</div>
              <div className="flex flex-col" style={{ gap: 6 }}>
                {section.rows.map((row, i) => (
                  <div key={i} className="flex items-center justify-between" style={{ gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{row.label}</span>
                    <span className="flex items-center" style={{ gap: 3, flexShrink: 0 }}>
                      {row.isCmd ? (
                        <code style={{ fontSize: 10.5, color: rgba(accent, 0.85), background: rgba(accent, 0.1), border: `1px solid ${rgba(accent, 0.2)}`, borderRadius: 5, padding: '2px 7px', fontFamily: 'monospace' }}>
                          {row.keys[0]}
                        </code>
                      ) : row.keys.map((k, ki) => (
                        <React.Fragment key={k}>
                          {ki > 0 && <span style={{ color: 'var(--text-5)', fontSize: 10 }}>+</span>}
                          <kbd style={{ fontSize: 10.5, color: 'var(--text-2)', background: '#141a20', border: '1px solid #2a333c', borderRadius: 5, padding: '2px 7px', fontFamily: 'inherit', fontWeight: 700 }}>{k}</kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
