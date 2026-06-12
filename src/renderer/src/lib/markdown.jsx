import React from 'react'
import { rgba } from './ui'

// Hand-rolled markdown -> React (no dependency): headings, lists, code
// blocks, quotes, hr, inline code/bold/italic/strike/links. Extracted from
// RightPanel's Preview tab so the Claude Code panel renders with it too.

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
    parts.push(rest[0])
    rest = rest.slice(1)
  }
  return parts
}

export function renderMarkdown(content, accent) {
  const lines = String(content ?? '').split('\n')
  const out = []
  let i = 0
  let listItems = []
  let listType = null

  const flushList = () => {
    if (!listItems.length) return
    const Tag = listType === 'ul' ? 'ul' : 'ol'
    out.push(<Tag key={`list-${i}`} style={{ paddingLeft: 20, margin: '5px 0', color: '#c5cdd5', fontSize: 12.5 }}>{listItems}</Tag>)
    listItems = []; listType = null
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
      listItems.push(<li key={`li${i}`} style={{ marginBottom: 2 }}>{parseInline(ulM[1], accent)}</li>)
      i++; continue
    }

    const olM = line.match(/^\d+\.\s+(.+)/)
    if (olM) {
      if (listType !== 'ol') flushList(); listType = 'ol'
      listItems.push(<li key={`li${i}`} style={{ marginBottom: 2 }}>{parseInline(olM[1], accent)}</li>)
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
