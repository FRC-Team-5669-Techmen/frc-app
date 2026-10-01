// Per-member capabilities: things an admin grants ONE person on the roster, on
// top of whatever their role already allows. The first is 'events.create'
// (Mr. Pina, 2026-09-03: "I need to be able to give student permissions to
// add events to calendar").
//
// THE DATABASE IS THE AUTHORITY. supabase/migrations/0004_member_permissions.sql
// enforces every rule below in RLS and in the admin RPCs; this module is the
// client's MIRROR of those rules, so the UI only offers what the server will
// accept. If the two ever disagree the server wins and the UI is wrong, which
// is why tests/permissions.test.js reads the migration and fails on drift.
//
// The rules, as 0004 enforces them:
//   - staff (mentor / lead / admin) can already do everything a capability
//     grants; has_capability() is true for them without any grant row;
//   - a holder of 'events.create' may add events as themselves, of any kind,
//     never mandatory;
//   - a holder may edit / delete only events THEY added that are not
//     mandatory (an event staff mark mandatory becomes staff territory);
//   - a holder's event may carry a series_id only if no event in that series
//     was added by anyone else (events_series_is_own). Nothing here mirrors
//     it because nothing in the UI could break it: SchedulePage mints a fresh
//     id for a new series and never sends series_id on an edit;
//   - a grant counts only while the holder's profile is APPROVED. Nothing here
//     mirrors that either: an unapproved account never reaches the app shell
//     (App.jsx shows it the access gate), so no screen that reads these
//     capabilities can render for one;
//   - a revoke takes all of that away at once.
//
// Before 0004 is applied the member_permissions table does not exist; every
// loader here reports that as state 'missing' with NO capabilities, which is
// exactly how the app behaved before this feature (staff unaffected, because
// their rights come from roles, not from this list).
//
// Pure module: no React, no Supabase import. The loaders take the Supabase
// client as an argument so they can be unit-tested with a fake one.

import { isSchemaMissing } from './schemaMissing.js'

export const CAP_EVENTS_CREATE = 'events.create'

// Mirrors the rows 0004 seeds into public.capabilities (key + label must match;
// the test enforces it). A new capability is a new row there AND here.
export const CAPABILITIES = Object.freeze([
  Object.freeze({
    key: CAP_EVENTS_CREATE,
    label: 'Can add calendar events',
    short: 'Adds events',
    hint: 'Add events to the schedule, and edit or delete the ones they added. Cannot mark an event mandatory.',
  }),
])

export const STAFF_ROLES = Object.freeze(['mentor', 'lead', 'admin'])
const ALL_ROLES = Object.freeze(['student', 'mentor', 'lead', 'admin', 'parent'])

// The role list from the hasRole(r) function the pages receive from App.jsx.
export function rolesFrom(hasRole) {
  return typeof hasRole === 'function' ? ALL_ROLES.filter(r => hasRole(r)) : []
}

export function isStaffRoles(roles) {
  return (roles ?? []).some(r => STAFF_ROLES.includes(r))
}

export function capabilityLabel(key) {
  return CAPABILITIES.find(c => c.key === key)?.label ?? key
}

function capSet(capabilities) {
  if (capabilities instanceof Set) return capabilities
  return new Set(Array.isArray(capabilities) ? capabilities : [])
}

// Mirrors public.has_capability(): staff, or a holder. (The database also
// requires the holder's profile to be approved; see the rules above.)
export function hasCapability(roles, capabilities, key) {
  return isStaffRoles(roles) || capSet(capabilities).has(key)
}

export function canCreateEvents(roles, capabilities) {
  return hasCapability(roles, capabilities, CAP_EVENTS_CREATE)
}

// "Mandatory" reminds every active member regardless of RSVP: staff only.
export function canSetMandatory(roles) {
  return isStaffRoles(roles)
}

