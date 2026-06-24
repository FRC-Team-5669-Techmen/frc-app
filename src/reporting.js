// Reporting / export helpers — pure data shaping over BOTH hour sources:
// attendance_events-derived sessions (capped) and verified logged_hours. No DOM
// here; ReportsPage owns CSV download + the print window.
import { sessionsFromEvents, CATEGORIES, categoryLabel, loggedTypeToCategory } from './hoursUtils'

const LA = 'America/Los_Angeles'
// 'YYYY-MM-DD' in the team's timezone (en-CA renders ISO order).
export const laDateKey = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: LA })
const fmtClock = d => d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
const fmtDateLong = d => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const round2 = n => Math.round(n * 100) / 100

// Event-attribution choice: hours are tied to a calendar event by DATE/TIME
// WINDOW, not an explicit link column — the check-in fast paths (NFC/kiosk/manual)
// don't know which event they belong to, so a stored link would drift. An
// attendance session is attributed to the earliest event whose [starts_at,
// ends_at] window it overlaps; a logged-hours entry to the earliest event whose
// local date span contains its date.
function matchEvent(row, events) {
  if (!events?.length) return null
  if (row.source === 'attendance') {
    const start = row.inTime.getTime()
    const end = (row.outTime ?? new Date()).getTime()
    for (const e of events) {
      if (start < new Date(e.ends_at).getTime() && end > new Date(e.starts_at).getTime()) return e
    }
  } else {
    for (const e of events) {
      if (row.date >= laDateKey(e.starts_at) && row.date <= laDateKey(e.ends_at)) return e
    }
  }
  return null
}

/**
 * Flatten both hour sources into export/report rows, one per session or logged
 * entry. Each row carries the wasCapped (derived) + manual_entry + review flags
 * and, when `events` is supplied, the matched event.
 *
 * @param {object[]} profiles  - { id, full_name, nickname, … } with a name resolver applied
 * @param {object}   nameById  - id → display name
 * @param {object[]} attEvents - attendance_events rows (id,user_id,type,event_time,location,category,manual_entry)
 * @param {object[]} logged    - verified logged_hours rows (member_id,date,hours,type,description)
 * @param {object}   excludedByMember - memberId → Set(checkout_id) of pending/voided reviews
 * @param {object[]} [events]  - calendar events sorted by starts_at asc
 */
export function buildRows(nameById, attEvents, logged, excludedByMember, events = []) {
  const evtsByMember = {}
  for (const e of attEvents) (evtsByMember[e.user_id] ??= []).push(e)

  const rows = []
  for (const [memberId, evs] of Object.entries(evtsByMember)) {
    const excluded = excludedByMember[memberId]
    for (const s of sessionsFromEvents(evs)) {
      const row = {
        memberId, memberName: nameById[memberId] || '—',
        source: 'attendance',
        category: s.category,
        date: laDateKey(s.inTime.toISOString()),
        inTime: s.inTime, outTime: s.outTime,
        hours: round2(s.ms / 3600000),
        wasCapped: s.wasCapped, manual: !!s.manual, open: s.open,
        review: !!(s.outId && excluded?.has(s.outId)),
        description: '',
      }
      const e = matchEvent(row, events)
      row.eventId = e?.id ?? null
      row.eventTitle = e?.title ?? ''
      rows.push(row)
    }
  }

  for (const l of logged) {
    const row = {
      memberId: l.member_id, memberName: nameById[l.member_id] || '—',
      source: 'logged',
      category: loggedTypeToCategory(l.type),
      date: l.date,
      inTime: null, outTime: null,
      hours: round2(parseFloat(l.hours) || 0),
      wasCapped: false, manual: false, open: false, review: false,
      description: l.description || '',
    }
    const e = matchEvent(row, events)
    row.eventId = e?.id ?? null
    row.eventTitle = e?.title ?? ''
    rows.push(row)
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.memberName.localeCompare(b.memberName)))
  return rows
}

