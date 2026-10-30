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
  { path: '/dashboard', area: 'start', title: 'Home', for: ['member', 'parent'], anchor: '[data-tour="status-card"]', where: 'Home tab',
    what: 'Your live status, today and season hours, the shop, what is next, and Do this now when something needs you. Check out here, or tap your tag again.' },
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
  { path: '/leaderboard', area: 'time', title: 'Hours leaderboard', for: ['member'], where: 'Hours menu',
    what: 'Students ranked by season hours. Mentors and adults are listed apart.' },
  { path: '/display', area: 'time', title: 'Presence board', for: ['staff'], where: 'Team admin, Hours',
    what: 'The shop screen: who is in right now. Staff can sign a member in or out from it.' },
  { path: '/verify-hours', area: 'staff', title: 'Verify Hours', for: ['staff'], where: 'Team admin, Hours',
    what: 'Approve or send back logged hours.' },
  { path: '/signouts', area: 'staff', title: 'Sign-out approvals', for: ['staff'], where: 'Team admin, Right now (with the waiting count)',
    what: 'Approve a sign-out or send it back with a note. The student sees the note and gets a push.' },
  { path: '/reports', area: 'staff', title: 'Reports', for: ['staff'], where: 'Team admin, Hours',
    what: 'Hours and attendance exports for any date range.' },
  // ── team and events ──────────────────────────────────────────────────────
  { path: '/schedule', area: 'team', title: 'Schedule', for: ['member', 'parent'], anchor: '[data-tour="nav-schedule"]', where: 'Schedule tab',
    what: 'Meetings, build days and competitions. Say if you are going. Ask for an absence from your standing page.' },
  { path: '/jobs', area: 'team', title: 'Jobs', for: ['member'], where: 'Robot, then Jobs',
    what: 'Claim a team job, post progress, log time on it, and submit it for sign-off.' },
  { path: '/certifications', area: 'team', title: 'Certifications', for: ['member'], where: 'Robot, then Certifications',
    what: 'Your IDEA certifications, a read-only copy. Earned only at ideabosco.com.' },
  { path: '/trips', area: 'team', title: 'Trips', for: ['member'], where: 'Schedule, then Trips',
    what: 'Competition trips: the carpool and food boards.' },
  { path: '/trips/:id', area: 'team', title: 'A trip', for: ['member'], where: 'Trips, then a trip',
    what: 'Who rides with whom, and which food is still needed.' },
  { path: '/rosters', area: 'team', title: 'Event rosters', for: ['member'], where: 'Schedule, then Event rosters',
    what: 'Who is going to each event and in what role.' },
  { path: '/rosters/:id', area: 'team', title: 'An event roster', for: ['member'], where: 'Event rosters, then an event',
    what: 'Roles, eligibility and event-day attendance for one event.' },
  { path: '/scouting', area: 'team', title: 'Scouting', for: ['member'], anchor: '[data-tour="nav-scouting"]', where: 'Scouting tab',
    what: 'Scout robots at events, even offline, and build pick lists.' },
  { path: '/scouting/:eventId', area: 'team', title: 'Scouting an event', for: ['member'], where: 'Scouting, then an event',
    what: 'Your shift, observations, pit notes and the team list for one event.' },
  { path: '/scouting/:eventId/board', area: 'team', title: 'Pick board', for: ['member'], where: 'Scouting, then an event, then Pick board',
    what: 'Teams ranked automatically for our picks, Must pick and Avoid marks, and live alliance selection that re-ranks after every pick.' },
  { path: '/robot', area: 'team', title: 'Robot', for: ['member'], anchor: '[data-tour="nav-robot"]', where: 'Robot tab',
    what: 'Batteries, autos, drivers, human players, the match simulator, jobs, sub-team status and certifications, each with its live state.' },
  { path: '/batteries', area: 'team', title: 'Batteries', for: ['member'], where: 'Robot, then Batteries',
    what: 'Every battery worst first: charge state in one tap, resting voltage, brownouts and match-ready. Log a run in seconds.' },
  { path: '/roles/:eventId', area: 'team', title: 'Role board', for: ['member'], where: 'Event rosters, an event, then Role board; or Home when slots are unfilled',
    what: 'Ask for a role in any time slot of an event, see who else asked, and what is still unfilled. Staff assign from a request.' },
  { path: '/my-schedule', area: 'team', title: 'My schedule', for: ['member'], where: 'Home (Now or Next), or My shifts on the role board',
    what: 'Your own day at a competition: each station and where to be, your ride, the team blocks, and reminders on your phone before each one.' },
  { path: '/meet', area: 'team', title: 'Meet a team', for: ['member'], where: 'Scouting, then Meet a team; or Home during a competition',
    what: 'At every competition, talk to another team and log what they do well, how they run and what they offer.' },
  { path: '/meet/:eventId', area: 'team', title: 'Meet a team at an event', for: ['member'], where: 'Meet a team, then an event; the role board; or Do this now',
    what: 'Log a team, read every team the whole team met, and see your Meet a team slot. Staff see progress and give everyone a slot.' },
  { path: '/autos', area: 'team', title: 'Autos', for: ['member'], where: 'Robot, then Autos',
    what: 'Every auto routine with its streak and success rate. Ready at five successes in a row. Log a run in three taps.' },
  { path: '/drivers', area: 'team', title: 'Drivers', for: ['member'], where: 'Robot, then Drivers',
    what: 'The driver leaderboard: log real robot and MoSim time, see coach ratings, and one Driver Score per season.' },
  { path: '/human-player', area: 'team', title: 'Human player', for: ['member'], where: 'Robot, then Human player',
    what: 'The human player leaderboard: accuracy, rate and full match runs on the real clock, counted live in the shop, and one Human Player Score per season.' },
  { path: '/match-sim', area: 'team', title: 'Match simulator', for: ['member'], where: 'Robot, then Match simulator',
    what: 'A full 2026 match on the official clock with the HUBS alternating and sound cues, then one screen that logs the auto, FUEL, TOWER and battery.' },
  { path: '/robot/matches', area: 'team', title: 'Match log', for: ['member'], where: 'Robot, then Match log, or Match log on the Match simulator',
    what: 'Every match the robot plays, from its own files and the Match simulator: scorecard, battery by phase, why it was not ready, trends per driver and battery, and side by side.' },
  { path: '/robot/matches/:id', area: 'team', title: 'One robot match', for: ['member'], where: 'Match log, then a match',
    what: 'One match: the scorecard, battery by phase, not-ready reasons, the timeline, the crew, notes and video, and the robot file kept whole.' },
  { path: '/status-reports', area: 'team', title: 'Sub-team status', for: ['member'], where: 'Robot, then Sub-team status',
    what: 'Each sub-team this week: on track, at risk or blocked.' },
  { path: '/survey', area: 'team', title: 'Weekly survey', for: ['student'], where: 'My profile, or Home when it is open',
    what: 'A short check-in about your week.' },
  { path: '/members/:id', area: 'team', title: 'Member page', for: ['member'], where: 'Tap a name on Team Hours or the board',
    what: 'One member, their sub-teams and hours.' },
  // ── you and your record ──────────────────────────────────────────────────
  { path: '/profile', area: 'you', title: 'My Profile', for: ['member', 'parent'], anchor: '[data-tour="nav-profile"]', where: 'Account menu',
    what: 'Your details and notifications. Replay this tour from the account menu.' },
  { path: '/standing', area: 'you', title: 'My standing', for: ['student', 'parent'], where: 'Account menu',
    what: 'Good standing or probation, your weeks and months, absence requests, and your checklist.' },
  { path: '/updates', area: 'you', title: "What's new", for: ['member', 'parent'], where: 'Account menu (a dot means something new)',
    what: 'Every app update, newest first, with a link to each new page.' },
  { path: '/handbook', area: 'you', title: 'Handbook', for: ['member'], where: 'Account menu',
    what: 'The team rules, with a short check after each part, and where you sign.' },
  { path: '/driver-docs', area: 'you', title: 'Driver documents', for: ['member', 'parent'], where: 'My profile',
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
  { path: '/manage', area: 'staff', title: 'Team admin', for: ['staff'], where: 'Account menu, Team admin (the number is what is waiting)',
    what: 'Every staff tool in four groups with live counts. Anything waiting moves to the top; type to find a tool.' },
  { path: '/readiness', area: 'staff', title: 'Readiness', for: ['staff'], where: 'Team admin, Events',
    what: 'What the team still needs before the next event.' },
  { path: '/standing/team', area: 'staff', title: 'Team standing', for: ['staff'], where: 'Team admin, People',
    what: 'Absences to decide, probations and removals to confirm, safety log, incidents, weeks and grades.' },
  { path: '/emergency-info', area: 'staff', title: 'Emergency information', for: ['staff', 'parent'], where: 'Team admin, People (parents: My profile)',
    what: 'Every student contact, condition and allergy, printable. Parents edit their own student.' },
  { path: '/no-photo', area: 'staff', title: 'No-photo list', for: ['staff'], where: 'Team admin, People',
    what: 'Students who must not appear in team photos or posts.' },
  { path: '/trips/:id/manage', area: 'staff', title: 'Trip mentor page', for: ['staff'], where: 'Trips, a trip, Mentor page',
    what: 'Readiness, families, carpool and food boards, setup and exports. Send a family its link again from Families.' },
  { path: '/squad', area: 'staff', title: 'Squad', for: ['staff'], where: 'Team admin, People',
    what: 'Sub-teams and who is on each.' },
  { path: '/activity', area: 'staff', title: 'Activity', for: ['staff'], where: 'Team admin, Hours',
    what: 'Recent check-ins, check-outs and changes across the team.' },
  { path: '/applications', area: 'staff', title: 'Applications', for: ['staff'], where: 'Team admin, People',
    what: 'This season member applications and their parent answers.' },
  { path: '/access-requests', area: 'staff', title: 'Access requests', for: ['staff'], where: 'Team admin, Right now',
    what: 'Approve or deny people asking to join the app, and invite parents. Admins get an email for each new one.' },
  { path: '/surveys', area: 'staff', title: 'Surveys', for: ['staff'], where: 'Team admin, Events',
    what: 'Open, close and read the weekly surveys.' },
  // ── admin tools ──────────────────────────────────────────────────────────
  { path: '/roster', area: 'admin', title: 'Roster', for: ['admin'], where: 'Team admin, People',
    what: 'Roles, status and permissions for every member.' },
  { path: '/feedback', area: 'admin', title: 'Feedback inbox', for: ['admin'], where: 'Team admin, Right now',
    what: 'Every report from the feedback button, with screenshots. Move it through statuses and answer the sender.' },
  { path: '/announce', area: 'admin', title: 'Discord announcements', for: ['admin'], where: 'Team admin, Events, or Announce on a schedule event',
    what: 'Post to the team Discord with role pings, a poll or an embed. Preview and check before sending.' },
  { path: '/connector/*', area: 'admin', title: 'Claude connector', for: ['admin'], where: 'The connector address, from Claude',
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
