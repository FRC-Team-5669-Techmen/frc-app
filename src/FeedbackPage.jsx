import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from './supabase'
import { RoleBadge, topRoleOf } from './roles'
import { isMissingColumn, isMissingFunction } from './schemaMissing'
import {
  DEFAULT_FILTER, STATUSES, STATUS_LABEL, STATUS_TO_LEGACY, TYPE_LABEL,
  applyMove, applyRestore, describeFilter, exportStamp, facetOptions, filterReports, fmtLA,
  imagePathsOf, moveSummary, normStatus, reporterName, statusCounts, statusesFor,
  summarizeUserAgent, typeOf, undoFrom, undoLabel, undoSummary,
} from './feedbackModel'
import { buildArchive, markdownParts } from './feedbackExport'
import './FeedbackPage.css'

// The feedback console. Admin-only, matching the table's own RLS -- the gate
// here is a courtesy so a non-admin gets a sentence instead of an empty list;
// the policy in supabase/feedback.sql and the is_admin() check inside both
// 0002 RPCs are what actually enforce it.
//
// FILTER FIRST, EXPORT SECOND. The export bar at the top always names exactly
// what is on screen ("Export 23 shown") and acts on that and nothing else, so
// what leaves is the reports that matter rather than the whole inbox. It is
// the first thing on the page because the earlier bulk copy only appeared
// after a row was ticked, and was missed entirely.
//
// TWO STATES, BECAUSE MIGRATION 0002 IS PASTED BY HAND. Before it is applied
// the console still lists, filters, exports and triages one report at a time
// between New / Seen / Won't do (written as the old open / reviewed /
// dismissed), and says plainly that the rest is not set up yet. After it,
// every status, bulk moves and an exact undo go through the two admin RPCs.
// The state is detected from the error CODE of the first read
// (src/schemaMissing.js), never from a message.

// Signed URLs are minted, used, and allowed to expire. Ten minutes is long
// enough to read an inbox and short enough that a URL that leaks out of the
// page is dead before it is useful.
const SIGNED_TTL = 600

const BUILD = import.meta.env.VITE_APP_BUILD || 'unknown'

const BASE_COLUMNS = `
  id, member_id, category, message, image_paths, route, viewport, user_agent,
  status, reviewed_by, reviewed_at, created_at`
// Two FKs point at profiles (author and reviewer), so PostgREST needs the
// constraint named on each embed or the request is ambiguous.
const EMBEDS = `
  author:profiles!feedback_member_id_fkey(full_name, nickname),
  reviewer:profiles!feedback_reviewed_by_fkey(full_name, nickname)`

async function fetchReports() {
  const order = { ascending: false }
  const wide = await supabase.from('feedback')
    .select(`${BASE_COLUMNS}, tried, build, ${EMBEDS}`).order('created_at', order)
  if (wide.error && isMissingColumn(wide.error)) {
    const narrow = await supabase.from('feedback')
      .select(`${BASE_COLUMNS}, ${EMBEDS}`).order('created_at', order)
    return { data: narrow.data, error: narrow.error, migrated: false }
  }
  return { data: wide.data, error: wide.error, migrated: !wide.error }
}

async function copyText(text) {
  if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
  await navigator.clipboard.writeText(text)
}

function downloadBytes(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// One report's screenshot bytes for the zip, through the admin's own storage
// client, so the bucket's admin-only read policy stays the boundary. Never
// throws: a missing image is a normal answer the archive states per report.
async function fetchImage(path) {
  try {
    const { data, error } = await supabase.storage.from('feedback').download(path)
    if (error || !data) return null
    return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || null }
  } catch {
    return null
  }
}

// ── Copying markdown, in parts when it is long ──
// The same parts the export bar copies: a short set is one paste; a long one
// is numbered parts, each with its own header, copied one after another.
function useMarkdownCopy() {
  const [state, setState] = useState(null)   // { parts, copied: number[], failed }
  const start = useCallback(async (rows, opts) => {
    const { parts } = markdownParts(rows, { ...opts, exportedAt: new Date().toISOString() })
    try {
      await copyText(parts[0].text)
      setState({ parts, copied: [0], failed: false })
    } catch {
      setState({ parts, copied: [], failed: true })
    }
  }, [])
  const copyPart = useCallback(async i => {
    if (!state) return
    try {
      await copyText(state.parts[i].text)
      setState(s => ({ ...s, copied: [...new Set([...s.copied, i])], failed: false }))
    } catch {
      setState(s => ({ ...s, failed: true }))
    }
  }, [state])
  const reset = useCallback(() => setState(null), [])
  return { state, start, copyPart, reset }
}