// Mirrors the "events update/delete own by capability holder" policies.
// `user` is session.user (or a bare id string).
export function canEditEvent(event, user, roles, capabilities) {
  if (!event) return false
  if (isStaffRoles(roles)) return true
  const uid = typeof user === 'string' ? user : user?.id
  if (!uid) return false
  return capSet(capabilities).has(CAP_EVENTS_CREATE)
    && event.created_by === uid
    && event.mandatory !== true
}

// The events of one series this caller may change. For staff that is the whole
// series; for a holder it is only the rows they added -- RLS would silently
// skip the rest (0 rows, no error), so the UI must not count or claim them.
export function editableSeriesEvents(events, seriesId, user, roles, capabilities) {
  if (!seriesId) return []
  return (events ?? []).filter(ev => ev.series_id === seriesId
    && canEditEvent(ev, user, roles, capabilities))
}

// An update/delete that RLS filtered out returns no error and no rows. Only
// meaningful when the request asked for rows back (`.select('id')`).
export function silentlyRefused(res) {
  return !!res && !res.error && Array.isArray(res.data) && res.data.length === 0
}

// A calendar write the server refused, in words a student can act on.
export function eventWriteMessage(error) {
  if (!error) return ''
  if (error.code === '42501') {
    return 'You do not have permission to change that on the calendar. Ask an admin if you think you should.'
  }
  return error.message || 'Could not save the event.'
}

// member_id -> sorted capability keys, from member_permissions rows.
export function grantsByMember(rows) {
  const out = {}
  for (const r of rows ?? []) {
    if (!r?.member_id || !r.capability) continue
    const list = (out[r.member_id] ??= [])
    if (!list.includes(r.capability)) list.push(r.capability)
  }
  for (const list of Object.values(out)) list.sort()
  return out
}

// The signed-in member's own capability keys. Never throws.
//   state 'ok'      -- loaded (possibly none)
//   state 'missing' -- 0004 not applied yet: no capabilities, today's behaviour
//   state 'error'   -- anything else: also no capabilities (fail closed; the
//                      server refuses a non-holder regardless of what the UI shows)
export async function loadMyCapabilities(client, memberId) {
  if (!client || !memberId) return { capabilities: [], state: 'ok', error: null }
  try {
    const { data, error } = await client
      .from('member_permissions')
      .select('capability')
      .eq('member_id', memberId)
    if (error) return { capabilities: [], state: isSchemaMissing(error) ? 'missing' : 'error', error }
    const caps = [...new Set((data ?? []).map(r => r.capability).filter(Boolean))].sort()
    return { capabilities: caps, state: 'ok', error: null }
  } catch (e) {
    return { capabilities: [], state: 'error', error: e }
  }
}

// Every grant, for the admin roster (staff may read all rows). Never throws.
export async function loadAllGrants(client) {
  try {
    const { data, error } = await client
      .from('member_permissions')
      .select('member_id, capability, granted_at')
    if (error) return { byMember: {}, state: isSchemaMissing(error) ? 'missing' : 'error', error }
    return { byMember: grantsByMember(data), state: 'ok', error: null }
  } catch (e) {
    return { byMember: {}, state: 'error', error: e }
  }
}

// Grant or revoke through the admin RPCs (never a direct table write: those
// are revoked, and would raise 42501). Never throws.
//   state 'ok' | 'missing' (0004 not applied) | 'denied' (not an admin) | 'error'
export async function setCapability(client, memberId, key, grant) {
  const fn = grant ? 'admin_grant_capability' : 'admin_revoke_capability'
  try {
    const { error } = await client.rpc(fn, { p_member: memberId, p_capability: key })
    if (!error) return { ok: true, state: 'ok', error: null }
    if (isSchemaMissing(error)) return { ok: false, state: 'missing', error }
    if (error.code === '42501') return { ok: false, state: 'denied', error }
    return { ok: false, state: 'error', error }
  } catch (e) {
    return { ok: false, state: 'error', error: e }
  }
}
