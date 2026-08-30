// Shared duration math for resolving an attendance anomaly whose fix is "this
// check-in is missing its check-out". Used by BOTH resolve surfaces — the
// per-member EventRow block in MemberHoursAdmin.jsx and the inline anomaly cards
// on VerifyHoursPage.jsx — so the two cannot drift apart.
//
// Pure: no React, no Supabase, no I/O. It computes values; the call site owns
// the state and the staff_add_event / staff_void_event RPCs.
//
// THE CANONICAL MODEL IS AN OFFSET IN MINUTES FROM THE CHECK-IN, and `null`
// means NOTHING ENTERED. That is not a formatting detail — it is the
// no-pre-filled-timestamp rule expressed in the type: there is no zero-ish
// starting instant to render, so a caller cannot accidentally show one. Every
// non-null value here is the result of a click or a keystroke the caller made.

export const STEP_MINUTES = 30

// The durations a session actually tends to be, one click each. A preset SETS
// the offset outright rather than adding to it (see setPreset) — chaining a
// preset onto a run of fine adjusts is the confusing behaviour, not the useful
// one; replacing is what typing a new value would do.
export const DURATION_PRESETS = [30, 60, 90, 120, 150, 180]

// "1h 30m" / "45m" / "2h". Minutes in, no rounding surprises.
export function fmtSpanMins(mins) {
  const h = Math.floor(mins / 60), m = mins % 60
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`
}

// Fine adjust. `cur` is the current offset in minutes or null (nothing entered);
// stepping down to or past the check-in returns null rather than 0, so the low
// end is a real undo back to nothing-entered and a zero-length session is
// unreachable. The high end is deliberately unclamped: an implausibly long
// session is still a thing that can have happened, and staff can see the readout.
export function stepMinutes(cur, deltaMin) {
  const next = (cur ?? 0) + deltaMin
  return next <= 0 ? null : next
}

// A preset replaces whatever offset was there. Guarded the same way as
// stepMinutes so no caller can install a non-positive length.
export function setPreset(mins) {
  return mins > 0 ? mins : null
}

// The absolute check-out instant for an offset, or null while nothing is
// entered. This is the ONLY place an offset becomes a timestamp.
export function endInstantMs(inMs, mins) {
  return mins == null ? null : inMs + mins * 60000
}

// Derive the offset from an absolute instant — the bridge for a caller whose
// state is a datetime field rather than an offset (EventRow keeps its
// datetime-local fallback as the source of truth, so it converts each render).
export function minutesFromInstant(inMs, outMs) {
  if (outMs == null) return null
  const mins = Math.round((outMs - inMs) / 60000)
  return mins <= 0 ? null : mins
}

const fmtClock = ms => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const fmtDayShort = ms => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const sameLocalDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()

// The line under the stepper: "Session length: 1h 30m — ending 9:30 AM", with
// the date named too when the check-out lands on a different day, since a
// stepped session can cross midnight and "1:00 AM" alone would be ambiguous.
export function resolveReadout(inMs, mins) {
  const outMs = endInstantMs(inMs, mins)
  if (outMs == null) return 'No check-out entered'
  return `Session length: ${fmtSpanMins(mins)} — ending ${fmtClock(outMs)}`
    + (sameLocalDay(outMs, inMs) ? '' : `, ${fmtDayShort(outMs)}`)
}