function PartsLine({ copy, onDownload }) {
  const s = copy.state
  if (!s) return null
  const n = s.parts.length
  return (
    <div className="fbp-parts" role="status">
      {s.failed ? (
        <span className="fbp-parts-note fbp-parts-fail">
          The browser blocked the clipboard. Download it as a file instead.
        </span>
      ) : n === 1 ? (
        <span className="fbp-parts-note">
          Copied: {s.parts[0].text.length.toLocaleString('en-US')} characters, ready to paste into a chat.
        </span>
      ) : (
        <span className="fbp-parts-note">
          Too long for one paste, so it is in {n} parts, each with its own header. Paste them in order:
        </span>
      )}
      {n > 1 && s.parts.map((p, i) => (
        <button
          key={i}
          type="button"
          className={`fbp-part${s.copied.includes(i) ? ' fbp-part-done' : ''}`}
          onClick={() => copy.copyPart(i)}
        >
          {s.copied.includes(i) ? 'Copied' : 'Copy'} part {i + 1} ({p.from}–{p.to})
        </button>
      ))}
      {onDownload && <button type="button" className="fbp-part" onClick={onDownload}>Download .md</button>}
    </div>
  )
}

function RowCopy({ row, opts, label = 'Copy' }) {
  const [state, setState] = useState('')   // '' | copied | failed
  async function copy(e) {
    e.stopPropagation()
    try {
      await copyText(markdownParts([row], { ...opts, exportedAt: new Date().toISOString() }).parts[0].text)
      setState('copied')
    } catch {
      setState('failed')
    }
    setTimeout(() => setState(''), 2500)
  }
  return (
    <button type="button" className="fbp-rowcopy" onClick={copy}>
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </button>
  )
}

function StatusPill({ status }) {
  const s = normStatus(status)
  return <span className={`fbp-status fbp-status-${s}`}>{STATUS_LABEL[s] ?? status}</span>
}

function TypeChip({ row }) {
  const t = typeOf(row)
  return <span className={`fbp-type fbp-type-${t}`}>{TYPE_LABEL[t]}</span>
}

