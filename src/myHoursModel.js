// Everything My Hours shows, computed in one place. Pure (no React, no
// Supabase): MyHoursPage loads the rows and renders what this returns, so the
// numbers on the page can be driven by tests/my-hours-model.test.js through the
// exact code path the page runs.
import { buildBreakdown, computePendingMs, sumBreakdown, sessionsFromEvents } from './hoursUtils'
import { effectiveGoal, goalCategoryKeys, hoursTowardGoal, daysPresent } from './accountability'

const DAY_MS = 86_400_000

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
  // Checkout IDs excluded from official hours (pending or voided review)
  const excludedIds = new Set(reviews.map(r => r.checkout_id))
  // Checkout IDs that are pending review only (shown in the notice, not voided)
  const pendingIds = new Set(reviews.filter(r => r.status === 'pending').map(r => r.checkout_id))

  // Checkout/checkin IDs that already have an open (pending) correction request.
  const flaggedIds = new Set()
  for (const c of corrections) {
    if (c.status !== 'pending') continue
    if (c.checkin_id)  flaggedIds.add(c.checkin_id)
    if (c.checkout_id) flaggedIds.add(c.checkout_id)
  }

  const breakdown = buildBreakdown(seasons, events, logged, excludedIds, adjustments)
  const pendingMs = computePendingMs(events, pendingIds)

  // All-time totals per type (across every season).
  const allTime = sumBreakdown(breakdown)

  // Active-season goal progress: effective goal (own override else team default),
  // hours toward it (only the goal's categories), and days present this season.
  let goalProgress = null
  {
    const today = new Date(now).toISOString().slice(0, 10)
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

  // Sessions newest-first, with the pending/voided flag for display.
  const sessions = sessionsFromEvents(events)
  const recent = [...sessions].reverse().slice(0, 8).map(s => ({
    ...s,
    pending: s.outId ? pendingIds.has(s.outId) : false,
    flagged: (s.inId && flaggedIds.has(s.inId)) || (s.outId && flaggedIds.has(s.outId)),
  }))

  // Trailing-7-day hours (attendance sessions + logged), and a 6-week trend.
  const rangeHours = (start, end) => {
    let ms = 0
    for (const s of sessions) {
      const t = s.inTime.getTime()
      if (t >= start && t < end) ms += s.ms
    }
    let h = ms / 3600000
    for (const l of logged) {
      const t = new Date(l.date + 'T00:00:00').getTime()
      if (t >= start && t < end) h += parseFloat(l.hours) || 0
    }
    return h
  }
  const weeks = []
  for (let i = 5; i >= 0; i--) {
    const end = now - i * 7 * DAY_MS
    weeks.push({ hours: rangeHours(end - 7 * DAY_MS, end), end })
  }
  const trend = { thisWeek: weeks[weeks.length - 1].hours, weeks }

  const cards = []
  for (const s of [...seasons].sort((a, b) => b.start_date.localeCompare(a.start_date))) {
    const b = breakdown[s.id]
    if (b?.total >= 0.01) cards.push({ key: s.id, label: s.name, b })
  }
  if (breakdown.other?.total >= 0.01) {
    cards.push({ key: 'other', label: 'Other', b: breakdown.other })
  }

  const grandTotal = cards.reduce((s, c) => s + c.b.total, 0)

  return {
    sessions, recent, breakdown, allTime, cards, grandTotal, trend, goalProgress,
    pendingCount: pendingIds.size, pendingMs,
  }
}
