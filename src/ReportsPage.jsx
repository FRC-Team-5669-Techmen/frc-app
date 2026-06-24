import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { displayName } from './names'
import { CATEGORIES, categoryLabel, fmtHours } from './hoursUtils'
import {
  buildRows, filterRows, rollupByEvent, rowsToCsv, totalsByCategory,
  letterData, letterHtml, exportHtml, SERVICE_CATEGORIES,
} from './reporting'
import './ReportsPage.css'

const TEAM = { name: 'Techmen — FRC Team 5669', org: 'Don Bosco Technical Institute' }
const today = () => new Date().toISOString().slice(0, 10)

// Open a print window with self-contained HTML and trigger the print dialog
// (the user picks "Save as PDF"). No deps, offline, nothing written server-side.
function openPrint(html) {
  const w = window.open('', '_blank')
  if (!w) { alert('Pop-up blocked — allow pop-ups for this site to print/save the PDF.'); return }
  w.document.write(html)
  w.document.close()
  w.focus()
  // Give the new document a tick to lay out before printing.
  setTimeout(() => w.print(), 250)
}

function downloadCsv(text, filename) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`

export default function ReportsPage({ session, hasRole = () => false }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')

  const [tab, setTab] = useState('events') // 'events' | 'export' | 'letters'
  const [profiles, setProfiles] = useState(null)
  const [events,   setEvents]   = useState(null)
  const [rows,     setRows]     = useState(null)

  // Export filters
  const [exMember, setExMember] = useState('')
  const [exFrom,   setExFrom]   = useState('')
  const [exTo,     setExTo]     = useState('')
  const [exCats,   setExCats]   = useState(new Set())   // empty = all
  const [exEvent,  setExEvent]  = useState('')
  const [exReview, setExReview] = useState(true)

  // Letter filters
  const [ltMember, setLtMember] = useState('')
  const [ltFrom,   setLtFrom]   = useState('')
  const [ltTo,     setLtTo]     = useState(today())
  const [ltCats,   setLtCats]   = useState(new Set(SERVICE_CATEGORIES))

  useEffect(() => {
    if (!isStaff) return
    Promise.all([
      supabase.from('profiles').select('id, full_name, nickname'),
      supabase.from('attendance_events').select('id, user_id, type, event_time, location, category, manual_entry').order('event_time'),
      supabase.from('logged_hours').select('member_id, date, hours, type, description').eq('status', 'verified'),
      supabase.from('events').select('id, title, kind, starts_at, ends_at, location').order('starts_at', { ascending: true }),
      supabase.from('session_reviews').select('user_id, checkout_id').in('status', ['pending', 'voided']),
    ]).then(([{ data: p }, { data: ae }, { data: lh }, { data: ev }, { data: sr }]) => {
      const profs = p ?? []
      setProfiles(profs)
      setEvents(ev ?? [])
      const nameById = Object.fromEntries(profs.map(x => [x.id, displayName(x)]))
      const excludedByMember = {}
      for (const r of sr ?? []) (excludedByMember[r.user_id] ??= new Set()).add(r.checkout_id)
      setRows(buildRows(nameById, ae ?? [], lh ?? [], excludedByMember, ev ?? []))
    })
  }, [isStaff])

  const memberOptions = useMemo(
    () => (profiles ?? []).map(p => ({ id: p.id, name: displayName(p) })).sort((a, b) => a.name.localeCompare(b.name)),
    [profiles]
  )
  const eventsDesc = useMemo(
    () => [...(events ?? [])].sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
    [events]
  )

  const exFiltered = useMemo(() => rows ? filterRows(rows, {
    memberId: exMember || null, from: exFrom || null, to: exTo || null,
    categories: exCats, eventId: exEvent || null, includeReview: exReview,
  }) : [], [rows, exMember, exFrom, exTo, exCats, exEvent, exReview])
  const exTotals = useMemo(() => totalsByCategory(exFiltered), [exFiltered])

  const rollup = useMemo(
    () => (rows && events) ? rollupByEvent(rows, eventsDesc) : [],
    [rows, events, eventsDesc]
  )

  const ltData = useMemo(() => {
    if (!rows || !ltMember) return null
    const name = memberOptions.find(m => m.id === ltMember)?.name || '—'
    return letterData(rows, { memberId: ltMember, memberName: name, from: ltFrom || '1970-01-01', to: ltTo || today(), categories: [...ltCats] })
  }, [rows, ltMember, ltFrom, ltTo, ltCats, memberOptions])

  if (!isStaff) {
    return <div className="rp-wrap"><div className="rp-denied">You need a staff role to access reports.</div></div>
  }
  if (!rows || !events || !profiles) {
    return <div className="rp-wrap"><div className="rp-loading"><div className="rp-spinner" /></div></div>
  }

  const generatedAt = new Date().toLocaleString()
  const preparedBy = session?.user?.user_metadata?.full_name || session?.user?.email || 'team staff'
  const toggle = (setFn) => (key) => setFn(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  // ── Exports ──
  function exportCsvFile() {
    downloadCsv(rowsToCsv(exFiltered), `techmen-hours-${today()}.csv`)
  }
  function exportPdf() {
    const who = exMember ? (memberOptions.find(m => m.id === exMember)?.name || 'member') : 'Team-wide'
    const range = `${exFrom || 'start'} → ${exTo || 'today'}`
    openPrint(exportHtml(exFiltered, { title: 'Hours Export', subtitle: `${who} · ${range}`, team: TEAM, generatedAt }))
  }

  // ── Per-event rollup CSV / PDF (built inline) ──
  function rollupCsv() {
    const head = ['Event', 'Kind', 'Start', 'End', ...CATEGORIES.map(c => c.label), 'Total', 'Members']
    const lines = [head.map(csvCell).join(',')]
    for (const r of rollup) {
      lines.push([
        r.event.title, r.event.kind, r.event.starts_at, r.event.ends_at,
        ...CATEGORIES.map(c => (r[c.key] || 0).toFixed(2)), r.total.toFixed(2), r.memberCount,
      ].map(csvCell).join(','))
    }
    downloadCsv(lines.join('\r\n'), `techmen-events-${today()}.csv`)
  }
  function rollupPdf() {
    const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    const body = rollup.map(r => `<tr><td>${esc(r.event.title)}</td><td>${esc(whenLabel(r.event))}</td>
      <td class="num">${r.total ? r.total.toFixed(1) : '—'}</td><td class="num">${r.memberCount || '—'}</td>
      <td>${CATEGORIES.filter(c => r[c.key] > 0).map(c => `${esc(c.label)} ${r[c.key].toFixed(1)}`).join(', ')}</td></tr>`).join('')
    openPrint(`<!doctype html><html><head><meta charset="utf-8"><title>Per-event hours</title>
      <style>@page{margin:.6in}body{font-family:Arial,sans-serif;font-size:10pt;color:#111}
      h1{font-size:14pt;margin:0 0 2px}.sub{color:#555;font-size:9pt;margin:0 0 12px}
      table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:3px 6px;border-bottom:1px solid #ddd}
      td.num,th.num{text-align:right}.noprint{display:none}</style></head><body>
      <h1>Per-Event Hours</h1><p class="sub">${esc(TEAM.name)} · generated ${esc(generatedAt)}</p>
      <table><thead><tr><th>Event</th><th>When</th><th class="num">Total h</th><th class="num">Members</th><th>By category</th></tr></thead>
      <tbody>${body || '<tr><td colspan="5">No events.</td></tr>'}</tbody></table></body></html>`)
  }

  function makeLetter() {
    if (!ltData) return
    openPrint(letterHtml(ltData, { preparedBy, generatedAt, team: TEAM }))
  }

  return (
    <div className="rp-wrap">
      <div className="rp-body">
        <div className="rp-tabs">
          <button className={`rp-tab${tab === 'events' ? ' active' : ''}`} onClick={() => setTab('events')}>Per-event</button>
          <button className={`rp-tab${tab === 'export' ? ' active' : ''}`} onClick={() => setTab('export')}>Exports</button>
          <button className={`rp-tab${tab === 'letters' ? ' active' : ''}`} onClick={() => setTab('letters')}>Service letters</button>
        </div>

        {/* ── PER-EVENT ROLLUPS ── */}
        {tab === 'events' && (
          <>
            <div className="rp-controls">
              <p className="rp-note">Hours tied to each calendar event by time/date window, folding attendance + verified logged hours.</p>
              <div className="rp-btns">
                <button className="rp-btn" onClick={rollupCsv}>⬇ CSV</button>
                <button className="rp-btn rp-btn-print" onClick={rollupPdf}>🖨 PDF</button>
              </div>
            </div>
            <div className="rp-table-wrap">
              <table className="rp-table">
                <thead><tr><th>Event</th><th>When</th><th className="rp-num">Total</th><th className="rp-num">Members</th><th>By category</th></tr></thead>
                <tbody>
                  {rollup.length === 0 && <tr><td colSpan={5} className="rp-empty">No events yet.</td></tr>}
                  {rollup.map(r => (
                    <tr key={r.event.id}>
                      <td className="rp-strong">{r.event.title} <span className="rp-kind">{r.event.kind}</span></td>
                      <td className="rp-when">{whenLabel(r.event)}</td>
                      <td className="rp-num rp-strong">{r.total ? fmtHours(r.total) : '—'}</td>
                      <td className="rp-num">{r.memberCount || '—'}</td>
                      <td className="rp-split">
                        {CATEGORIES.filter(c => r[c.key] > 0).map(c => (
                          <span key={c.key} className="rp-chip" style={{ color: c.color, borderColor: c.color }}>
                            {categoryLabel(c.key)} {fmtHours(r[c.key])}
                          </span>
                        ))}
                        {r.total === 0 && <span className="rp-muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── EXPORTS ── */}
        {tab === 'export' && (
          <>
            <div className="rp-filters">
              <label className="rp-field">
                <span className="rp-label">Student</span>
                <select className="rp-input" value={exMember} onChange={e => setExMember(e.target.value)}>
                  <option value="">Team-wide (all)</option>
                  {memberOptions.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <label className="rp-field">
                <span className="rp-label">From</span>
                <input className="rp-input" type="date" value={exFrom} onChange={e => setExFrom(e.target.value)} />
              </label>
              <label className="rp-field">
                <span className="rp-label">To</span>
                <input className="rp-input" type="date" value={exTo} onChange={e => setExTo(e.target.value)} />
              </label>
              <label className="rp-field">
                <span className="rp-label">Event</span>
                <select className="rp-input" value={exEvent} onChange={e => setExEvent(e.target.value)}>
                  <option value="">Any event</option>
                  {eventsDesc.map(e => <option key={e.id} value={e.id}>{e.title} ({whenLabel(e)})</option>)}
                </select>
              </label>
            </div>
            <div className="rp-catrow">
              <span className="rp-label">Categories:</span>
              {CATEGORIES.map(c => (
                <button key={c.key} type="button"
                  className={`rp-catchip${exCats.has(c.key) ? ' on' : ''}`}
                  style={exCats.has(c.key) ? { borderColor: c.color, color: c.color } : undefined}
                  onClick={() => toggle(setExCats)(c.key)}>{c.label}</button>
              ))}
              <span className="rp-muted">{exCats.size === 0 ? '(all)' : ''}</span>
              <label className="rp-check">
                <input type="checkbox" checked={exReview} onChange={e => setExReview(e.target.checked)} />
                include under-review
              </label>
            </div>

            <div className="rp-controls">
              <p className="rp-note">
                {exFiltered.length} row{exFiltered.length === 1 ? '' : 's'} · <strong>{fmtHours(exTotals.total)}</strong> (excl. review).
                Both sources; flags shown as columns.
              </p>
              <div className="rp-btns">
                <button className="rp-btn" onClick={exportCsvFile}>⬇ CSV</button>
                <button className="rp-btn rp-btn-print" onClick={exportPdf}>🖨 PDF</button>
              </div>
            </div>

            <div className="rp-table-wrap">
              <table className="rp-table">
                <thead><tr>
                  <th>Member</th><th>Src</th><th>Category</th><th>Date</th><th className="rp-num">Hours</th><th>Flags</th><th>Event</th>
                </tr></thead>
                <tbody>
                  {exFiltered.length === 0 && <tr><td colSpan={7} className="rp-empty">No rows match the filters.</td></tr>}
                  {exFiltered.slice(0, 200).map((r, i) => (
                    <tr key={i} className={r.review ? 'rp-row-review' : ''}>
                      <td>{r.memberName}</td>
                      <td className="rp-muted">{r.source === 'attendance' ? 'att' : 'log'}</td>
                      <td><span className="rp-chip" style={{ color: catColor(r.category), borderColor: catColor(r.category) }}>{categoryLabel(r.category)}</span></td>
                      <td className="rp-when">{r.date}</td>
                      <td className="rp-num">{fmtHours(r.hours)}</td>
                      <td className="rp-flags">
                        {r.wasCapped && <span title="Capped">capped</span>}
                        {r.manual && <span title="Manual entry">manual</span>}
                        {r.review && <span title="Pending/voided review">review</span>}
                      </td>
                      <td className="rp-when">{r.eventTitle || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {exFiltered.length > 200 && <p className="rp-muted rp-trunc">Showing first 200 rows — CSV/PDF include all {exFiltered.length}.</p>}
            </div>
          </>
        )}

        {/* ── SERVICE-HOUR LETTERS ── */}
        {tab === 'letters' && (
          <>
            <div className="rp-filters">
              <label className="rp-field">
                <span className="rp-label">Student / volunteer</span>
                <select className="rp-input" value={ltMember} onChange={e => setLtMember(e.target.value)}>
                  <option value="">Select a member…</option>
                  {memberOptions.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <label className="rp-field">
                <span className="rp-label">From</span>
                <input className="rp-input" type="date" value={ltFrom} onChange={e => setLtFrom(e.target.value)} />
              </label>
              <label className="rp-field">
                <span className="rp-label">To</span>
                <input className="rp-input" type="date" value={ltTo} onChange={e => setLtTo(e.target.value)} />
              </label>
            </div>
            <div className="rp-catrow">
              <span className="rp-label">Service categories:</span>
              {CATEGORIES.map(c => (
                <button key={c.key} type="button"
                  className={`rp-catchip${ltCats.has(c.key) ? ' on' : ''}`}
                  style={ltCats.has(c.key) ? { borderColor: c.color, color: c.color } : undefined}
                  onClick={() => toggle(setLtCats)(c.key)}>{c.label}</button>
              ))}
            </div>

            {!ltMember ? (
              <p className="rp-note">Select a member to preview their service-hour letter.</p>
            ) : (
              <div className="rp-letter-preview">
                <div className="rp-letter-head">
                  <div>
                    <div className="rp-strong">{ltData.memberName}</div>
                    <div className="rp-muted">{ltFrom || 'start'} → {ltTo || 'today'} · {[...ltCats].map(categoryLabel).join(', ') || 'no categories'}</div>
                  </div>
                  <button className="rp-btn rp-btn-print" onClick={makeLetter} disabled={!ltCats.size}>🖨 Generate letter (PDF)</button>
                </div>
                <div className="rp-letter-totals">
                  {CATEGORIES.filter(c => ltCats.has(c.key) && (ltData.totals[c.key] || 0) > 0).map(c => (
                    <span key={c.key} className="rp-chip" style={{ color: c.color, borderColor: c.color }}>
                      {categoryLabel(c.key)} {fmtHours(ltData.totals[c.key])}
                    </span>
                  ))}
                  <span className="rp-chip rp-chip-total">Total {fmtHours(ltData.totals.total)}</span>
                </div>
                <p className="rp-muted">{ltData.items.length} itemized entr{ltData.items.length === 1 ? 'y' : 'ies'} · attendance + verified logged hours · review-flagged excluded.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function whenLabel(e) {
  const s = new Date(e.starts_at)
  const sameDay = new Date(e.ends_at).toDateString() === s.toDateString()
  const d = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return sameDay ? d : `${d}–${new Date(e.ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

const _catColor = Object.fromEntries(CATEGORIES.map(c => [c.key, c.color]))
function catColor(k) { return _catColor[k] ?? 'var(--steel)' }