function Detail({ row, role, urls, moves, migrated, onClose, onMove, busy, copyOpts }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const current = normStatus(row.status)
  const shots = imagePathsOf(row)
  return (
    <div className="fbp-modal-backdrop" onClick={onClose}>
      <div className="fbp-modal" role="dialog" aria-modal="true" aria-label="Feedback report" onClick={e => e.stopPropagation()}>
        <div className="fbp-modal-head">
          <div>
            <h2 className="fbp-modal-title">{reporterName(row)} {role && <RoleBadge role={role} />}</h2>
            <span className="fbp-modal-sub">
              {TYPE_LABEL[typeOf(row)]} · {fmtLA(row.created_at)}
            </span>
          </div>
          <button className="fbp-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="fbp-modal-body">
          <p className="fbp-message">{row.message}</p>

          {row.tried && (
            <>
              <span className="fbp-section">What they tried</span>
              <p className="fbp-message fbp-tried">{row.tried}</p>
            </>
          )}

          <span className="fbp-section">Context</span>
          <div className="fbp-kv"><span>Route</span><span className="fbp-mono">{row.route || '—'}</span></div>
          <div className="fbp-kv"><span>Viewport</span><span className="fbp-mono">{row.viewport || '—'}</span></div>
          <div className="fbp-kv"><span>Browser</span><span className="fbp-mono">{summarizeUserAgent(row.user_agent) ?? '—'}</span></div>
          <div className="fbp-kv"><span>User agent</span><span className="fbp-mono fbp-ua">{row.user_agent || '—'}</span></div>
          <div className="fbp-kv">
            <span>Build</span>
            <span className="fbp-mono">{row.build || (migrated ? 'not recorded' : 'not recorded (needs migration 0002)')}</span>
          </div>
          <div className="fbp-kv"><span>Status</span><StatusPill status={row.status} /></div>
          {row.reviewed_at && (
            <div className="fbp-kv">
              <span>Triaged</span>
              <span className="fbp-mono">
                {fmtLA(row.reviewed_at)}{row.reviewer ? ` · ${reporterName({ author: row.reviewer })}` : ''}
              </span>
            </div>
          )}
          <div className="fbp-kv"><span>Report id</span><span className="fbp-mono">{row.id}</span></div>

          {!!shots.length && (
            <>
              <span className="fbp-section">Screenshots</span>
              <div className="fbp-shots">
                {shots.map(p => (
                  urls[p]
                    ? <a key={p} href={urls[p]} target="_blank" rel="noreferrer" className="fbp-shot">
                        <img src={urls[p]} alt="Screenshot attached to this report" />
                      </a>
                    : <span key={p} className="fbp-shot fbp-shot-pending">…</span>
                ))}
              </div>
            </>
          )}

          <span className="fbp-section">Move to</span>
          <div className="fbp-actions">
            {moves.map(s => (
              <button
                key={s}
                type="button"
                className={`fbp-act${s === current ? ' fbp-act-current' : ''}`}
                disabled={busy || s === current}
                aria-pressed={s === current}
                onClick={() => onMove([row.id], s)}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
            <RowCopy row={row} opts={copyOpts} label="Copy for Claude" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FeedbackPage({ session, hasRole = () => false }) {
  const isAdmin = hasRole('admin')
  const uid = session?.user?.id

  const [rows, setRows]         = useState(null)
  const [migrated, setMigrated] = useState(null)   // null until the first read answers
  const [rpcMissing, setRpcMissing] = useState(false)
  const [roles, setRoles]       = useState({})     // member_id -> top role
  const [urls, setUrls]         = useState({})     // storage path -> signed URL
  const [filter, setFilter]     = useState(DEFAULT_FILTER)
  const [names, setNames]       = useState(true)
  const [open, setOpen]         = useState(null)   // feedback id
  const [selected, setSelected] = useState([])     // feedback ids
  const [busy, setBusy]         = useState(false)
  const [note, setNote]         = useState('')
  const [undo, setUndo]         = useState(null)
  const [error, setError]       = useState('')
  const [zip, setZip]           = useState(null)   // { phase, done, total, result }

  const exportCopy = useMarkdownCopy()
  const selectionCopy = useMarkdownCopy()

  const load = useCallback(async () => {
    if (!isAdmin) return
    const { data, error: err, migrated: m } = await fetchReports()
    if (err) { setError(err.message); setRows([]); return }
    setError('')
    setMigrated(m)
    setRows(data ?? [])
    setUndo(null)
    // Roles are context, never a gate: a failed read just leaves them blank.
    const ids = [...new Set((data ?? []).map(r => r.member_id))]
    if (ids.length) {
      const { data: rr } = await supabase.from('member_roles').select('member_id, role').in('member_id', ids)
      const by = {}
      for (const r of rr ?? []) (by[r.member_id] ??= []).push(r.role)
      setRoles(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, topRoleOf(v)])))
    }
  }, [isAdmin])

  useEffect(() => { load() }, [load])

  // Sign every path on the list in one call, and re-sign whenever the list
  // reloads rather than caching a URL indefinitely -- an expired signed URL
  // renders as a silently broken image, which is the failure worth avoiding.
  useEffect(() => {
    if (!rows?.length) { setUrls({}); return }
    const paths = [...new Set(rows.flatMap(imagePathsOf))]
    if (!paths.length) { setUrls({}); return }
    let live = true
    Promise.resolve()
      .then(() => supabase.storage.from('feedback').createSignedUrls(paths, SIGNED_TTL))
      .then(res => {
        if (!live || !res?.data) return
        setUrls(Object.fromEntries(res.data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl])))
      })
      .catch(() => { if (live) setUrls({}) })
    return () => { live = false }
  }, [rows])

  const filtered = useMemo(() => (rows ? filterReports(rows, filter) : null), [rows, filter])
  const facets = useMemo(() => facetOptions(rows ?? []), [rows])
  const counts = useMemo(() => statusCounts(rows ?? []), [rows])
  const roleOf = useCallback(id => roles[id] ?? null, [roles])
  const reporterLabel = facets.reporters.find(r => r.id === filter.reporter)?.name
  const filterText = describeFilter(filter, { reporterLabel, names })
  const copyOpts = useMemo(() => ({ names, roleOf, filterText, build: BUILD }), [names, roleOf, filterText])

  // Selection is scoped to what is on screen: a filter change that hides a
  // selected row must not leave it silently in a bulk copy or a bulk move.
  const visibleIds = useMemo(() => (filtered ?? []).map(r => r.id), [filtered])
  useEffect(() => {
    setSelected(prev => prev.filter(id => visibleIds.includes(id)))
  }, [visibleIds])
  // Anything prepared from the old set is stale once the set changes.
  useEffect(() => { exportCopy.reset(); setZip(null) }, [visibleIds, names])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { selectionCopy.reset() }, [selected])   // eslint-disable-line react-hooks/exhaustive-deps

  const setFacet = (key, value) => setFilter(f => ({ ...f, [key]: value }))
  const canBulk = migrated === true && !rpcMissing
  const moves = statusesFor(canBulk)

  // ── Moving reports ──
  async function move(ids, status) {
    if (!ids.length || busy) return
    const requested = (rows ?? []).filter(r => ids.includes(r.id))
    setBusy(true); setError(''); setNote('')

    if (!canBulk) {
      // Before 0002: one report, a plain client update, in the old spelling.
      // This table is admin-owned end to end and its update policy is
      // is_admin(), so RLS is the authorization story here.
      const legacy = STATUS_TO_LEGACY[status]
      if (!legacy || ids.length !== 1) {
        setBusy(false)
        setError(`${STATUS_LABEL[status]} is not set up yet: it arrives with migration 0002.`)
        return
      }
      const patch = status === 'new'
        ? { status: legacy, reviewed_by: null, reviewed_at: null }
        : { status: legacy, reviewed_by: uid, reviewed_at: new Date().toISOString() }
      const { error: err } = await supabase.from('feedback').update(patch).eq('id', ids[0])
      setBusy(false)
      if (err) { setError(err.message); return }
      setRows(prev => prev.map(r => (r.id === ids[0] ? { ...r, ...patch } : r)))
      setNote(moveSummary(status, requested, ids))
      return
    }

    const { data, error: err } = await supabase.rpc('feedback_set_status', { p_ids: ids, p_status: status })
    setBusy(false)
    if (err) {
      if (isMissingFunction(err)) { setRpcMissing(true); setError('Bulk moves are not set up yet: migration 0002 has not been applied.'); return }
      setError(err.message)
      return
    }
    const changed = data ?? []
    const changedIds = changed.map(c => c.id)
    setRows(prev => applyMove(prev, changedIds, status, { uid, at: new Date().toISOString() }))
    setNote(moveSummary(status, requested, changedIds))
    setUndo(undoFrom(status, changed))
    setSelected(prev => prev.filter(id => !changedIds.includes(id)))
  }

  async function runUndo() {
    if (!undo || busy) return
    const current = undo
    setUndo(null)
    setBusy(true); setError('')
    const { data, error: err } = await supabase.rpc('feedback_restore_status', { p_items: current.items, p_from: current.target })
    setBusy(false)
    if (err) {
      setError(`${err.message} Some reports may already be back; refresh before moving them again.`)
      return
    }
    const restoredIds = (data ?? []).map(d => d.id)
    setRows(prev => applyRestore(prev, current.items, restoredIds))
    setNote(undoSummary(current, restoredIds, rows))
  }

  // ── Exporting what is shown ──
  function startMarkdown() {
    if (!filtered?.length) return
    exportCopy.start(filtered, copyOpts)
  }

  function downloadMarkdown() {
    const exportedAt = new Date().toISOString()
    const one = markdownParts(filtered ?? [], { ...copyOpts, exportedAt, cap: Number.MAX_SAFE_INTEGER }).parts[0].text
    downloadBytes(one, `techmen-feedback-${exportStamp(exportedAt)}.md`, 'text/markdown')
  }

  async function startZip() {
    if (!filtered?.length || zip?.phase === 'working') return
    setZip({ phase: 'working', done: 0, total: filtered.reduce((n, r) => n + imagePathsOf(r).length, 0) })
    try {
      const result = await buildArchive(filtered, fetchImage, {
        names, roleOf, filterText, build: BUILD, migrated: migrated === true, adminId: uid,
        exportedAt: new Date().toISOString(),
        onProgress: (done, total) => setZip(z => ({ ...z, done, total })),
      })
      downloadBytes(result.bytes, result.name, 'application/zip')
      setZip({ phase: 'done', result })
    } catch (err) {
      setZip({ phase: 'failed', message: err.message || 'The zip could not be built.' })
    }
  }

  if (!isAdmin) {
    return (
      <div className="fbp-wrap">
        <p className="fbp-muted">Admin access required.</p>
      </div>
    )
  }

  const openRow = rows?.find(r => r.id === open)
  const shown = filtered?.length ?? 0
  const allVisibleSelected = shown > 0 && visibleIds.every(id => selected.includes(id))
  const selectedRows = (rows ?? []).filter(r => selected.includes(r.id))
  const notSetUp = migrated === false || rpcMissing

  return (
    <div className="fbp-wrap">
      <div className="fbp-head">
        <h1 className="fbp-title">Feedback</h1>
        <p className="fbp-sub">
          Reports filed from the in-app button. Nothing here notifies anyone: it is an
          inbox you check. Reports are triaged, never deleted; spam is a status you can undo.
        </p>
      </div>

      {notSetUp && (
        <p className="fbp-setup" role="note">
          Not set up yet: migration 0002_feedback_console.sql has not been applied. Until it
          is, a report can be moved one at a time between New, Seen and Won't do. In progress,
          Done, Spam, bulk moves with undo, and the "what did you try" and build fields arrive
          with it. Every report already here is unaffected, and export works now.
        </p>
      )}

      {/* ── The export bar: first on the page, and it names what it exports. ── */}
      <section className="fbp-export" aria-label="Export">
        <div className="fbp-export-row">
          <div className="fbp-export-what">
            <span className="fbp-export-title">
              {rows === null ? 'Export' : `Export ${shown} shown`}
            </span>
            <span className="fbp-export-scope">{filterText}</span>
          </div>
          <div className="fbp-export-actions">
            <button type="button" className="fbp-export-btn" disabled={!shown} onClick={startMarkdown}>
              Markdown for chat
            </button>
            <button type="button" className="fbp-export-btn" disabled={!shown || zip?.phase === 'working'} onClick={startZip}>
              {zip?.phase === 'working' ? 'Building zip…' : 'Zip with screenshots'}
            </button>
            <label className="fbp-names">
              <input type="checkbox" checked={names} onChange={e => setNames(e.target.checked)} />
              Names in export
            </label>
          </div>
        </div>
        <PartsLine copy={exportCopy} onDownload={downloadMarkdown} />
        {zip?.phase === 'working' && (
          <p className="fbp-parts-note" role="status">
            {zip.total ? `Fetching screenshots ${zip.done} of ${zip.total}…` : 'Building the zip…'}
          </p>
        )}
        {zip?.phase === 'done' && (
          <p className="fbp-parts-note" role="status">
            Downloaded {zip.result.name}: {zip.result.reports} report{zip.result.reports === 1 ? '' : 's'}, {zip.result.images} screenshot{zip.result.images === 1 ? '' : 's'}
            {zip.result.missing.length ? ` (${zip.result.missing.length} not included; its README says which)` : ''}.
            {' '}Its MARK_SEEN.sql moves the New ones to Seen when pasted into the Supabase SQL editor.
          </p>
        )}
        {zip?.phase === 'failed' && <p className="fbp-error" role="alert">{zip.message}</p>}
      </section>

      {/* ── Status tabs ── */}
      <div className="fbp-tabs" role="group" aria-label="Status">
        {[...STATUSES, 'all'].map(s => (
          <button
            key={s}
            type="button"
            className={`fbp-tab${filter.status === s ? ' fbp-tab-on' : ''}`}
            aria-pressed={filter.status === s}
            onClick={() => setFacet('status', s)}
          >
            {s === 'all' ? `All (${rows?.length ?? 0})` : `${STATUS_LABEL[s]} (${counts[s] ?? 0})`}
          </button>
        ))}
      </div>

      <div className="fbp-controls">
        <select className="fbp-input" aria-label="Type" value={filter.type} onChange={e => setFacet('type', e.target.value)}>
          <option value="all">All types</option>
          <option value="bug">Bug</option>
          <option value="idea">Idea</option>
          <option value="general">General (no type)</option>
        </select>
        <select className="fbp-input" aria-label="Route" value={filter.route} onChange={e => setFacet('route', e.target.value)}>
          <option value="all">All routes</option>
          {facets.routes.map(r => (
            <option key={r.route} value={r.route}>{r.route || '(none recorded)'} ({r.count})</option>
          ))}
        </select>
        <select className="fbp-input" aria-label="Reporter" value={filter.reporter} onChange={e => setFacet('reporter', e.target.value)}>
          <option value="all">All reporters</option>
          {facets.reporters.map(r => (
            <option key={r.id} value={r.id}>{r.name} ({r.count})</option>
          ))}
        </select>
        <select className="fbp-input" aria-label="Screenshots" value={filter.shots} onChange={e => setFacet('shots', e.target.value)}>
          <option value="any">Any screenshots</option>
          <option value="with">With screenshots</option>
          <option value="without">Without screenshots</option>
        </select>
        <input
          className="fbp-input fbp-search"
          type="search"
          aria-label="Search"
          placeholder="Search message, what they tried, route, member…"
          value={filter.q}
          onChange={e => setFacet('q', e.target.value)}
        />
        <button className="fbp-refresh" type="button" onClick={() => setFilter(DEFAULT_FILTER)}>Clear filters</button>
        <button className="fbp-refresh" type="button" onClick={load}>Refresh</button>
      </div>

      {error && <p className="fbp-error" role="alert">{error}</p>}
      {(note || undo) && (
        <div className="fbp-note" role="status">
          {note && <span>{note}</span>}
          {undo && (
            <button type="button" className="fbp-undo" disabled={busy} onClick={runUndo}>
              {undoLabel(undo)}
            </button>
          )}
        </div>
      )}

      {rows === null && <p className="fbp-muted">Loading…</p>}

      {rows !== null && !shown && (
        <p className="fbp-muted">No feedback matches this filter.</p>
      )}

      {!!shown && (
        <>
          <div className="fbp-bulkbar">
            <label className="fbp-selectall">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={e => setSelected(e.target.checked ? visibleIds : [])}
              />
              Select all shown ({shown})
            </label>
            {selected.length > 0 && (
              <div className="fbp-bulk-actions">
                <span className="fbp-bulk-count">{selected.length} selected</span>
                {canBulk ? (
                  <>
                    <span className="fbp-bulk-label">Move to</span>
                    {moves.map(s => (
                      <button key={s} type="button" className="fbp-move" disabled={busy} onClick={() => move(selected, s)}>
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                  </>
                ) : (
                  <span className="fbp-bulk-label">Bulk moves: not set up yet (migration 0002).</span>
                )}
                <button
                  type="button"
                  className="fbp-bulkcopy"
                  onClick={() => selectionCopy.start(
                    [...selectedRows].sort((a, b) => a.created_at.localeCompare(b.created_at)), copyOpts)}
                >
                  Copy {selected.length} as prompt
                </button>
              </div>
            )}
          </div>
          {selected.length > 0 && <PartsLine copy={selectionCopy} />}

          <ul className="fbp-list">
            {filtered.map(r => {
              const shots = imagePathsOf(r)
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
                      <TypeChip row={r} />
                      <span className="fbp-author">{reporterName(r)}</span>
                      {roles[r.member_id] && <RoleBadge role={roles[r.member_id]} />}
                      <span className="fbp-route">{r.route || '—'}</span>
                      <StatusPill status={r.status} />
                      <span className="fbp-when">{fmtLA(r.created_at)}</span>
                    </div>
                    <p className="fbp-preview">{r.message}</p>
                    {r.tried && <p className="fbp-preview fbp-preview-tried">Tried: {r.tried}</p>}
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
                  <RowCopy row={r} opts={copyOpts} />
                </li>
              )
            })}
          </ul>
        </>
      )}

      {openRow && (
        <Detail
          row={openRow}
          role={roles[openRow.member_id]}
          urls={urls}
          moves={moves}
          migrated={migrated === true}
          busy={busy}
          copyOpts={copyOpts}
          onClose={() => setOpen(null)}
          onMove={move}
        />
      )}
    </div>
  )
}
