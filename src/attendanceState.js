// "Is this member checked in right now?" and "what should a tap on the tag do?",
// decided in ONE place. Read by HomePage (the dashboard YOU tile), CheckinPage
// (the shop tag), VolunteerCheckinPage (the FLL-room tag) and presence.js (the
// board, the glance and the parent view).
//
// Before this module each of those carried its own copy of the rule, every copy
// bounded at device-local midnight and blind to a failed read, and the tag routes
// toggled on every MOUNT. A /checkin page that is shown again (an iOS back-swipe
// from the dashboard its own "VIEW STATUS" link pushed, Chrome iOS reloading an
// evicted tab) therefore wrote a second event: after a check-in it silently
// checked the member OUT, so their real check-out tap later landed on the
// check-in confirm screen. That is the 2026-09-08 report ("every single time I
// try to check out it sent me to the check-in portal"); see
// tests/attendance-state.test.js.
//
// Pure module: no React, no Supabase. Anything that needs the browser takes it
// as an argument (a Storage, a Document), so it is tested in node and safe to
// import from the NFC fast path.

import { MAX_SESSION_MS, laDateKey } from './hoursUtils'

// A second tap inside this window is ignored rather than toggling back.
export const DUPLICATE_WINDOW_MS = 60_000

// How far back a status query must reach to see every event this rule can count:
// all of "today" in Los Angeles (25 h on the fall-back day) plus the session cap.
// 26 h covers both with room, and is what statusWindowStartISO returns.
export const STATUS_LOOKBACK_MS = 26 * 60 * 60 * 1000

// Epoch ms of an attendance_events row, or NaN when its time does not parse.
// PostgREST's "2026-09-08T22:15:03.123456+00:00" parses in V8 and in
// JavaScriptCore (checked under Bun's JSC; the iOS engine is the same family).
export function eventMs(e) {
  return Date.parse(e?.event_time)
}

// The newest event by event_time, whatever order the rows arrive in. A row whose
// time does not parse is skipped rather than allowed to sort anywhere.
export function latestEvent(events) {
  let best = null
  let bestMs = -Infinity
  for (const e of events ?? []) {
    const t = eventMs(e)
    if (Number.isFinite(t) && t > bestMs) { best = e; bestMs = t }
  }
  return best
}

/**
 * The one rule. A member is checked in when their newest event is an 'in' that
 * is either from today (Los Angeles) or still inside the session cap
 * (MAX_SESSION_MS, the same knob the hours math uses for a forgotten
 * check-out). So a session open across midnight is still checked in, a full
 * Saturday past the cap is still checked in, and an IN left open from two days
 * ago is NOT (it is `stale`: a forgotten check-out, closed by the 10 PM job).
 *
 * @param {object[]|null|undefined} events - this member's rows, any order.
 *        null/undefined means the read FAILED, and the answer is unknown.
 * @returns {{ known, checkedIn, since, last, stale }}
 */
export function currentStatus(events, now = Date.now(), { maxOpenMs = MAX_SESSION_MS } = {}) {
  if (events == null) return { known: false, checkedIn: false, since: null, last: null, stale: false }
  const last = latestEvent(events)
  if (!last || last.type !== 'in') return { known: true, checkedIn: false, since: null, last, stale: false }
  const t = eventMs(last)
  // laDateKey: 'YYYY-MM-DD' in Los Angeles, the one copy hoursUtils keeps (proved
  // identical to the one-liner this module used to carry, both 2026 DST days
  // included, in tests/attendance-state.test.js).
  const open = laDateKey(t) === laDateKey(now) || now - t <= maxOpenMs
  return { known: true, checkedIn: open, since: open ? last.event_time : null, last, stale: !open }
}

/**
 * Is a tap now a repeat of the last one? Two clocks, either can say yes:
 * - server age: the newest event's server-stamped time against this device's
 *   clock (unchanged; a phone running BEHIND still reads a fresh event as a
 *   duplicate, since the age comes out negative);
 * - the device's own record of its last tap, device clock against device clock,
 *   so a phone running AHEAD of the server cannot slip a second tap past the
 *   window and silently toggle back.
 */
export function isDuplicateTap(last, now, localTap = null) {
  if (last && now - eventMs(last) < DUPLICATE_WINDOW_MS) return true
  if (localTap) {
    const age = now - localTap.at
    if (age >= 0 && age < DUPLICATE_WINDOW_MS) return true
  }
  return false
}

