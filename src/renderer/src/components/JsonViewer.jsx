import React, { useState } from 'react'

function JsonNode({ value, depth, accent }) {
  const [open, setOpen] = useState(depth < 2)

  if (value === null) return <span style={{ color: '#ff5370' }}>null</span>
  if (value === undefined) return <span style={{ color: '#ff5370' }}>undefined</span>
  if (typeof value === 'boolean') return <span style={{ color: '#82aaff' }}>{String(value)}</span>
  if (typeof value === 'number') return <span style={{ color: '#ffcb6b' }}>{value}</span>
  if (typeof value === 'string') {
    const display = value.length > 120 ? value.slice(0, 120) + '...' : value
    return <span style={{ color: '#c3e88d' }}>"{display}"</span>
  }

  if (Array.isArray(value)) {
    if (!value.length) return <span style={{ color: 'var(--text-3)' }}>[]</span>
    return (
      <>
        <span
          onClick={() => setOpen(o => !o)}
          style={{ cursor: 'pointer', color: 'var(--text-3)', userSelect: 'none' }}
        >
          {open ? '[' : `[ ... ${value.length} item${value.length !== 1 ? 's' : ''} ]`}
        </span>
        {open && (
          <>
            {value.slice(0, 200).map((item, i) => (
              <div key={i} style={{ paddingLeft: 16 }}>
                <span style={{ color: 'var(--text-5)', fontSize: 10 }}>{i} </span>
                <JsonNode value={item} depth={depth + 1} accent={accent} />
                {i < value.length - 1 && <span style={{ color: 'var(--text-5)' }}>,</span>}
              </div>
            ))}
            {value.length > 200 && (
              <div style={{ paddingLeft: 16, color: 'var(--text-5)', fontSize: 10.5 }}>... {value.length - 200} more items</div>
            )}
            <span style={{ color: 'var(--text-3)' }}>]</span>
          </>
        )}
      </>
    )
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (!keys.length) return <span style={{ color: 'var(--text-3)' }}>{'{}'}</span>
    return (
      <>
        <span
          onClick={() => setOpen(o => !o)}
          style={{ cursor: 'pointer', color: 'var(--text-3)', userSelect: 'none' }}
        >
          {open ? '{' : `{ ... ${keys.length} key${keys.length !== 1 ? 's' : ''} }`}
        </span>
        {open && (
          <>
            {keys.map((key, i) => (
              <div key={key} style={{ paddingLeft: 16 }}>
                <span style={{ color: accent }}>"{key}"</span>
                <span style={{ color: 'var(--text-3)' }}>: </span>
                <JsonNode value={value[key]} depth={depth + 1} accent={accent} />
                {i < keys.length - 1 && <span style={{ color: 'var(--text-5)' }}>,</span>}
              </div>
            ))}
            <span style={{ color: 'var(--text-3)' }}>{'}'}</span>
          </>
        )}
      </>
    )
  }

  return <span style={{ color: 'var(--text-2)' }}>{String(value)}</span>
}

export default function JsonViewer({ content, accent }) {
  let parsed
  try { parsed = JSON.parse(content.trim()) } catch { return null }

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7, color: 'var(--text-2)', padding: 12 }}>
      <JsonNode value={parsed} depth={0} accent={accent} />
    </div>
  )
}
