// Everything My Hours shows, computed in one place. Pure (no React, no
// Supabase): MyHoursPage loads the rows and renders what this returns, so the
// numbers on the page can be driven by tests/my-hours-model.test.js through the
// exact code path the page runs.
//
// ONE DERIVATION. `sessionsFromEvents` runs once; every session row the page
// lists carries whether it counts (`counted`) and why not (`pending`/`voided`),
// and every hour total on the page -- By category, By season, All Time, This
// Week, the 6-week trend, the season goal, the pending notice -- is summed from
// those same rows (plus verified logged hours and staff adjustments, which the
// page states separately). The by-category card used to come from a second,
// private pairing in buildBreakdown that split sessions at 00:00 UTC and lost
// every one that crossed it; see tests/my-hours-model.test.js.
import { breakdownFromSessions, isSessionCounted, laDateKey, laMidnightMs, sumBreakdown, sessionsFromEvents } from './hoursUtils'
import { weeklyHours, weekRange } from './weeklyHours'
import { effectiveGoal, goalCategoryKeys, hoursTowardGoal, daysPresent } from './accountability'

// The instant a Los Angeles calendar date begins. Logged hours carry a date,
// not a time; the trend places them at the start of that shop-local day, which
// is what a phone in the shop did when this read `new Date(date + 'T00:00:00')`
// in the browser's zone. It lives beside laDateKey in hoursUtils now (the
// activity feed's "today" reads it too) and is re-exported for this module's
// existing importers.
export { laMidnightMs }

/**
 * @param {object}   rows
 * @param {object[]} rows.seasons      - seasons rows
 * @param {object[]} rows.events       - this member's attendance_events
 * @param {object[]} rows.logged       - this member's VERIFIED logged_hours
 * @param {object[]} rows.reviews      - this member's session_reviews (pending/voided)
 * @param {object[]} rows.goals        - hour_goals rows (team default + own override)
 * @param {object[]} rows.adjustments  - this member's hour_adjustments
 * @param {object[]} rows.corrections  - this member's session_corrections
 * @param {string}   rows.memberId
 * @param {number}   [rows.now]        - the clock, ms
 */
export function myHoursModel({ seasons, events, logged, reviews, goals = [], adjustments = [], corrections = [], memberId, now = Date.now() }) {
  // Checkout IDs excluded from official hours: a pending or voided review.
  const reviewOf = new Map()
  for (const r of reviews) {
    if (r.status === 'pending' || r.status === 'voided') reviewOf.set(r.checkout_id, r.status)
  }
  const excludedIds = new Set(reviewOf.keys())

  // Checkout/checkin IDs that already have an open (pending) correction request.
  const flaggedIds = new Set()
  for (const c of corrections) {
    if (c.status !== 'pending') continue
    if (c.checkin_id)  flaggedIds.add(c.checkin_id)
    if (c.checkout_id) flaggedIds.add(c.checkout_id)
  }

  // The rows. Chronological, every derived session, each marked with whether it
  // counts toward the totals below.
  const sessions = sessionsFromEvents(events).map(s => {
    const status = s.outId ? reviewOf.get(s.outId) : undefined
    return {
      ...s,
      counted: isSessionCounted(s, excludedIds),
      pending: status === 'pending',
      voided:  status === 'voided',
      flagged: !!((s.inId && flaggedIds.has(s.inId)) || (s.outId && flaggedIds.has(s.outId))),
    }
  })
  const counted = sessions.filter(s => s.counted)

  // Per season, then all time, from those rows + verified logged + adjustments.
  const breakdown = breakdownFromSessions(seasons, sessions, logged, excludedIds, adjustments)
  const allTime = sumBreakdown(breakdown)

  // The pending notice names the rows marked for review.
  const pendingRows = sessions.filter(s => s.pending)
  const pendingMs = pendingRows.reduce((ms, s) => ms + s.ms, 0)

  // Active-season goal progress: effective goal (own override else team default),
  // hours toward it (only the goal's categories), and days present this season.
  let goalProgress = null
  {
    const today = laDateKey(now)
    const active = seasons.find(s => s.start_date <= today && (s.end_date == null || s.end_date >= today))
    const goal = active ? effectiveGoal(goals, memberId, active.id) : null
    if (goal && goal.target_hours > 0) {
      const hours = hoursTowardGoal(breakdown[active.id], goal)
      const days  = daysPresent(events, { since: active.start_date, until: active.end_date ?? today })
      goalProgress = {
        season: active, target: goal.target_hours, hours, days,
        pct: Math.min(100, (hours / goal.target_hours) * 100),
        met: hours >= goal.target_hours,
        catKeys: goalCategoryKeys(goal),
        allCats: !goal.categories?.length,
      }
    }
  }

  // Newest first, for the Recent sessions card.
  const recent = [...sessions].reverse().slice(0, 8)

  const weeks = Array.from({ length: 6 }, (_, i) => {
    const offset = i - 5
    return { hours: weeklyHours({ sessions, logged, reviews, now, offset }).hours,
      end: laMidnightMs(weekRange(now, offset).to) }
  })
  const trend = { thisWeek: weeks.at(-1).hours, weeks }

  const cards = []
  for (const s of [...seasons].sort((a, b) => b.start_date.localeCompare(a.start_date))) {
    const b = breakdown[s.id]
    if (b?.total >= 0.01) cards.push({ key: s.id, label: s.name, b })
  }
  if (breakdown.other?.total >= 0.01) {
    cards.push({ key: 'other', label: 'Other', b: breakdown.other })
  }

  // All Time is the sum the By category card draws, so the two cannot disagree.
  const grandTotal = allTime.total

  return {
    sessions, recent, breakdown, allTime, cards, grandTotal, trend, goalProgress,
    pendingCount: pendingRows.length, pendingMs,
  }
}
