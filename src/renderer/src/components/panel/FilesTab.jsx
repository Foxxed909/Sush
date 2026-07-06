import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icons'
import { PanelEmpty, TabHeader, joinPath, fileName } from './shared'

// ---------- Files ----------
function FilesTab({ accent, cwd, onOpenFile }) {
  const [filter, setFilter] = useState('')
  if (!cwd) return <PanelEmpty icon="file" accent={accent}>No directory</PanelEmpty>
  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <TabHeader accent={accent} icon="folder" title={fileName(cwd)} sub={cwd} />
      <div style={{ padding: '8px 10px 0' }}>
        <div className="sush-omni flex items-center" style={{ height: 30, gap: 7 }}>
          <Icon name="search" size={12} color="var(--text-4)" />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter files..."
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-1)', outline: 'none', fontSize: 11.5 }}
          />
          {filter && (
            <button onClick={() => setFilter('')} title="Clear" style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto sush-scroll" style={{ padding: 8 }}>
        <TreeLevel path={cwd} depth={0} accent={accent} onOpenFile={onOpenFile} filter={filter} />
      </div>
    </div>
  )
}

function TreeLevel({ path, depth, accent, onOpenFile, filter }) {
  const [entries, setEntries] = useState(null)
  useEffect(() => {
    let alive = true
    window.sush?.listDir?.({ path }).then(res => { if (alive) setEntries(res.entries || []) }).catch(() => { if (alive) setEntries([]) })
    return () => { alive = false }
  }, [path])

  if (entries === null) return <div style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 10 + depth * 14, color: 'var(--text-3)', fontSize: 11.5 }}>...</div>
  // The filter only narrows the top level so you can still drill into subfolders.
  const shown = (depth === 0 && filter)
    ? entries.filter(e => e.name.toLowerCase().includes(filter.toLowerCase()))
    : entries
  if (!shown.length) return <div style={{ paddingTop: 4, paddingBottom: 4, paddingLeft: 10 + depth * 14, color: 'var(--text-3)', fontSize: 11.5 }}>{(depth === 0 && filter) ? 'no matches' : 'empty'}</div>
  return shown.map(entry => (
    <TreeNode key={entry.name} parent={path} entry={entry} depth={depth} accent={accent} onOpenFile={onOpenFile} />
  ))
}

function TreeNode({ parent, entry, depth, accent, onOpenFile }) {
  const [open, setOpen] = useState(false)
  const full = joinPath(parent, entry.name)
  return (
    <>
      <button
        onClick={() => (entry.dir ? setOpen(o => !o) : onOpenFile(full))}
        title={entry.name}
        className="flex items-center sush-tree-row"
        style={{ gap: 6, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', color: entry.dir ? 'var(--text-2)' : 'var(--text-3)', padding: '4px 6px', paddingLeft: 8 + depth * 14, borderRadius: 6, cursor: 'pointer' }}
      >
        {entry.dir
          ? <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} color="var(--text-3)" strokeWidth={2.4} />
          : <span style={{ width: 12, flexShrink: 0 }} />}
        <Icon name={entry.dir ? 'folder' : 'file'} size={13} color={entry.dir ? accent : 'var(--text-3)'} strokeWidth={2} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{entry.name}</span>
      </button>
      {entry.dir && open && <TreeLevel path={full} depth={depth + 1} accent={accent} onOpenFile={onOpenFile} />}
    </>
  )
}

export default FilesTab
