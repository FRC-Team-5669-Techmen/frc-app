// The IDEA certifications mirror, read side (/certifications).
//
// IDEA Classroom (ideabosco.com) is the ONE official record: certifications
// are awarded there and only there, and this app receives a one-way copy
// through idea_cert_sync() (supabase/migrations/0001_idea_certifications_mirror.sql,
// contract in docs/IDEA_CERTIFICATIONS_SYNC.md). Everything the page derives
// from that copy lives here, so it is unit-tested (tests/idea-certs.test.js).
//
// Pure module: no React, no Supabase import.
//
// THE ONE RULE THIS FILE EXISTS TO HOLD: only an ACTIVE row whose expiry has
// not passed counts as held. Suspended, revoked and expired rows are shown as
// what they are and are never counted -- not in a holder count, not in "your
// certifications held", not anywhere. An 'active' row whose expires_at has
// passed reads as expired even before IDEA Classroom resyncs it, because the
// mirror can lag and a lapsed certification must not look current.

import { isSchemaMissing } from './schemaMissing.js'

export const CERT_STATUSES = Object.freeze(['active', 'suspended', 'revoked', 'expired'])

const STATUS_LABELS = Object.freeze({
  active: 'Active',
  suspended: 'Suspended',
  revoked: 'Revoked',
  expired: 'Expired',
})

// Display order inside a holder list: held first, then the states a mentor
// most needs to see.
const STATUS_RANK = Object.freeze({ active: 0, suspended: 1, expired: 2, revoked: 3 })

// The page's column lists. Named here rather than inline so
// tests/idea-certs-contract.test.js can hold them against the migration: a
// typo would come back as 42703, which isSchemaMissing() reads as "not set up
// yet", and the page would sit on the calm line forever instead of failing.
export const CATALOG_SELECT =
  'code, name, level, category, definition, allows, does_not_allow, prerequisites, renewal, active, sort_order, synced_at'
export const HOLDER_SELECT =
  'serial, email, holder_name, code, status, awarded_at, awarded_by_name, expires_at, synced_at'
export const SYNC_LOG_SELECT =
  'id, received_at, source_revision, catalog_count, holder_count, ok, error'

// The plain line for both "the migration is not applied" and "applied, but no
// sync has arrived". To a member those are the same fact.
export const NOT_SYNCED_LINE =
  'Certifications are awarded in IDEA Classroom. None have synced to this app yet.'

// The mirror is keyed by lowercased email (the CHECK on idea_cert_holders).
// A session email is lowercased the same way before it is compared.
export function normEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

function timeOf(iso) {
  if (!iso) return NaN
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : NaN
}

// The status to SHOW. 'unknown' for anything outside the four legal values,
// which the database CHECK forbids but a client should not trust blindly.
export function effectiveStatus(holder, now = Date.now()) {
  const s = holder?.status
  if (!CERT_STATUSES.includes(s)) return 'unknown'
  if (s === 'active') {
    const exp = timeOf(holder.expires_at)
    if (Number.isFinite(exp) && exp <= now) return 'expired'
  }
  return s
}

export function isHeld(holder, now = Date.now()) {
  return effectiveStatus(holder, now) === 'active'
}

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? 'Unknown'
}

// Which of the three views the page renders. Same resolution as the rest of
// the app: a parent who is also staff is staff; parent-only is the parent view.
export function viewModeFor({ isStaff = false, isParent = false } = {}) {
  if (isStaff) return 'staff'
  if (isParent) return 'parent'
  return 'member'
}

// What the page should render, from the two mirror queries.
//   'error'       a real failure (permission, network) -- shown as a fault
//   'not_set_up'  the migration has not been applied (tables missing)
//   'not_synced'  applied, but the catalog is empty: no sync has arrived
//   'ready'
// not_set_up and not_synced render the same plain line; they are separate
// states so a test (and data-state on the page) can tell which one it was.
export function resolvePageState({ catalogError = null, holdersError = null, catalog = [] } = {}) {
  if (isSchemaMissing(catalogError) || isSchemaMissing(holdersError)) return 'not_set_up'
  if (catalogError || holdersError) return 'error'
  if (!Array.isArray(catalog) || catalog.length === 0) return 'not_synced'
  return 'ready'
}

