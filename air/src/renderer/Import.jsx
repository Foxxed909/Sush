import React, { useEffect, useMemo, useState } from 'react'

// ── Import from Sush ────────────────────────────────────────────────────────
//
// The flow, and why it is shaped this way:
//
// Everything found arrives TICKED, except the entries Air has a specific reason
// to distrust — a credential-looking env var, a startup command that could
// delete something, a start folder that no longer exists. Those arrive unticked
// with the reason written next to them.
//
// So the interaction is subtractive: you look at a list of things you already
// have, and you take away what you do not want in this app. That is a smaller
// decision than a list of empty boxes, which asks you to re-justify every
// preference you ever set. And "Use the defaults" is one click away for anyone
// who does not want to read the list at all.
//
// The refusals are shown, not just observed. A person deciding whether to let a
// second app read the first one's settings deserves to see the boundary at the
// moment they decide, not in a changelog.

const GROUPS = [
  { id: 'folder',  title: 'Start folder', blurb: 'Where a new session opens.' },
  { id: 'alias',   title: 'Aliases',      blurb: 'Written into each session as real shell aliases — `type gs` will confirm it.' },
  { id: 'env',     title: 'Environment',  blurb: 'Set for every session Air starts.' },
  { id: 'startup', title: 'On open',      blurb: 'Run automatically when a session starts.' }
]

export default function Import({ onClose, onDone, say }) {
  const [scan, setScan] = useState(null)
  const [keep, setKeep] = useState(() => new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    window.air.importScan().then(result => {
      if (!live) return
      setScan(result)
      setKeep(new Set(result.items.filter(i => i.recommended).map(i => i.id)))
    })
    return () => { live = false }
  }, [])

  const grouped = useMemo(() => {
    if (!scan) return []
    return GROUPS
      .map(g => ({ ...g, items: scan.items.filter(i => i.group === g.id) }))
      .filter(g => g.items.length)
  }, [scan])

  const toggle = (id) => setKeep(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const useDefaults = () => setKeep(new Set(scan.items.filter(i => i.recommended).map(i => i.id)))

  const apply = async () => {
    setBusy(true)
    const profile = await window.air.importApply([...keep])
    const counts = [
      profile.cwd ? 'a start folder' : null,
      profile.aliases.length ? `${profile.aliases.length} alias${profile.aliases.length === 1 ? '' : 'es'}` : null,
      profile.env.length ? `${profile.env.length} env var${profile.env.length === 1 ? '' : 's'}` : null,
      profile.startup.length ? `${profile.startup.length} startup command${profile.startup.length === 1 ? '' : 's'}` : null
    ].filter(Boolean)
    setBusy(false)
    onDone?.(profile)
    say?.(counts.length
      ? `Imported ${counts.join(', ')}. New sessions will have them.`
      : 'Nothing imported. Air is unchanged.')
    onClose()
  }

  return (
    <div className="air-sheet" onMouseDown={onClose}>
      <div className="air-sheet-body air-import" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Import from Sush</h2>

        {!scan && <p className="air-import-blurb">Looking…</p>}

        {scan && !scan.found && (
          <>
            <p className="air-import-blurb">
              No Sush profile on this machine{scan.sushInstalled ? ' yet' : ''}.
              {scan.sushInstalled
                ? ' Sush is installed but has not written a ~/.sushrc — set something in it and come back.'
                : ' Air does not need one; this is only here to save you re-typing.'}
            </p>
            <p className="air-import-path">Looked for {scan.source}</p>
            <div className="air-import-actions">
              <button onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {scan?.found && !scan.items.length && (
          <>
            <p className="air-import-blurb">Found your Sush profile, but there is nothing in it Air can use.</p>
            <p className="air-import-path">{scan.source}</p>
            <div className="air-import-actions">
              <button onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {scan?.found && scan.items.length > 0 && (
          <>
            <p className="air-import-blurb">
              Everything here is on. Turn off what you do not want in Air — or take the defaults.
            </p>

            <div className="air-import-groups">
              {grouped.map(group => (
                <section key={group.id} className="air-import-group">
                  <h3>{group.title}<span>{group.blurb}</span></h3>
                  {group.items.map(item => {
                    const on = keep.has(item.id)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`air-import-item${on ? ' is-on' : ''}${item.note ? ' has-note' : ''}`}
                        onClick={() => toggle(item.id)}
                        aria-pressed={on}
                      >
                        <span className="air-import-box" aria-hidden="true">{on ? '✓' : ''}</span>
                        <span className="air-import-text">
                          <span className="air-import-label">{item.label}</span>
                          <span className="air-import-detail">{item.detail}</span>
                          {item.note && <span className="air-import-note">{item.note}</span>}
                        </span>
                      </button>
                    )
                  })}
                </section>
              ))}
            </div>

            <p className="air-import-never">
              Air never reads: {scan.excluded.join(' · ')}.
            </p>
            <p className="air-import-path">From {scan.source} — copied, not linked.</p>

            <div className="air-import-actions">
              <button onClick={useDefaults} disabled={busy}>Use the defaults</button>
              <button onClick={onClose} disabled={busy}>Cancel</button>
              <button className="is-primary" onClick={apply} disabled={busy}>
                {keep.size ? `Import ${keep.size}` : 'Import nothing'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
