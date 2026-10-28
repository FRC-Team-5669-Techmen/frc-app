// Approve all on /verify-hours (feedback c4f9a940, migration 0040). Pure apart
// from the client passed in, so tests/logged-hours-bulk.test.js drives it with
// a stand-in.
//
// The rule the page keeps: nothing is reported approved that the database did
// not change. staff_approve_logged_hours answers the rows it approved (still
// pending AND listed), and before 0040 is pasted the fallback is one direct
// UPDATE with RETURNING, which answers the same rows. Either way the page
// counts what came back, never what it asked for.

import { writeVia } from './writeVia.js'

// "10.5" / "31.25" / "4": hours as a plain number, no trailing zeros.
export function fmtHoursNumber(h) {
  const n = Math.round((Number(h) || 0) * 100) / 100
  return String(n)
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// What the confirmation states, from exactly the entries shown.
export function summarizeEntries(entries) {
  const list = entries ?? []
  const hours = list.reduce((s, e) => s + (Number(e.hours) || 0), 0)
  return {
    ids: list.map((e) => e.id),
    count: list.length,
    hours,
    question: `Approve ${plural(list.length, 'entry', 'entries')}, ${fmtHoursNumber(hours)} ${hours === 1 ? 'hour' : 'hours'}?`,
  }
}

// -> { approvedIds: Set, approvedHours, error }. One round trip either way.
export async function approveAllLoggedHours(client, ids, uid, now = new Date()) {
  const list = [...new Set(ids ?? [])]
  if (!list.length) return { approvedIds: new Set(), approvedHours: 0, error: null }
  const { data, error } = await writeVia(client, 'staff_approve_logged_hours', { p_entries: list },
    { table: 'logged_hours', op: 'update',
      values: { status: 'verified', verified_by: uid, verified_at: now.toISOString() },
      eq: { status: 'pending' }, in: { id: list }, select: 'id, hours' })
  if (error) return { approvedIds: new Set(), approvedHours: 0, error }
  const rows = Array.isArray(data) ? data : []
  // Only ids that were asked for count, so a stray row can never inflate it.
  const asked = new Set(list)
  const approved = rows.filter((r) => asked.has(r.id))
  return {
    approvedIds: new Set(approved.map((r) => r.id)),
    approvedHours: approved.reduce((s, r) => s + (Number(r.hours) || 0), 0),
    error: null,
  }
}

// The result line. `entries` is what was shown when the confirm was tapped;
// `nameOf(entry)` names a member. Every entry not approved is named; the page
// then reloads the pending list, so one still waiting shows there again.
export function bulkResultText(entries, result, nameOf = () => 'Member') {
  const shown = entries ?? []
  if (result.error) {
    const code = result.error.code ? ` (${result.error.code})` : ''
    return { ok: false, text: `Not approved${code}: ${result.error.message ?? 'try again'}. Nothing changed.` }
  }
  const missed = shown.filter((e) => !result.approvedIds.has(e.id))
  const done = `Approved ${plural(result.approvedIds.size, 'entry', 'entries')}, ${fmtHoursNumber(result.approvedHours)} ${result.approvedHours === 1 ? 'hour' : 'hours'}.`
  if (!missed.length) return { ok: true, text: done }
  const who = missed.map((e) => `${nameOf(e)} ${fmtHoursNumber(e.hours)}h`).join(', ')
  return { ok: false, text: `${done} ${missed.length} not approved: ${who}.` }
}