function compareCerts(a, b) {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0)
    || (a.level ?? 0) - (b.level ?? 0)
    || String(a.code).localeCompare(String(b.code))
}

// Catalog grouped by category. Within a category: IDEA's sort_order, then
// level, then code. Categories are ordered by their earliest certification,
// so IDEA's sort_order decides the page from top to bottom.
export function groupCatalog(catalog = []) {
  const byCat = new Map()
  for (const c of [...catalog].sort(compareCerts)) {
    const key = c.category || 'Uncategorized'
    if (!byCat.has(key)) byCat.set(key, [])
    byCat.get(key).push(c)
  }
  return [...byCat.entries()]
    .map(([category, certs]) => ({ category, certs }))
    .sort((a, b) => compareCerts(a.certs[0], b.certs[0]) || a.category.localeCompare(b.category))
}

// code -> number of distinct people who HOLD it right now. A person with two
// active serials for one code (re-awarded) counts once.
export function holderCounts(holders = [], now = Date.now()) {
  const sets = new Map()
  for (const h of holders) {
    if (!isHeld(h, now)) continue
    if (!sets.has(h.code)) sets.set(h.code, new Set())
    sets.get(h.code).add(normEmail(h.email))
  }
  const out = new Map()
  for (const [code, set] of sets) out.set(code, set.size)
  return out
}

function decorate(h, now) {
  const effective = effectiveStatus(h, now)
  return { ...h, effective, held: effective === 'active' }
}

function compareHolderRows(a, b) {
  return (STATUS_RANK[a.effective] ?? 9) - (STATUS_RANK[b.effective] ?? 9)
    || String(a.holder_name ?? '').localeCompare(String(b.holder_name ?? ''))
    || timeOf(b.awarded_at) - timeOf(a.awarded_at)
    || String(a.serial).localeCompare(String(b.serial))
}

// Every row for one certification, decorated with its effective status.
export function holdersFor(code, holders = [], now = Date.now()) {
  return holders.filter(h => h.code === code).map(h => decorate(h, now)).sort(compareHolderRows)
}

// The signed-in member's own rows, matched by lowercased email and nothing
// else (the mirror has no member id: a holder need not have an account here).
export function ownCertifications(holders = [], email, now = Date.now()) {
  const me = normEmail(email)
  if (!me) return []
  return holders
    .filter(h => normEmail(h.email) === me)
    .map(h => decorate(h, now))
    .sort((a, b) => (STATUS_RANK[a.effective] ?? 9) - (STATUS_RANK[b.effective] ?? 9)
      || timeOf(b.awarded_at) - timeOf(a.awarded_at)
      || String(a.code).localeCompare(String(b.code)))
}

// The parent view: RLS has already narrowed the holders to the parent's
// linked students, so this only groups what came back, one block per person.
export function groupByHolder(holders = [], now = Date.now()) {
  const byEmail = new Map()
  for (const h of holders) {
    const key = normEmail(h.email)
    if (!byEmail.has(key)) byEmail.set(key, { email: key, name: h.holder_name, rows: [] })
    byEmail.get(key).rows.push(decorate(h, now))
  }
  return [...byEmail.values()]
    .map(g => ({
      ...g,
      rows: g.rows.sort((a, b) => (STATUS_RANK[a.effective] ?? 9) - (STATUS_RANK[b.effective] ?? 9)
        || String(a.code).localeCompare(String(b.code))),
      heldCount: g.rows.filter(r => r.held).length,
    }))
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))
}

// Staff-only sync readout from idea_cert_sync_log rows (any order).
//   lastOk       the most recent accepted snapshot, or null
//   lastAttempt  the most recent row of either kind, or null
//   failing      true when the most recent attempt was refused
export function syncSummary(logRows = []) {
  const rows = [...logRows].sort((a, b) => timeOf(b.received_at) - timeOf(a.received_at))
  const lastAttempt = rows[0] ?? null
  const lastOk = rows.find(r => r.ok === true) ?? null
  return { lastOk, lastAttempt, failing: !!lastAttempt && lastAttempt.ok !== true }
}

// Dates in America/Los_Angeles, the team's zone.
export function fmtDate(iso) {
  const t = timeOf(iso)
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: 'short', day: 'numeric',
  })
}

export function fmtDateTime(iso) {
  const t = timeOf(iso)
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short',
  })
}
