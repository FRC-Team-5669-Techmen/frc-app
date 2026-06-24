// Hour categories — the single source of truth for the kinds of hour-accruing
// work an attendance session can represent. Kept in its own tiny module (no
// React, no Supabase) so the fast-path /checkin route can import it without
// pulling in the heavier hours-aggregation math from hoursUtils.

// Display order + theme color token per category.
export const CATEGORIES = [
  { key: 'build',       label: 'Build',       color: 'var(--hr-build)' },
  { key: 'outreach',    label: 'Outreach',    color: 'var(--hr-outreach)' },
  { key: 'volunteer',   label: 'Volunteer',   color: 'var(--hr-volunteer)' },
  { key: 'competition', label: 'Competition', color: 'var(--hr-competition)' },
  { key: 'fundraising', label: 'Fundraising', color: 'var(--hr-fundraising)' },
  { key: 'mentoring',   label: 'Mentoring',   color: 'var(--hr-mentoring)' },
]

// The regular shop check-in flow defaults here; the DB column defaults to it too.
export const DEFAULT_CATEGORY = 'build'

const BY_KEY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]))

export const categoryLabel = k => BY_KEY[k]?.label ?? (k ? k[0].toUpperCase() + k.slice(1) : '—')
export const categoryColor = k => BY_KEY[k]?.color ?? 'var(--muted)'

// Normalize a stored attendance_events.category to a known category. Legacy rows
// predate the 6-category system: the old default 'normal' (and null) → 'build'.
export function normAttendanceCategory(cat) {
  if (!cat || cat === 'normal') return DEFAULT_CATEGORY
  return BY_KEY[cat] ? cat : DEFAULT_CATEGORY
}

// logged_hours.type → category bucket (logged hours don't carry the full set;
// 'volunteering' is the same bucket as the 'volunteer' attendance category).
export const LOGGED_TYPE_TO_CATEGORY = { volunteering: 'volunteer', outreach: 'outreach', competition: 'competition' }
export const loggedTypeToCategory = t => LOGGED_TYPE_TO_CATEGORY[t] ?? t

// A zeroed per-category stats object (+ total), used as an empty fallback.
export function emptyBreakdown() {
  const r = { total: 0 }
  for (const c of CATEGORIES) r[c.key] = 0
  return r
}
