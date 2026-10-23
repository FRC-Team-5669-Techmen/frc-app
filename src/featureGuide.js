// THE FEATURE GUIDE: every page of the app, in one list, with who it is for,
// where to find it and what it does. The onboarding tour (src/tour.js) is
// built from it, so the tour covers every feature and changes when this list
// does (feedback aa4e3c4d, ledger 0016: "it must cover every single feature
// of the app as well as auto update when new features or changes are added").
//
// tests/feature-guide.test.js holds it to App.jsx's route table both ways:
// a route with no entry here (and no listed reason in NOT_IN_GUIDE) fails the
// test, and so does an entry for a route App.jsx no longer has. Adding a page
// therefore means adding its line here, and the tour picks it up.
//
// Pure data: no React, no Supabase. Copy is short and plain, no weekday
// names. `for`: who sees it in the tour (member: every signed-in team member;
// student; staff: mentor, lead or admin; admin; parent). `anchor`: a
// data-tour element the tour spotlights when it is on screen. `where`: how to
// reach it.

export const AREAS = Object.freeze([
  { key: 'start', title: 'Your dashboard' },
  { key: 'time', title: 'Hours and attendance' },
  { key: 'team', title: 'Team and events' },
  { key: 'you', title: 'You and your record' },
  { key: 'family', title: 'Families' },
  { key: 'staff', title: 'Staff tools' },
  { key: 'admin', title: 'Admin tools' },
])