// Filter rows. `categories` is a Set (empty = all); `memberId`/`eventId` null = any.
// from/to are inclusive 'YYYY-MM-DD' strings (null = open-ended).
export function filterRows(rows, { memberId = null, from = null, to = null, categories = null, eventId = null, includeReview = true } = {}) {
  return rows.filter(r => {
    if (memberId && r.memberId !== memberId) return false
    if (from && r.date < from) return false
    if (to && r.date > to) return false
    if (categories && categories.size && !categories.has(r.category)) return false
    if (eventId && r.eventId !== eventId) return false
    if (!includeReview && r.review) return false
    return true
  })
}

// Per-event rollup: category split + total + distinct member count, folding both
// sources. Events with zero matched hours are included so staff see empty ones.
export function rollupByEvent(rows, events) {
  const blank = () => { const o = { total: 0, members: new Set() }; for (const c of CATEGORIES) o[c.key] = 0; return o }
  const byId = {}
  for (const e of events) byId[e.id] = blank()
  for (const r of rows) {
    if (!r.eventId || !byId[r.eventId] || r.review) continue
    byId[r.eventId][r.category] += r.hours
    byId[r.eventId].total += r.hours
    byId[r.eventId].members.add(r.memberId)
  }
  return events.map(e => ({
    event: e,
    ...byId[e.id],
    memberCount: byId[e.id].members.size,
  }))
}

// ── CSV ──────────────────────────────────────────────────────────────────────
const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`
export const EXPORT_HEADERS = [
  'Member', 'Source', 'Category', 'Date', 'Check In', 'Check Out', 'Hours',
  'Capped', 'Manual', 'Review', 'Event', 'Description',
]
export function rowsToCsv(rows) {
  const lines = [EXPORT_HEADERS.map(csvCell).join(',')]
  for (const r of rows) {
    lines.push([
      r.memberName,
      r.source === 'attendance' ? 'Attendance' : 'Logged',
      categoryLabel(r.category),
      r.date,
      r.inTime ? r.inTime.toLocaleString() : '',
      r.open ? '(open)' : (r.outTime ? r.outTime.toLocaleString() : ''),
      r.hours.toFixed(2),
      r.wasCapped ? 'yes' : '',
      r.manual ? 'yes' : '',
      r.review ? 'review' : '',
      r.eventTitle,
      r.description,
    ].map(csvCell).join(','))
  }
  return lines.join('\r\n')
}

// Category totals (+ grand total) for a set of rows (excludes review-flagged).
export function totalsByCategory(rows) {
  const t = { total: 0 }
  for (const c of CATEGORIES) t[c.key] = 0
  for (const r of rows) {
    if (r.review) continue
    t[r.category] = (t[r.category] ?? 0) + r.hours
    t.total += r.hours
  }
  return t
}

// ── Service-hour letter ──────────────────────────────────────────────────────
// Service-relevant categories default to community-service kinds; staff can
// adjust which count via the UI. Letters exclude review-flagged sessions.
export const SERVICE_CATEGORIES = ['volunteer', 'outreach', 'fundraising']

export function letterData(rows, { memberId, memberName, from, to, categories }) {
  const set = new Set(categories)
  const items = filterRows(rows, { memberId, from, to, categories: set, includeReview: false })
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const totals = totalsByCategory(items)
  return { memberName, from, to, categories: [...set], items, totals }
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fmtH = n => (n % 1 === 0 ? `${n}` : n.toFixed(2))

// Self-contained printable HTML for a service-hour verification letter. Rendered
// into a print window by ReportsPage. "Verifiable" = itemized appendix + named
// preparer + generation timestamp + mentor signature line (not cryptographic).
export function letterHtml(data, { preparedBy, generatedAt, team }) {
  const catRows = data.categories
    .filter(k => (data.totals[k] ?? 0) > 0)
    .map(k => `<tr><td>${esc(categoryLabel(k))}</td><td class="num">${fmtH(round2(data.totals[k]))}</td></tr>`)
    .join('')
  const itemRows = data.items.map(r => `
    <tr>
      <td>${esc(r.date)}</td>
      <td>${esc(categoryLabel(r.category))}</td>
      <td>${esc(r.source === 'attendance' ? 'Attendance' : 'Logged')}</td>
      <td class="num">${fmtH(r.hours)}</td>
    </tr>`).join('')

  return `<!doctype html><html><head><meta charset="utf-8"><title>Service Hours — ${esc(data.memberName)}</title>
