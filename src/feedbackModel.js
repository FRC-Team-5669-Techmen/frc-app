// The feedback system's rules, in one place: the status vocabulary and how the
// pre-0002 one maps onto it, the report types, the insert ladder that keeps a
// report saving while migration 0002 waits to be pasted, the console's
// filters, and the arithmetic of a bulk status move and its undo.
//
// Pure module: no React, no Supabase client. The widget (src/FeedbackWidget.jsx)
// and the console (src/FeedbackPage.jsx) own the state and the network calls;
// everything they decide is decided here, so it is unit-tested in
// tests/feedback-model.test.js without a browser or a database.
//
// THE VOCABULARY IS ALSO WRITTEN IN SQL, by hand, in
// supabase/migrations/0002_feedback_console.sql (the status CHECK and the two
// RPCs). tests/feedback-model.test.js reads that file and fails if the two
// lists stop agreeing -- the same guard tests/vocabulary-drift.test.js keeps on
// subteams and hour categories.

import { isMissingColumn } from './schemaMissing.js'
import { displayName } from './names.js'

// ── Statuses ─────────────────────────────────────────────────────────────────
// The order is the order a report moves through triage, and the order the
// console's tabs read in. `spam` is a status, not a delete: the table has no
// delete grant for anyone, and a report marked spam can be moved back.
export const STATUSES = Object.freeze(['new', 'seen', 'in_progress', 'done', 'wont_do', 'spam'])

export const STATUS_LABEL = Object.freeze({
  new:         'New',
  seen:        'Seen',
  in_progress: 'In progress',
  done:        'Done',
  wont_do:     "Won't do",
  spam:        'Spam',
})

// The vocabulary supabase/feedback.sql shipped with. Migration 0002 maps every
// stored row onto the new one IN PLACE (open -> new, reviewed -> seen,
// dismissed -> wont_do) and keeps all three legal in the CHECK, because the
// console deployed before 0002 still writes them until the new client ships.
// Reading always goes through normStatus, so a legacy value written after the
// migration still lands in the right tab.
export const LEGACY_STATUSES = Object.freeze(['open', 'reviewed', 'dismissed'])

export const LEGACY_TO_STATUS = Object.freeze({
  open:      'new',
  reviewed:  'seen',
  dismissed: 'wont_do',
})

// What the console writes for a canonical status while 0002 is NOT applied,
// when the old CHECK admits only the three legacy values. A status with no
// legacy spelling (in progress, done, spam) cannot be written until then.
export const STATUS_TO_LEGACY = Object.freeze({
  new:     'open',
  seen:    'reviewed',
  wont_do: 'dismissed',
})

// Every value the 0002 CHECK admits. Asserted against the SQL file.
export const STORED_STATUSES = Object.freeze([...STATUSES, ...LEGACY_STATUSES])

export function normStatus(status) {
  if (STATUSES.includes(status)) return status
  return LEGACY_TO_STATUS[status] ?? status
}

export function statusLabel(status) {
  const s = normStatus(status)
  return STATUS_LABEL[s] ?? String(status ?? '')
}

// The statuses the console can move a report to, given whether 0002 is live.
export function statusesFor(migrated) {
  return migrated ? STATUSES : STATUSES.filter(s => s in STATUS_TO_LEGACY)
}

// ── Types ────────────────────────────────────────────────────────────────────
// The widget offers two types and neither is required: Mr. Pina reported on
// 2026-09-03 that he should be able to send feedback without picking one. A
// report with no type is stored as NULL once 0002 is applied, and as the old
// neutral 'feedback' before it (the ladder below). Both read as "General".
export const REPORT_TYPES = Object.freeze([
  { key: 'bug',  label: 'Bug',  hint: 'something is broken or looks wrong' },
  { key: 'idea', label: 'Idea', hint: 'something new, or something to change' },
])

export const TYPE_LABEL = Object.freeze({ bug: 'Bug', idea: 'Idea', general: 'General' })

export function typeOf(row) {
  const c = row?.category
  return c === 'bug' || c === 'idea' ? c : 'general'
}

// ── What a report carries ────────────────────────────────────────────────────
// Caps mirrored from 0002's CHECK constraints. The database is the boundary;
// these exist so a person is told before the request rather than by a
// constraint violation afterwards.
export const TRIED_MAX = 4000
export const BUILD_MAX = 64