export const GUIDE = Object.freeze([
  // ── your dashboard ────────────────────────────────────────────────────────
  { path: '/dashboard', area: 'start', title: 'Dashboard', for: ['member', 'parent'], anchor: '[data-tour="status-card"]', where: 'Dashboard tab',
    what: 'Your live status, today and season hours, the shop, and what is next. Check out here, or tap your tag again.' },
  { path: '/checkin', area: 'start', title: 'Check in at the door', for: ['member'], where: 'Tap your phone on a team NFC tag',
    what: 'Opens straight to check-in. Leaving? Tap again, write what you did, and a mentor approves it.' },
  { path: '/checkin-volunteer', area: 'start', title: 'FLL volunteer check-in', for: ['member'], where: 'The FLL room tag',
    what: 'Logs volunteer time with FLL, kept apart from build hours.' },
  // ── hours and attendance ─────────────────────────────────────────────────
  { path: '/my-hours', area: 'time', title: 'My Hours', for: ['member'], anchor: '[data-tour="nav-hours"]', where: 'Hours menu',
    what: 'Your sessions and totals by category, this week against what is required.' },
  { path: '/log-hours', area: 'time', title: 'Log Hours', for: ['member'], where: 'Hours menu',
    what: 'Log outreach or competition time done away from the shop, for a mentor to verify.' },
  { path: '/hours', area: 'time', title: 'Team Hours', for: ['member', 'parent'], where: 'Hours menu (Team Hours tab for parents)',
    what: 'The team board by member, by day or by session.' },
  { path: '/leaderboard', area: 'time', title: 'Hours leaderboard', for: ['member'], where: 'Account menu',
    what: 'Students ranked by season hours. Mentors and adults are listed apart.' },
  { path: '/display', area: 'time', title: 'Presence board', for: ['staff'], where: 'Account menu, Display',
    what: 'The shop screen: who is in right now. Staff can sign a member in or out from it.' },
  { path: '/verify-hours', area: 'staff', title: 'Verify Hours', for: ['staff'], where: 'Hours menu',
    what: 'Approve or send back logged hours.' },
  { path: '/signouts', area: 'staff', title: 'Sign-out approvals', for: ['staff'], where: 'Account menu',
    what: 'Approve a sign-out or send it back with a note. The student sees the note and gets a push.' },
  { path: '/reports', area: 'staff', title: 'Reports', for: ['staff'], where: 'Hours menu',
    what: 'Hours and attendance exports for any date range.' },
  // ── team and events ──────────────────────────────────────────────────────
  { path: '/schedule', area: 'team', title: 'Schedule', for: ['member', 'parent'], anchor: '[data-tour="nav-schedule"]', where: 'Schedule tab',
    what: 'Meetings, build days and competitions. Say if you are going. Ask for an absence from your standing page.' },
  { path: '/jobs', area: 'team', title: 'Jobs', for: ['member'], anchor: '[data-tour="nav-jobs"]', where: 'Jobs tab',
    what: 'Claim a team job, post progress, log time on it, and submit it for sign-off.' },
  { path: '/certifications', area: 'team', title: 'Certifications', for: ['member'], anchor: '[data-tour="nav-certs"]', where: 'Certs tab',
    what: 'Your IDEA certifications, a read-only copy. Earned only at ideabosco.com.' },
  { path: '/trips', area: 'team', title: 'Trips', for: ['member'], where: 'Account menu',
    what: 'Competition trips: the carpool and food boards.' },
  { path: '/trips/:id', area: 'team', title: 'A trip', for: ['member'], where: 'Trips, then a trip',
    what: 'Who rides with whom, and which food is still needed.' },
  { path: '/rosters', area: 'team', title: 'Event rosters', for: ['member'], where: 'Account menu',
    what: 'Who is going to each event and in what role.' },
  { path: '/rosters/:id', area: 'team', title: 'An event roster', for: ['member'], where: 'Event rosters, then an event',
    what: 'Roles, eligibility and event-day attendance for one event.' },
  { path: '/scouting', area: 'team', title: 'Scouting', for: ['member'], where: 'Account menu',
    what: 'Scout robots at events, even offline, and build pick lists.' },
  { path: '/scouting/:eventId', area: 'team', title: 'Scouting an event', for: ['member'], where: 'Scouting, then an event',
    what: 'Your shift, observations, pit notes and the team list for one event.' },
  { path: '/batteries', area: 'team', title: 'Batteries', for: ['member'], where: 'Account menu',
    what: 'Every battery worst first: charge state in one tap, resting voltage, brownouts and match-ready. Log a run in seconds.' },
  { path: '/status-reports', area: 'team', title: 'Sub-team status', for: ['member'], where: 'Account menu',
    what: 'Each sub-team this week: on track, at risk or blocked.' },
  { path: '/survey', area: 'team', title: 'Weekly survey', for: ['student'], where: 'Account menu',
    what: 'A short check-in about your week.' },
  { path: '/members/:id', area: 'team', title: 'Member page', for: ['member'], where: 'Tap a name on Team Hours or the board',
    what: 'One member, their sub-teams and hours.' },
  // ── you and your record ──────────────────────────────────────────────────
  { path: '/profile', area: 'you', title: 'My Profile', for: ['member', 'parent'], anchor: '[data-tour="nav-profile"]', where: 'Account menu',
    what: 'Your details and notifications. Replay this tour from the account menu.' },
  { path: '/standing', area: 'you', title: 'My standing', for: ['student', 'parent'], where: 'Account menu',
    what: 'Good standing or probation, your weeks and months, absence requests, and your checklist.' },
  { path: '/handbook', area: 'you', title: 'Handbook', for: ['member'], where: 'Account menu',
    what: 'The team rules, with a short check after each part, and where you sign.' },
  { path: '/driver-docs', area: 'you', title: 'Driver documents', for: ['member', 'parent'], where: 'Account menu',
    what: 'A driver uploads a license and insurance photo once. Only staff mentors can open it.' },
  // ── families ─────────────────────────────────────────────────────────────
  { path: '/family/:token', area: 'family', title: 'Family link', for: ['parent', 'staff'], where: 'The private link emailed to each family',
    what: 'No account needed: standing, the checklist, the handbook signature, emergency information and trip sign-ups.' },
  { path: '/parent/:token', area: 'family', title: 'Parent questionnaire', for: ['parent', 'staff'], where: 'The link in the application email',
    what: 'Each season: supervision, meals, driving and how a family can help.' },
  { path: '/join', area: 'family', title: 'Trip sign-up link', for: ['parent', 'staff'], where: 'The link mentors send for a trip',
    what: 'A parent picks their student and starts the family page for the trip.' },
  { path: '/join/:eventId', area: 'family', title: 'Trip sign-up link for one trip', for: ['parent', 'staff'], where: 'The link on the trip mentor page',
    what: 'The same sign-up, for one trip.' },
  { path: '/e/:token', area: 'family', title: 'Family trip page', for: ['parent', 'staff'], where: 'The link each family gets by email',
    what: 'Days, rides, food and contacts for one trip. Saves as you go.' },
  { path: '/rules', area: 'family', title: 'Handbook, no login', for: ['parent', 'staff'], where: 'Share this link with families',
    what: 'The handbook for anyone, with no sign-in.' },
  // ── staff tools ──────────────────────────────────────────────────────────
  { path: '/readiness', area: 'staff', title: 'Readiness', for: ['staff'], where: 'Account menu',
    what: 'What the team still needs before the next event.' },
  { path: '/standing/team', area: 'staff', title: 'Team standing', for: ['staff'], where: 'Account menu',
    what: 'Absences to decide, probations and removals to confirm, safety log, incidents, weeks and grades.' },
  { path: '/emergency-info', area: 'staff', title: 'Emergency information', for: ['staff', 'parent'], where: 'Account menu',
    what: 'Every student contact, condition and allergy, printable. Parents edit their own student.' },
  { path: '/no-photo', area: 'staff', title: 'No-photo list', for: ['staff'], where: 'Account menu',
    what: 'Students who must not appear in team photos or posts.' },
  { path: '/trips/:id/manage', area: 'staff', title: 'Trip mentor page', for: ['staff'], where: 'Trips, a trip, Mentor page',
    what: 'Readiness, families, carpool and food boards, setup and exports. Send a family its link again from Families.' },
  { path: '/squad', area: 'staff', title: 'Squad', for: ['staff'], where: 'Account menu',
    what: 'Sub-teams and who is on each.' },
  { path: '/activity', area: 'staff', title: 'Activity', for: ['staff'], where: 'Account menu',
    what: 'Recent check-ins, check-outs and changes across the team.' },
  { path: '/applications', area: 'staff', title: 'Applications', for: ['staff'], where: 'Account menu',
    what: 'This season member applications and their parent answers.' },
  { path: '/access-requests', area: 'staff', title: 'Access requests', for: ['staff'], where: 'Account menu',
    what: 'Approve or deny people asking to join the app, and invite parents. Admins get an email for each new one.' },
  { path: '/surveys', area: 'staff', title: 'Surveys', for: ['staff'], where: 'Account menu',
    what: 'Open, close and read the weekly surveys.' },
  // ── admin tools ──────────────────────────────────────────────────────────
  { path: '/roster', area: 'admin', title: 'Roster', for: ['admin'], where: 'Account menu',
    what: 'Roles, status and permissions for every member.' },
  { path: '/feedback', area: 'admin', title: 'Feedback inbox', for: ['admin'], where: 'Account menu',
    what: 'Every report from the feedback button, with screenshots. Move it through statuses and answer the sender.' },
  { path: '/announce', area: 'admin', title: 'Discord announcements', for: ['admin'], where: 'Account menu, or Announce on a schedule event',
    what: 'Post to the team Discord with role pings, a poll or an embed. Preview and check before sending.' },
  { path: '/connector/*', area: 'admin', title: 'Claude connector', for: ['admin'], where: 'Account menu',
    what: 'Turn the Claude connector on or off, and read everything it did.' },
])

// Routes that are deliberately not in the guide, each with its reason.
export const NOT_IN_GUIDE = Object.freeze({
  '/': 'the landing page; a signed-in member is sent to the dashboard',
  '/login': 'the sign-in screen itself',
  '/e': 'an old address that forwards to /join',
  '/skills': 'retired (decision 27); forwards to /certifications',
  '/study': 'retired (decision 27); forwards to /certifications',
  '/certify': 'retired (decision 27); forwards to /certifications',
  '/coverage': 'retired (decision 27); forwards to /certifications',
  '/_ds': 'a developer page, not in a production build',
  '/_fixture': 'a developer page, not in a production build',
})

/** The guide entries a person sees, by role. */
export function guideFor({ isStaff = false, isAdmin = false, isParent = false } = {}) {
  const parentOnly = isParent && !isStaff
  return GUIDE.filter((g) => {
    if (parentOnly) return g.for.includes('parent')
    if (g.for.includes('member')) return true
    if (g.for.includes('student') && !isStaff) return true
    if (g.for.includes('staff') && isStaff) return true
    if (g.for.includes('admin') && (isAdmin || isStaff)) return true
    return false
  })
}