/**
 * What a tag tap does.
 *   'unknown'            the read failed: say so, write nothing
 *   'duplicate'          a repeat inside the window: show it, write nothing
 *   'check_out'          a FRESH tap with a session open: write the OUT now
 *   'confirm_check_out'  the page was shown AGAIN (revisit): ask, never auto-write
 *   'switch'             volunteer tag over an open non-volunteer session
 *   'check_in'           not checked in: the geofenced confirm screen
 *
 * @param {{ revisit?: boolean, category?: string|null, localTap?: {type, at}|null }} opts
 *        category: the tag's own category (the volunteer tag passes 'volunteer');
 *        an open session of another category becomes 'switch'. The shop tag
 *        passes none and checks out whatever is open, as before.
 */
export function nextNfcAction(events, now = Date.now(), { revisit = false, category = null, localTap = null } = {}) {
  const status = currentStatus(events, now)
  if (!status.known) return { action: 'unknown', status }
  if (isDuplicateTap(status.last, now, localTap)) {
    const fromServer = status.last && now - eventMs(status.last) < DUPLICATE_WINDOW_MS
    const duplicate = fromServer
      ? { type: status.last.type, at: status.last.event_time }
      : { type: localTap.type, at: new Date(localTap.at).toISOString() }
    return { action: 'duplicate', status, duplicate }
  }
  if (status.checkedIn) {
    if (category && status.last.category !== category) return { action: 'switch', status }
    return { action: revisit ? 'confirm_check_out' : 'check_out', status }
  }
  return { action: 'check_in', status }
}

// A receipt screen ("CHECKED IN · 3:15 PM", "CHECKED OUT · 6:00 PM", or the
// amber ALREADY screen) re-read after the tab comes back still tells the truth
// when the member's status agrees with it, and then it stays up rather than
// turning into a prompt. A "CHECKED OUT" left on screen must never become "Tap
// to confirm your check-in" on its own: that reads exactly as the 2026-09-08
// report did. A failed re-read leaves the receipt alone too; it names a past
// event and asks for nothing.
//   next: a nextNfcAction result; receiptType: 'in' | 'out' (what is shown).
export function receiptHolds(next, receiptType) {
  if (receiptType !== 'in' && receiptType !== 'out') return false
  if (next.action === 'unknown') return true
  if (receiptType === 'out') return !next.status.checkedIn
  // The volunteer tag's 'switch' means the open session is not the one shown.
  return next.status.checkedIn && next.action !== 'switch'
}

// Where a team-wide presence query should start so this rule sees everyone it
// would count (a session open across midnight included).
export function statusWindowStartISO(now = Date.now()) {
  return new Date(now - STATUS_LOOKBACK_MS).toISOString()
}

// ── arrival: a fresh tap, or this page shown again ──────────────────────────
// A tag route stamps this into its own history entry (router location.state)
// the moment it has decided what an arrival does. A history entry survives a
// reload, a back/forward and a tab restore with its state; a NEW tag tap is a
// new navigation with no state. So a stamped entry is a revisit and must never
// auto-write.
export const ARRIVAL_HANDLED = Object.freeze({ techmenCheckin: 'handled' })
export function isRevisit(locationState) {
  return locationState?.techmenCheckin === ARRIVAL_HANDLED.techmenCheckin
}

// ── the device's own last tap (skew-free duplicate window) ──────────────────
// Per member, so a phone passed between students never blocks the next one.
// Storage can be missing or throw (private mode, blocked site data); that reads
// as "no record" and the server-age check still applies.
const tapKey = (uid) => `techmen.lastTap.${uid}`

export function readLocalTap(storage, uid) {
  try {
    const raw = storage?.getItem(tapKey(uid))
    if (!raw) return null
    const v = JSON.parse(raw)
    if ((v?.type === 'in' || v?.type === 'out') && Number.isFinite(v.at)) return { type: v.type, at: v.at }
  } catch { /* unreadable: treat as no record */ }
  return null
}

export function recordLocalTap(storage, uid, type, now = Date.now()) {
  try { storage?.setItem(tapKey(uid), JSON.stringify({ type, at: now })) } catch { /* best effort */ }
}

// Run `cb` once the page is actually in front of the member: not while hidden
// (a tab restored in the background) and not while prerendered (Chrome can load
// a likely next URL before it is opened). A tag route's arrival can WRITE, so it
// waits. Returns a cancel function.
export function whenForeground(doc, cb) {
  const ready = () => !doc || (!doc.prerendering && doc.visibilityState !== 'hidden')
  if (ready()) { cb(); return () => {} }
  let done = false
  const stop = () => {
    done = true
    doc.removeEventListener('visibilitychange', check)
    doc.removeEventListener('prerenderingchange', check)
  }
  function check() {
    if (done || !ready()) return
    stop()
    cb()
  }
  doc.addEventListener('visibilitychange', check)
  doc.addEventListener('prerenderingchange', check)
  return stop
}
