import React from 'react'
import { rgba } from './ui'

// Hand-rolled markdown -> React (no dependency): headings, lists, tables, code
// blocks, quotes, hr, inline code/bold/italic/strike/links/bare-URLs. Extracted
// from RightPanel's Preview tab so the Claude Code panel renders with it too.

const BARE_URL = /^(https?:\/\/[^\s<>"'`]+)/

export function parseInline(text, accent) {
  const parts = []
  let rest = String(text)
  let k = 0
  while (rest.length) {
    let m
    if ((m = rest.match(/^`([^`]+)`/))) {
      parts.push(<code key={k++} style={{ background: '#1b2127', color: '#c3e88d', padding: '1px 5px', borderRadius: 4, fontSize: '0.88em' }}>{m[1]}</code>)
      rest = rest.slice(m[0].length); continue
    }
    if ((m = rest.match(/^\*\*([^*]+)\*\*/))) {
      parts.push(<strong key={k++} style={{ color: '#f1f4f6', fontWeight: 800 }}>{m[1]}</strong>)
      rest = rest.slice(m[0].length); continue
    }
    if ((m = rest.match(/^\*([^*]+)\*/))) {
      parts.push(<em key={k++} style={{ fontStyle: 'italic', color: '#d4dbe1' }}>{m[1]}</em>)
      rest = rest.slice(m[0].length); continue
    }
    if ((m = rest.match(/^~~([^~]+)~~/))) {
      parts.push(<span key={k++} style={{ textDecoration: 'line-through', color: '#5a646d' }}>{m[1]}</span>)
      rest = rest.slice(m[0].length); continue
    }
    if ((m = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/))) {
      const url = m[2]
      parts.push(<a key={k++} href="#" onClick={e => { e.preventDefault(); window.sush?.openExternal?.({ url }) }} style={{ color: accent, textDecoration: 'underline', cursor: 'pointer' }}>{m[1]}</a>)
      rest = rest.slice(m[0].length); continue
    }
    // Bare URL autolink: agent output is full of raw https:// links. Trailing
    // sentence punctuation (".", ",", ")") is left out of the link target so a
    // URL at the end of a sentence doesn't swallow the period.
    if ((m = rest.match(BARE_URL))) {
      let url = m[1]
      const trail = url.match(/[.,;:!?)\]}'"]+$/)
      if (trail) url = url.slice(0, url.length - trail[0].length)
      if (url) {
        parts.push(<a key={k++} href="#" onClick={e => { e.preventDefault(); window.sush?.openExternal?.({ url }) }} style={{ color: accent, textDecoration: 'underline', cursor: 'pointer', wordBreak: 'break-all' }}>{url}</a>)
        rest = rest.slice(url.length); continue
      }
    }
    parts.push(rest[0])
    rest = rest.slice(1)
  }
  return parts
}

// Split a markdown table row into trimmed cells, dropping the leading/trailing
// pipe that GFM tables usually carry (`| a | b |` -> ['a', 'b']).
function splitTableRow(line) {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map(c => c.trim())
}

// A GFM divider row: every cell is dashes with optional alignment colons
// (`---`, `:--`, `:-:`, `--:`). Requires at least one dash so an ordinary
// pipe-bearing line isn't mistaken for a table.
function isTableDivider(line) {
  if (!line || !line.includes('-')) return false
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c))
}

function alignOf(cell) {
  const l = cell.startsWith(':')
  const r = cell.endsWith(':')
  return l && r ? 'center' : r ? 'right' : 'left'
}

export function renderMarkdown(content, accent) {
  const lines = String(content ?? '').split('\n')
  const out = []
  let i = 0
  let listItems = []
  let listType = null
  let listStart = 1

  const flushList = () => {
    if (!listItems.length) return
    const style = { paddingLeft: 20, margin: '5px 0', color: '#c5cdd5', fontSize: 12.5 }
    if (listType === 'ol') {
      // Honour the list's actual starting number ("3." starts at 3, not 1).
      out.push(<ol key={`list-${i}`} start={listStart} style={style}>{listItems}</ol>)
    } else {
      out.push(<ul key={`list-${i}`} style={style}>{listItems}</ul>)
    }
    listItems = []; listType = null; listStart = 1
  }

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('```')) {
      flushList()
      const code = []; i++
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++ }
      out.push(<pre key={`pre${i}`} style={{ background: '#0a0c0f', border: '1px solid #1b2127', borderRadius: 8, padding: '10px 12px', margin: '8px 0', fontSize: 11.5, overflowX: 'auto', color: '#c3e88d', fontFamily: 'monospace', lineHeight: 1.6 }}><code>{code.join('\n')}</code></pre>)
      i++; continue
    }

    // GFM table: a pipe-bearing header line immediately followed by a divider
    // row. Without this, agent output (Claude/Codex love tables) rendered as
    // raw "| a | b |" pipe soup.
    if (line.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      flushList()
      const headers = splitTableRow(line)
      const aligns = splitTableRow(lines[i + 1]).map(alignOf)
      i += 2
      const rows = []
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitTableRow(lines[i])); i++
      }
      const cellStyle = (col) => ({ textAlign: aligns[col] || 'left', padding: '5px 9px', borderBottom: '1px solid #1b2127', verticalAlign: 'top' })
      out.push(
        <div key={`tbl${i}`} style={{ overflowX: 'auto', margin: '8px 0' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', color: '#c5cdd5' }}>
            <thead>
              <tr>
                {headers.map((h, c) => (
                  <th key={c} style={{ ...cellStyle(c), color: accent, fontWeight: 700, borderBottom: `1px solid ${rgba(accent, 0.4)}`, whiteSpace: 'nowrap' }}>{parseInline(h, accent)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((cells, r) => (
                <tr key={r}>
                  {headers.map((_, c) => (
                    <td key={c} style={cellStyle(c)}>{parseInline(cells[c] ?? '', accent)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    const hM = line.match(/^(#{1,6})\s+(.+)/)
    if (hM) {
      flushList()
      const lvl = hM[1].length
      const sz = [20, 17, 15, 13.5, 12.5, 12][lvl - 1]
      out.push(<div key={`h${i}`} style={{ fontSize: sz, fontWeight: 800, color: lvl === 1 ? accent : '#f1f4f6', marginTop: lvl < 3 ? 14 : 10, marginBottom: 4, lineHeight: 1.3 }}>{parseInline(hM[2], accent)}</div>)
      i++; continue
    }

    if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
      flushList()
      out.push(<hr key={`hr${i}`} style={{ border: 'none', borderTop: '1px solid #1b2127', margin: '10px 0' }} />)
      i++; continue
    }

    if (line.startsWith('> ')) {
      flushList()
      out.push(<div key={`bq${i}`} style={{ borderLeft: `3px solid ${rgba(accent, 0.5)}`, paddingLeft: 10, margin: '4px 0', color: '#8a939c', fontSize: 12.5, fontStyle: 'italic' }}>{parseInline(line.slice(2), accent)}</div>)
      i++; continue
    }

    const ulM = line.match(/^[-*]\s+(.+)/)
    if (ulM) {
      if (listType !== 'ul') flushList(); listType = 'ul'
      // GFM task list: "- [ ] todo" / "- [x] done". Render an inline checkbox
      // (read-only — this is a renderer, not an editor) and strike the label
      // when checked, instead of showing a literal "[ ]".
      const task = ulM[1].match(/^\[([ xX])\]\s+(.*)$/)
      if (task) {
        const done = task[1].toLowerCase() === 'x'
        listItems.push(
          <li key={`li${i}`} style={{ marginBottom: 2, listStyle: 'none', marginLeft: -16 }}>
            <span style={{ color: done ? accent : '#5a646d', marginRight: 6 }}>{done ? '☑' : '☐'}</span>
            <span style={done ? { textDecoration: 'line-through', color: '#6b757e' } : undefined}>{parseInline(task[2], accent)}</span>
          </li>
        )
      } else {
        listItems.push(<li key={`li${i}`} style={{ marginBottom: 2 }}>{parseInline(ulM[1], accent)}</li>)
      }
      i++; continue
    }

    const olM = line.match(/^(\d+)\.\s+(.+)/)
    if (olM) {
      if (listType !== 'ol') { flushList(); listStart = parseInt(olM[1], 10) || 1 }
      listType = 'ol'
      listItems.push(<li key={`li${i}`} style={{ marginBottom: 2 }}>{parseInline(olM[2], accent)}</li>)
      i++; continue
    }

    if (!line.trim()) { flushList(); out.push(<div key={`sp${i}`} style={{ height: 7 }} />); i++; continue }

    flushList()
    out.push(<p key={`p${i}`} style={{ margin: '3px 0', fontSize: 12.5, lineHeight: 1.75, color: '#c5cdd5' }}>{parseInline(line, accent)}</p>)
    i++
  }
  flushList()
  return out
}
