import React, { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icons'
import { rgba } from '../lib/ui'
import { usePolling } from '../hooks/usePolling'

// GitHub panel: connection state, your repos (search + clone), your open
// work (PRs / review requests / issues) and the notifications inbox. All
// data comes pre-mapped from main — no token ever reaches this component.

function ago(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  if (!isFinite(ms) || ms < 0) return ''
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function SectionTitle({ children, right }) {
  return (
    <div className="flex items-center" style={{ padding: '12px 12px 6px', gap: 8 }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: 1, flex: 1 }}>{children}</span>
      {right}
    </div>
  )
}

function ExternalRow({ accent, title, meta, onOpen, unread }) {
  return (
    <button
      onClick={onOpen}
      className="sush-row-hover"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
        padding: '6px 12px', background: 'transparent', border: 'none', cursor: 'pointer'
      }}
    >
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: unread ? 800 : 600, color: unread ? 'var(--text-2)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>
        <span style={{ display: 'block', fontSize: 10, color: 'var(--text-4)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta}
        </span>
      </span>
      <Icon name="arrowRight" size={11} color={rgba(accent, 0.7)} />
    </button>
  )
}

export default function GitHubTab({ accent, onRun, onConnect }) {
  const [status, setStatus] = useState(null)       // sush:github-status result
  const [query, setQuery] = useState('')
  const [repos, setRepos] = useState(null)         // null = loading
  const [reposError, setReposError] = useState('')
  const [work, setWork] = useState(null)
  const [inbox, setInbox] = useState(null)
  const [busyRepo, setBusyRepo] = useState('')
  const debounceRef = useRef(null)

  const loadStatus = useCallback(async () => {
    try { setStatus(await window.sush.githubStatus()) } catch {}
  }, [])

  const loadRepos = useCallback(async (q) => {
    setReposError('')
    try {
      const res = await window.sush.githubRepos({ query: q })
      if (res?.ok) setRepos(res.repos)
      else { setRepos([]); setReposError(res?.error || 'failed') }
    } catch { setRepos([]) }
  }, [])

  const loadWork = useCallback(async () => {
    try {
      const res = await window.sush.githubWork()
      if (res?.ok) setWork(res)
    } catch {}
  }, [])

  const loadInbox = useCallback(async () => {
    try {
      const res = await window.sush.githubNotifications({})
      if (res?.ok) setInbox(res)
    } catch {}
  }, [])

  const connected = !!status?.connected

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  useEffect(() => {
    if (!connected) return
    loadRepos('')
    loadWork()
  }, [connected, loadRepos, loadWork])

  // Inbox refreshes while the tab is open and the window focused.
  usePolling(loadInbox, 60000, connected)

  // Debounced repo search.
  const onQuery = (value) => {
    setQuery(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => loadRepos(value), 400)
  }

  const openUrl = (url) => { if (url) window.sush.openExternal({ url }) }

  const markRead = async (id) => {
    await window.sush.githubNotificationRead({ id })
    loadInbox()
  }

  const field = {
    width: '100%',
    background: '#0f1318',
    border: '1px solid #20272e',
    color: 'var(--text-1)',
    borderRadius: 8,
    padding: '7px 10px',
    fontSize: 12,
    outline: 'none',
    fontFamily: 'inherit'
  }

  // ── Not connected / not configured states ────────────────────────────────
  if (status && !connected) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ height: '100%', gap: 12, padding: 24, textAlign: 'center' }}>
        <span className="flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 12, background: rgba(accent, 0.1), border: `1px solid ${rgba(accent, 0.25)}`, color: accent }}>
          <Icon name="github" size={20} />
        </span>
        <div style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 700 }}>GitHub is not connected</div>
        <div style={{ color: 'var(--text-3)', fontSize: 11.5, maxWidth: 250, lineHeight: 1.6 }}>
          Run <code style={{ color: 'var(--text-3)' }}>gh auth login</code> in a session, or connect this identity in Manage Users.
          {!status.configured?.github && ' In-app sign-in needs a client id in Settings > Accounts.'}
        </div>
        {onConnect && (
          <button
            onClick={onConnect}
            style={{ padding: '8px 16px', borderRadius: 9, border: `1px solid ${rgba(accent, 0.5)}`, background: rgba(accent, 0.12), color: 'var(--text-1)', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
          >
            Open Manage Users
          </button>
        )}
        <button
          onClick={loadStatus}
          style={{ padding: '6px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-3)', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}
        >
          Re-check
        </button>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      {/* Connection header */}
      <div className="flex items-center" style={{ gap: 9, padding: '10px 12px', borderBottom: '1px solid #141a1f' }}>
        <Icon name="github" size={14} color={accent} strokeWidth={2} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: 'var(--text-2)' }}>
            {status ? `@${status.login || 'connected'}` : 'GitHub'}
          </span>
          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)' }}>
            {status ? (status.source === 'gh-cli' ? 'via gh CLI login' : 'via Sush sign-in') : 'checking connection...'}
          </span>
        </span>
        <button
          onClick={() => { loadStatus(); loadRepos(query); loadWork(); loadInbox() }}
          title="Refresh"
          className="sush-icon-btn flex items-center justify-center"
          style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #20272e', background: '#11151a', color: 'var(--text-3)', cursor: 'pointer' }}
        >
          <Icon name="refresh" size={13} />
        </button>
      </div>

      {/* Repos */}
      <SectionTitle>YOUR REPOS</SectionTitle>
      <div style={{ padding: '0 12px 4px' }}>
        <input
          value={query}
          onChange={e => onQuery(e.target.value)}
          placeholder="Search GitHub repos..."
          spellCheck={false}
          style={field}
        />
      </div>
      {repos === null && <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-4)' }}>loading...</div>}
      {reposError && <div style={{ padding: '8px 12px', fontSize: 11, color: '#ff8aa0' }}>{reposError}</div>}
      {(repos || []).slice(0, 12).map(r => (
        <div key={r.fullName} className="flex items-center" style={{ gap: 7, padding: '5px 12px' }}>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span className="flex items-center" style={{ gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fullName}</span>
              {r.private && <Icon name="lock" size={9} color="var(--text-3)" />}
            </span>
            <span style={{ display: 'block', fontSize: 10, color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[r.language, r.stars ? `*${r.stars}` : '', ago(r.updatedAt)].filter(Boolean).join(' - ')}
            </span>
          </span>
          <button
            onClick={() => { setBusyRepo(r.fullName); onRun(`clone ${r.fullName}`); setTimeout(() => setBusyRepo(''), 4000) }}
            disabled={busyRepo === r.fullName}
            title="Clone into the active workdir"
            style={{ padding: '3px 9px', borderRadius: 7, border: `1px solid ${rgba(accent, 0.4)}`, background: rgba(accent, 0.08), color: accent, fontSize: 10.5, fontWeight: 800, cursor: 'pointer', opacity: busyRepo === r.fullName ? 0.5 : 1 }}
          >
            {busyRepo === r.fullName ? '...' : 'clone'}
          </button>
          <button
            onClick={() => openUrl(r.htmlUrl)}
            title="Open on GitHub"
            className="sush-icon-btn flex items-center justify-center"
            style={{ width: 24, height: 24, borderRadius: 7, border: '1px solid #20272e', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
          >
            <Icon name="globe" size={11} />
          </button>
        </div>
      ))}

      {/* My work */}
      <SectionTitle
        right={
          <button onClick={loadWork} style={{ background: 'none', border: 'none', color: 'var(--text-4)', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>
            refresh
          </button>
        }
      >
        MY WORK
      </SectionTitle>
      {!work && <div style={{ padding: '2px 12px 8px', fontSize: 11, color: 'var(--text-4)' }}>loading...</div>}
      {work && (
        <>
          {[
            ['Open PRs', work.prs],
            ['Review requests', work.reviewRequests],
            ['Assigned issues', work.issues]
          ].map(([label, items]) => (
            <div key={label} style={{ marginBottom: 4 }}>
              <div style={{ padding: '2px 12px', fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700 }}>
                {label} {items.length > 0 && <span style={{ color: accent }}>({items.length})</span>}
              </div>
              {items.length === 0
                ? <div style={{ padding: '0 12px 4px', fontSize: 10.5, color: 'var(--text-5)' }}>none</div>
                : items.slice(0, 6).map(it => (
                  <ExternalRow
                    key={`${it.repo}#${it.number}`}
                    accent={accent}
                    title={it.title}
                    meta={`${it.repo}#${it.number} - ${ago(it.updatedAt)}`}
                    onOpen={() => openUrl(it.htmlUrl)}
                  />
                ))}
            </div>
          ))}
        </>
      )}

      {/* Inbox */}
      <SectionTitle>INBOX{inbox?.unreadCount ? ` (${inbox.unreadCount})` : ''}</SectionTitle>
      {!inbox && <div style={{ padding: '2px 12px 12px', fontSize: 11, color: 'var(--text-4)' }}>loading...</div>}
      {inbox && inbox.notifications.length === 0 && (
        <div style={{ padding: '2px 12px 12px', fontSize: 11, color: 'var(--text-5)' }}>inbox zero</div>
      )}
      {(inbox?.notifications || []).slice(0, 15).map(n => (
        <div key={n.id} className="flex items-center" style={{ gap: 4, paddingRight: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ExternalRow
              accent={accent}
              unread={n.unread}
              title={n.title}
              meta={`${n.repo} - ${n.reason} - ${ago(n.updatedAt)}`}
              onOpen={() => openUrl(n.htmlUrl)}
            />
          </div>
          {n.unread && (
            <button
              onClick={() => markRead(n.id)}
              title="Mark read"
              style={{ width: 16, height: 16, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent }} />
            </button>
          )}
        </div>
      ))}
      <div style={{ height: 14 }} />
    </div>
  )
}