// The row the widget inserts, in its widest (post-0002) shape. `tried` is
// omitted entirely when empty rather than sent as null, so a report with
// nothing to say there names no column it does not need.
export function buildReport({
  memberId, type = null, message, tried = '', imagePaths = [],
  route = null, viewport = null, userAgent = null, build = null,
}) {
  const t = (tried ?? '').trim()
  const b = (build ?? '').trim().slice(0, BUILD_MAX)
  const payload = {
    member_id:   memberId,
    category:    type === 'bug' || type === 'idea' ? type : null,
    message:     (message ?? '').trim(),
    image_paths: imagePaths,
    route,
    viewport,
    user_agent:  userAgent,
  }
  if (t) payload.tried = t
  if (b) payload.build = b
  return payload
}

// Before 0002 there is no `tried` or `build` column, and naming one fails the
// WHOLE insert. Neither answer is allowed to be lost, so both are folded into
// the message under labels the console and an export both read plainly.
export function foldIntoMessage(message, { tried, build } = {}) {
  let out = (message ?? '').trim()
  const t = (tried ?? '').trim()
  if (t) out += `\n\nWhat I tried:\n${t}`
  const b = (build ?? '').trim()
  if (b) out += `\n\nBuild: ${b}`
  return out
}

// THE LADDER. Given the payload that was just refused and the error it was
// refused with, the next payload to try -- or null when nothing here can help
// and the error is the answer. Matched on the error CODE, never the message
// (src/schemaMissing.js), so a runtime error that happens to mention a column
// can never send a report down a path nobody chose.
//
//   PGRST204 / 42703  a column 0002 adds is missing: fold tried + build into
//                     the message and resend without them.
//   23502 / 23514     the pre-0002 NOT NULL / CHECK on category refused a
//                     report with no type: resend with the old neutral
//                     'feedback', and say nothing to the person, who chose no
//                     type and still has none in any sense they can see.
export function nextAttempt(payload, error) {
  if (!payload || !error) return null
  if (isMissingColumn(error) && ('tried' in payload || 'build' in payload)) {
    const { tried, build, ...rest } = payload
    return {
      reason: 'columns',
      payload: { ...rest, message: foldIntoMessage(rest.message, { tried, build }) },
    }
  }
  if ((error.code === '23502' || error.code === '23514') && payload.category == null) {
    return { reason: 'type', payload: { ...payload, category: 'feedback' } }
  }
  return null
}

// Run the ladder. `insert(payload)` resolves to `{ error }` (supabase-js shape)
// and is injected, so this is tested against a fake that refuses exactly the
// way PostgREST does. Three rungs at most: wide, without the new columns, and
// without the new columns AND with the neutral type.
export async function submitReport(insert, payload, { maxAttempts = 3 } = {}) {
  const steps = []
  let current = payload
  for (let i = 0; i < maxAttempts; i += 1) {
    const { error } = (await insert(current)) ?? {}
    if (!error) return { error: null, payload: current, steps }
    const next = nextAttempt(current, error)
    if (!next) return { error, payload: current, steps }
    steps.push(next.reason)
    current = next.payload
  }
  return { error: { code: 'ladder', message: 'Could not send that. Try again.' }, payload: current, steps }
}

