import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from './supabase'
import { displayName } from './names'
import './FeedbackPage.css'

// The feedback inbox. Admin-only, matching the table's own RLS -- the gate here
// is a courtesy so a non-admin gets a sentence instead of an empty list; the
// policy in supabase/feedback.sql is what actually enforces it.

const CATEGORY_LABEL = { bug: 'Bug', idea: 'Idea', feedback: 'Feedback' }
const STATUS_LABEL   = { open: 'Open', reviewed: 'Reviewed', dismissed: 'Dismissed' }

// Signed URLs are minted, used, and allowed to expire. Ten minutes is long
// enough to read an inbox and short enough that a URL that leaks out of the
// page is dead before it is useful.
const SIGNED_TTL = 600

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function pathsOf(row) {
  return Array.isArray(row?.image_paths) ? row.image_paths : []
}

// ── Copy for Claude ──
// Plain text, no signed URLs. A signed URL is time-limited, so it would be dead
// by the time anyone read the pasted prompt -- and a feedback screenshot often
// frames other members' names and hours, which is not something to scatter into
// a chat log. The image count plus where to find them is the honest version.
function promptBlock(row) {
  const lines = [
    `[Techmen app feedback — ${(CATEGORY_LABEL[row.category] ?? row.category).toUpperCase()}]`,
    `From: ${displayName(row.author)}`,
    `Filed: ${fmtDateTime(row.created_at)} (America/Los_Angeles)`,
    `Route: ${row.route || 'unknown'}`,
    `Viewport: ${row.viewport || 'unknown'}`,
    `User agent: ${row.user_agent || 'unknown'}`,
    `Status: ${STATUS_LABEL[row.status] ?? row.status}`,
    '',
    'Report:',
    row.message,
  ]
  const n = pathsOf(row).length
  if (n) {
    lines.push('', `Screenshots: ${n} attached — view them in the Feedback admin page (/feedback); they are not linked here because the signed URLs expire.`)
  }
  return lines.join('\n')
}

function promptFor(rows) {
  if (rows.length === 1) return promptBlock(rows[0])
  const sep = '\n\n' + '─'.repeat(48) + '\n\n'
  return [
    `${rows.length} feedback reports from the Techmen team platform, oldest first:`,
    rows.map(promptBlock).join(sep),
  ].join('\n\n')
}

function CopyButton({ rows, className = 'fbp-copy', label = 'Copy for Claude' }) {
  const [state, setState] = useState('')   // '' | copied | failed
  async function copy(e) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(promptFor(rows))
      setState('copied')
    } catch {
      setState('failed')
    }
    setTimeout(() => setState(''), 2500)
  }
  return (
    <button type="button" className={className} onClick={copy} disabled={!rows.length}>
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </button>
  )
}