<style>
  @page { margin: 1in; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #111; line-height: 1.5; font-size: 12pt; }
  .hd { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #111; padding-bottom: 8px; }
  .team { font-size: 15pt; font-weight: 700; }
  .sub { color: #444; font-size: 10pt; }
  h1 { font-size: 16pt; margin: 24px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #ccc; font-size: 11pt; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .totrow td { font-weight: 700; border-top: 2px solid #111; border-bottom: none; }
  .muted { color: #555; font-size: 10pt; }
  .sig { margin-top: 48px; display: flex; gap: 48px; }
  .sig .line { border-top: 1px solid #111; width: 250px; padding-top: 4px; font-size: 10pt; color: #444; }
  .appendix h2 { font-size: 12pt; margin-top: 28px; }
  @media print { .noprint { display: none; } }
</style></head>
<body>
  <div class="hd">
    <div><div class="team">${esc(team.name)}</div><div class="sub">${esc(team.org)}</div></div>
    <div class="sub">Generated ${esc(generatedAt)}</div>
  </div>

  <h1>Service Hours Verification</h1>
  <p>This letter certifies that <strong>${esc(data.memberName)}</strong> contributed the service hours
     summarized below between <strong>${esc(fmtDateLong(data.from))}</strong> and
     <strong>${esc(fmtDateLong(data.to))}</strong> as a member of ${esc(team.name)}.</p>

  <table>
    <thead><tr><th>Category</th><th class="num">Hours</th></tr></thead>
    <tbody>
      ${catRows || '<tr><td colspan="2" class="muted">No service hours in this range.</td></tr>'}
      <tr class="totrow"><td>Total service hours</td><td class="num">${fmtH(round2(data.totals.total))}</td></tr>
    </tbody>
  </table>

  <p class="muted">Hours are drawn from the team's verified attendance records (sign-in/out) and
     mentor-verified logged hours. Sessions exceeding the daily cap or pending review are excluded.
     Prepared by ${esc(preparedBy)}.</p>

  <div class="sig">
    <div class="line">Mentor signature</div>
    <div class="line">Date</div>
  </div>

  <div class="appendix">
    <h2>Itemized record</h2>
    <table>
      <thead><tr><th>Date</th><th>Category</th><th>Source</th><th class="num">Hours</th></tr></thead>
      <tbody>${itemRows || '<tr><td colspan="4" class="muted">No entries.</td></tr>'}</tbody>
    </table>
  </div>

  <p class="noprint muted">Use your browser's Print dialog and choose “Save as PDF.”</p>
</body></html>`
}

// Printable HTML for a filtered data export (table form of the CSV).
export function exportHtml(rows, { title, subtitle, team, generatedAt }) {
  const totals = totalsByCategory(rows)
  const body = rows.map(r => `<tr>
    <td>${esc(r.memberName)}</td><td>${esc(r.source === 'attendance' ? 'Attendance' : 'Logged')}</td>
    <td>${esc(categoryLabel(r.category))}</td><td>${esc(r.date)}</td>
    <td class="num">${fmtH(r.hours)}</td>
    <td>${[r.wasCapped ? 'capped' : '', r.manual ? 'manual' : '', r.review ? 'review' : ''].filter(Boolean).join(', ')}</td>
    <td>${esc(r.eventTitle)}</td>
  </tr>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { margin: 0.6in; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 10pt; }
  h1 { font-size: 14pt; margin: 0 0 2px; } .sub { color: #555; font-size: 9pt; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 3px 6px; border-bottom: 1px solid #ddd; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 700; border-top: 2px solid #111; }
  @media print { .noprint { display: none; } }
</style></head>
<body>
  <h1>${esc(title)}</h1>
  <p class="sub">${esc(team.name)} · ${esc(subtitle)} · generated ${esc(generatedAt)}</p>
  <table>
    <thead><tr><th>Member</th><th>Source</th><th>Category</th><th>Date</th><th class="num">Hours</th><th>Flags</th><th>Event</th></tr></thead>
    <tbody>${body || '<tr><td colspan="7">No rows match the filters.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="4">Total (excl. review)</td><td class="num">${fmtH(round2(totals.total))}</td><td colspan="2"></td></tr></tfoot>
  </table>
  <p class="noprint sub">Use your browser's Print dialog and choose “Save as PDF.”</p>
</body></html>`
}