// ── Context shown with a report ──────────────────────────────────────────────
// The user agent reduced to "Browser on Platform". The full string is stored
// and exported verbatim; this is only what a person reads at a glance.
export function summarizeUserAgent(ua) {
  const s = String(ua ?? '')
  if (!s.trim()) return null
  let browser = null
  if (/Edg(e|A|iOS)?\//.test(s)) browser = 'Edge'
  else if (/OPR\//.test(s)) browser = 'Opera'
  else if (/SamsungBrowser\//.test(s)) browser = 'Samsung Internet'
  else if (/(Firefox|FxiOS)\//.test(s)) browser = 'Firefox'
  else if (/(Chrome|CriOS)\//.test(s)) browser = 'Chrome'
  else if (/Version\/[\d.]+.*Safari\//.test(s)) browser = 'Safari'
  let platform = null
  if (/iPhone|iPad|iPod/.test(s)) platform = 'iOS'
  else if (/Android/.test(s)) platform = 'Android'
  else if (/CrOS/.test(s)) platform = 'ChromeOS'
  else if (/Windows/.test(s)) platform = 'Windows'
  else if (/Mac OS X|Macintosh/.test(s)) platform = 'macOS'
  else if (/Linux/.test(s)) platform = 'Linux'
  if (browser && platform) return `${browser} on ${platform}`
  return browser ?? platform ?? 'unrecognised browser'
}

// ── Time, always America/Los_Angeles ─────────────────────────────────────────
const TZ = 'America/Los_Angeles'

export function fmtLA(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' })
}

// Wall-clock parts in Los Angeles, for the zip's entry times and file names.
export function laParts(date) {
  const d = date instanceof Date ? date : new Date(date)
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]))
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: +p.hour, minute: +p.minute, second: +p.second,
  }
}

// "2026-10-01 16:19" in Los Angeles: the form a person matches a report by.
export function laMinute(iso) {
  const p = laParts(iso)
  const z = n => String(n).padStart(2, '0')
  return `${p.year}-${z(p.month)}-${z(p.day)} ${z(p.hour)}:${z(p.minute)}`
}

// "2026-10-01-1405": sortable, safe in a file name.
export function exportStamp(date) {
  const p = laParts(date)
  const z = n => String(n).padStart(2, '0')
  return `${p.year}-${z(p.month)}-${z(p.day)}-${z(p.hour)}${z(p.minute)}`
}

// ── Filters ──────────────────────────────────────────────────────────────────
// The console opens on New: what has not been looked at yet is the question it
// is opened to answer. 'all' on any facet means that facet is off.
export const DEFAULT_FILTER = Object.freeze({
  status:   'new',
  type:     'all',
  route:    'all',
  reporter: 'all',
  shots:    'any',
  q:        '',
})

export function imagePathsOf(row) {
  return Array.isArray(row?.image_paths) ? row.image_paths : []
}

export function reporterName(row) {
  return displayName(row?.author)
}

export function filterReports(rows, filter = DEFAULT_FILTER) {
  const f = { ...DEFAULT_FILTER, ...filter }
  const needle = (f.q ?? '').trim().toLowerCase()
  return (rows ?? []).filter(r => {
    if (f.status !== 'all' && normStatus(r.status) !== f.status) return false
    if (f.type !== 'all' && typeOf(r) !== f.type) return false
    if (f.route !== 'all' && (r.route || '') !== f.route) return false
    if (f.reporter !== 'all' && r.member_id !== f.reporter) return false
    if (f.shots !== 'any') {
      const has = imagePathsOf(r).length > 0
      if (f.shots === 'with' && !has) return false
      if (f.shots === 'without' && has) return false
    }
    if (needle) {
      const hay = [r.message, r.tried, r.route, reporterName(r)]
        .map(v => (v ?? '').toLowerCase())
      if (!hay.some(v => v.includes(needle))) return false
    }
    return true
  })
}

// Distinct values for the route and reporter pickers, each with a count over
// the loaded rows, so a picker never offers a value that matches nothing.
export function facetOptions(rows) {
  const routes = new Map()
  const reporters = new Map()
  for (const r of rows ?? []) {
    const route = r.route || ''
    routes.set(route, (routes.get(route) ?? 0) + 1)
    const prev = reporters.get(r.member_id)
    reporters.set(r.member_id, { id: r.member_id, name: reporterName(r), count: (prev?.count ?? 0) + 1 })
  }
  return {
    routes: [...routes.entries()]
      .map(([route, count]) => ({ route, count }))
      .sort((a, b) => a.route.localeCompare(b.route)),
    reporters: [...reporters.values()]
      .sort((a, b) => a.name.localeCompare(b.name) || String(a.id).localeCompare(String(b.id))),
  }
}

export function statusCounts(rows) {
  const c = Object.fromEntries(STATUSES.map(s => [s, 0]))
  for (const r of rows ?? []) {
    const s = normStatus(r.status)
    c[s] = (c[s] ?? 0) + 1
  }
  return c
}

// The filter in words, for an export header: an export says what it is an
// export OF. A reporter is described by name only when names travel with the
// export; otherwise the header says a reporter filter was on and no more.
export function describeFilter(filter, { reporterLabel, names = true } = {}) {
  const f = { ...DEFAULT_FILTER, ...filter }
  const parts = [
    `status ${f.status === 'all' ? 'any' : STATUS_LABEL[f.status] ?? f.status}`,
    `type ${f.type === 'all' ? 'any' : TYPE_LABEL[f.type] ?? f.type}`,
    `route ${f.route === 'all' ? 'any' : f.route || '(none recorded)'}`,
  ]
  if (f.reporter !== 'all') {
    parts.push(names && reporterLabel ? `reporter ${reporterLabel}` : 'one reporter (name withheld)')
  } else {
    parts.push('reporter any')
  }
  if (f.shots !== 'any') parts.push(f.shots === 'with' ? 'with screenshots' : 'without screenshots')
  if ((f.q ?? '').trim()) parts.push(`search "${f.q.trim()}"`)
  return parts.join('; ')
}

// ── Bulk status move and its undo ────────────────────────────────────────────
// A report as a person recognises it: where it came from, then the opening of
// what they wrote. Flattened and capped so a confirmation line stays one line.
export function reportLabel(row) {
  const flat = String(row?.message ?? '').replace(/\s+/g, ' ').trim()
  const excerpt = flat.length > 48 ? `${flat.slice(0, 45)}...` : flat
  const route = row?.route || '(no route)'
  return excerpt ? `${route} "${excerpt}"` : route
}

const NAME_LIMIT = 5
function nameList(rows) {
  const named = rows.slice(0, NAME_LIMIT).map(reportLabel)
  const rest = rows.length - named.length
  return rest > 0 ? `${named.join('; ')} (and ${rest} more)` : named.join('; ')
}

// What feedback_set_status hands back is one row per report it CHANGED, with
// the status and triage stamp it had before. The undo restores exactly those.
// A report whose previous status already reads as the target (a legacy 'open'
// moved to New) is left out: putting it "back" changes nothing anyone can see.
// Null when nothing is left, so no Undo is offered whose only outcome is
// nothing.
export function undoFrom(target, changed) {
  const items = []
  for (const c of changed ?? []) {
    if (!c?.id) continue
    if (normStatus(c.previous_status) === target) continue
    items.push({
      id:          c.id,
      status:      c.previous_status,
      reviewed_by: c.previous_reviewed_by ?? null,
      reviewed_at: c.previous_reviewed_at ?? null,
    })
  }
  return items.length ? { target, items } : null
}

export function undoLabel(undo) {
  const back = [...new Set((undo?.items ?? []).map(i => normStatus(i.status)))]
  return back.length === 1 ? `Undo: back to ${STATUS_LABEL[back[0]] ?? back[0]}` : 'Undo: back to where they were'
}

// Apply a move to the console's local rows the way the database applied it.
export function applyMove(rows, changedIds, status, { uid = null, at = null } = {}) {
  const ids = new Set(changedIds)
  return (rows ?? []).map(r => {
    if (!ids.has(r.id)) return r
    return status === 'new'
      ? { ...r, status, reviewed_by: null, reviewed_at: null, reviewer: null }
      : { ...r, status, reviewed_by: uid, reviewed_at: at }
  })
}

// Apply an undo: each restored row gets back exactly what it had.
export function applyRestore(rows, items, restoredIds) {
  const ok = new Set(restoredIds)
  const byId = new Map((items ?? []).map(i => [i.id, i]))
  return (rows ?? []).map(r => {
    if (!ok.has(r.id)) return r
    const i = byId.get(r.id)
    return i ? { ...r, status: i.status, reviewed_by: i.reviewed_by, reviewed_at: i.reviewed_at } : r
  })
}

// What a move says afterwards. It always names WHICH reports moved, and names
// the ones that did not, because the next thing anybody does after a partial
// result is press the button again over the same selection.
export function moveSummary(status, requested, changedIds) {
  const changed = new Set(changedIds)
  const moved = requested.filter(r => changed.has(r.id))
  const already = requested.filter(r => !changed.has(r.id) && normStatus(r.status) === status)
  const missing = requested.filter(r => !changed.has(r.id) && normStatus(r.status) !== status)
  const label = STATUS_LABEL[status] ?? status
  const parts = []
  parts.push(moved.length
    ? `Moved ${moved.length} report${moved.length === 1 ? '' : 's'} to ${label}: ${nameList(moved)}.`
    : `Nothing moved to ${label}.`)
  if (already.length) parts.push(`${already.length} already ${already.length === 1 ? 'was' : 'were'} ${label}.`)
  if (missing.length) {
    parts.push(`${missing.length} did not move (no longer in the inbox, or changed by someone else): ${nameList(missing)}. Refresh before trying again.`)
  }
  return parts.join(' ')
}

export function undoSummary(undo, restoredIds, rows) {
  const ok = new Set(restoredIds)
  const byId = new Map((rows ?? []).map(r => [r.id, r]))
  const back = undo.items.filter(i => ok.has(i.id)).map(i => byId.get(i.id) ?? { id: i.id })
  const stuck = undo.items.filter(i => !ok.has(i.id)).map(i => byId.get(i.id) ?? { id: i.id })
  const label = STATUS_LABEL[undo.target] ?? undo.target
  const parts = [back.length
    ? `Undid the move to ${label}: ${back.length} report${back.length === 1 ? '' : 's'} back where ${back.length === 1 ? 'it was' : 'they were'}.`
    : `Nothing was undone; the move to ${label} stands.`]
  if (stuck.length) {
    parts.push(`${stuck.length} did not go back because ${stuck.length === 1 ? 'it was' : 'they were'} changed again since: ${nameList(stuck)}.`)
  }
  return parts.join(' ')
}