function Detail({ row, urls, onClose, onStatus, busy }) {
  return (
    <div className="fbp-modal-backdrop" onClick={onClose}>
      <div className="fbp-modal" onClick={e => e.stopPropagation()}>
        <div className="fbp-modal-head">
          <div>
            <h2 className="fbp-modal-title">{displayName(row.author)}</h2>
            <span className="fbp-modal-sub">
              {CATEGORY_LABEL[row.category] ?? row.category} · {fmtDateTime(row.created_at)}
            </span>
          </div>
          <button className="fbp-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="fbp-modal-body">
          <p className="fbp-message">{row.message}</p>

          <span className="fbp-section">Context</span>
          <div className="fbp-kv"><span>Route</span><span className="fbp-mono">{row.route || '—'}</span></div>
          <div className="fbp-kv"><span>Viewport</span><span className="fbp-mono">{row.viewport || '—'}</span></div>
          <div className="fbp-kv"><span>User agent</span><span className="fbp-mono fbp-ua">{row.user_agent || '—'}</span></div>
          <div className="fbp-kv"><span>Status</span><span className={`fbp-status fbp-status-${row.status}`}>{STATUS_LABEL[row.status] ?? row.status}</span></div>
          {row.reviewed_at && (
            <div className="fbp-kv">
              <span>Triaged</span>
              <span className="fbp-mono">
                {fmtDateTime(row.reviewed_at)}{row.reviewer ? ` · ${displayName(row.reviewer)}` : ''}
              </span>
            </div>
          )}

          {!!pathsOf(row).length && (
            <>
              <span className="fbp-section">Screenshots</span>
              <div className="fbp-shots">
                {pathsOf(row).map(p => (
                  urls[p]
                    ? <a key={p} href={urls[p]} target="_blank" rel="noreferrer" className="fbp-shot">
                        <img src={urls[p]} alt="" />
                      </a>
                    : <span key={p} className="fbp-shot fbp-shot-pending">…</span>
                ))}
              </div>
            </>
          )}

          <div className="fbp-actions">
            <CopyButton rows={[row]} />
            {row.status !== 'reviewed' && (
              <button className="fbp-act" disabled={busy} onClick={() => onStatus(row.id, 'reviewed')}>Mark reviewed</button>
            )}
            {row.status !== 'dismissed' && (
              <button className="fbp-act" disabled={busy} onClick={() => onStatus(row.id, 'dismissed')}>Dismiss</button>
            )}
            {row.status !== 'open' && (
              <button className="fbp-act" disabled={busy} onClick={() => onStatus(row.id, 'open')}>Reopen</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FeedbackPage({ session, hasRole = () => false }) {
  const isAdmin = hasRole('admin')
  const uid = session?.user?.id

  const [rows, setRows]       = useState(null)
  const [urls, setUrls]       = useState({})     // storage path -> signed URL
  const [q, setQ]             = useState('')
  const [cat, setCat]         = useState('all')
  const [status, setStatus]   = useState('open')
  const [open, setOpen]       = useState(null)   // feedback id
  const [selected, setSelected] = useState([])   // feedback ids, for bulk copy
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')

  // Two FKs point at profiles (author and reviewer), so PostgREST needs the
  // constraint named on each embed or the request is ambiguous.
  const SELECT = `
    id, member_id, category, message, image_paths, route, viewport, user_agent,
    status, reviewed_by, reviewed_at, created_at,
    author:profiles!feedback_member_id_fkey(full_name, nickname),
    reviewer:profiles!feedback_reviewed_by_fkey(full_name, nickname)
  `

  const load = useCallback(async () => {
    if (!isAdmin) return
    const { data, error: err } = await supabase
      .from('feedback')
      .select(SELECT)
      .order('created_at', { ascending: false })
    if (err) { setError(err.message); setRows([]); return }
    setError('')
    setRows(data ?? [])
  }, [isAdmin])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // Sign every path currently on the list in one call, and re-sign whenever the
  // list reloads rather than caching a URL indefinitely -- an expired signed URL
  // renders as a silently broken image, which is the failure worth avoiding.
  useEffect(() => {
    if (!rows?.length) { setUrls({}); return }
    const paths = [...new Set(rows.flatMap(pathsOf))]
    if (!paths.length) { setUrls({}); return }
    let live = true
    supabase.storage.from('feedback').createSignedUrls(paths, SIGNED_TTL)
      .then(({ data }) => {
        if (!live || !data) return
        setUrls(Object.fromEntries(
          data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]),
        ))
      })
    return () => { live = false }
  }, [rows])

  const filtered = useMemo(() => {
    if (!rows) return null
    let list = rows
    if (cat !== 'all')    list = list.filter(r => r.category === cat)
    if (status !== 'all') list = list.filter(r => r.status === status)
    const needle = q.trim().toLowerCase()
    if (needle) {
      list = list.filter(r =>
        [r.message, r.route, displayName(r.author)]
          .some(v => (v ?? '').toLowerCase().includes(needle)))
    }
    return list
  }, [rows, q, cat, status])

  // Bulk copy runs oldest-first so a mentor reads a series of reports in the
  // order they were filed, even though the list itself is newest-first.
  const selectedRows = useMemo(() => {
    const byId = new Map((rows ?? []).map(r => [r.id, r]))
    return selected
      .map(id => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  }, [selected, rows])

  // Selection is scoped to what is on screen: a filter change that hides a
  // selected row must not leave it silently in the bulk copy.
  const visibleIds = useMemo(() => (filtered ?? []).map(r => r.id), [filtered])
  useEffect(() => {
    setSelected(prev => prev.filter(id => visibleIds.includes(id)))
  }, [visibleIds])

  const counts = useMemo(() => {
    const c = { open: 0, reviewed: 0, dismissed: 0 }
    for (const r of rows ?? []) c[r.status] = (c[r.status] ?? 0) + 1
    return c
  }, [rows])

  async function setRowStatus(id, next) {
    setBusy(true)
    // A plain client update: this table is admin-owned end to end, so the RLS
    // policy is the whole authorization story and a SECURITY DEFINER RPC would
    // add a layer with nothing to enforce.
    const patch = next === 'open'
      ? { status: 'open', reviewed_by: null, reviewed_at: null }
      : { status: next, reviewed_by: uid, reviewed_at: new Date().toISOString() }
    const { error: err } = await supabase.from('feedback').update(patch).eq('id', id)
    setBusy(false)
    if (err) { setError(err.message); return }
    setError('')
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  if (!isAdmin) {
    return (
      <div className="fbp-wrap">
        <p className="fbp-muted">Admin access required.</p>
      </div>
    )
  }

  const openRow = rows?.find(r => r.id === open)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.includes(id))

  return (
    <div className="fbp-wrap">
      <div className="fbp-head">
        <h1 className="fbp-title">Feedback</h1>
        <p className="fbp-sub">
          Reports filed from the in-app widget. Nothing here notifies anyone — it is
          an inbox you check. Reports are triaged, never deleted.
        </p>
      </div>

      <div className="fbp-controls">
        <select className="fbp-input" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="open">Open ({counts.open})</option>
          <option value="reviewed">Reviewed ({counts.reviewed})</option>
          <option value="dismissed">Dismissed ({counts.dismissed})</option>
          <option value="all">All statuses</option>
        </select>
        <select className="fbp-input" value={cat} onChange={e => setCat(e.target.value)}>
          <option value="all">All categories</option>
          <option value="bug">Bug</option>
          <option value="idea">Idea</option>
          <option value="feedback">Feedback</option>
        </select>
        <input
          className="fbp-input fbp-search"
          type="search"
          placeholder="Search message, route, member…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <button className="fbp-refresh" type="button" onClick={load}>Refresh</button>
      </div>

      {error && <p className="fbp-error">{error}</p>}

      {rows === null && <p className="fbp-muted">Loading…</p>}

      {rows !== null && !filtered.length && (
        <p className="fbp-muted">No feedback matches this filter.</p>
      )}

      {!!filtered?.length && (
        <>
          <div className="fbp-bulkbar">
            <label className="fbp-selectall">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={e => setSelected(e.target.checked ? visibleIds : [])}
              />
              Select all shown ({visibleIds.length})
            </label>
            {selected.length > 0 && (
              <CopyButton
                rows={selectedRows}
                className="fbp-bulkcopy"
                label={`Copy ${selected.length} as prompt`}
              />
            )}
          </div>

          <ul className="fbp-list">
            {filtered.map(r => {
              const shots = pathsOf(r)
              const checked = selected.includes(r.id)
              return (
                <li key={r.id} className="fbp-item" onClick={() => setOpen(r.id)}>
                  <input
                    type="checkbox"
                    className="fbp-check"
                    checked={checked}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setSelected(prev =>
                      e.target.checked ? [...prev, r.id] : prev.filter(id => id !== r.id))}
                    aria-label="Select report"
                  />
                  <div className="fbp-item-main">
                    <div className="fbp-item-top">
                      <span className={`fbp-cat fbp-cat-${r.category}`}>{CATEGORY_LABEL[r.category] ?? r.category}</span>
                      <span className="fbp-author">{displayName(r.author)}</span>
                      <span className="fbp-route">{r.route || '—'}</span>
                      <span className={`fbp-status fbp-status-${r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                      <span className="fbp-when">{fmtDateTime(r.created_at)}</span>
                    </div>
                    <p className="fbp-preview">{r.message}</p>
                    {!!shots.length && (
                      <div className="fbp-strip">
                        {shots.map(p => (
                          urls[p]
                            ? <img key={p} src={urls[p]} alt="" className="fbp-strip-img" />
                            : <span key={p} className="fbp-strip-img fbp-strip-pending" />
                        ))}
                      </div>
                    )}
                  </div>
                  <CopyButton rows={[r]} className="fbp-rowcopy" label="Copy" />
                </li>
              )
            })}
          </ul>
        </>
      )}

      {openRow && (
        <Detail
          row={openRow}
          urls={urls}
          busy={busy}
          onClose={() => setOpen(null)}
          onStatus={setRowStatus}
        />
      )}
    </div>
  )
}
