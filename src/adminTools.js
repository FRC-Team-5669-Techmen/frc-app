// THE TEAM ADMIN CATALOG (ledger 0017, decision 49): every staff tool, its
// group, who may open it, and which live count says something is waiting.
// One list read by /manage (src/ManagePage.jsx), the account menu's Team admin
// badge (src/NavBar.jsx) and the feature guide test, so the three never
// disagree. Pure: no React, no Supabase.
//
// Ordered by how often each is used, most used first, within each group.

export const GROUPS = Object.freeze([
  { key: 'now', title: 'Right now' },
  { key: 'events', title: 'Events' },
  { key: 'people', title: 'People' },
  { key: 'hours', title: 'Hours' },
])

// count: the key in the counts object (loadAdminCounts) that is "waiting".
// admin: true when only admins may open it (the page refuses anyone else).
export const TOOLS = Object.freeze([
  { path: '/signouts', group: 'now', title: 'Sign-outs', what: 'Approve or send back a sign-out', count: 'signouts', words: 'sign out leave approve checkout' },
  { path: '/access-requests', group: 'now', title: 'Access requests', what: 'People asking to join the app', count: 'access', words: 'join approve invite parent' },
  { path: '/feedback', group: 'now', title: 'Feedback', what: 'Reports from the feedback button', count: 'feedback', admin: true, words: 'bug report inbox idea' },
  { path: '/trips', group: 'events', title: 'Trips', what: 'Carpool, food and family sign-ups', words: 'carpool ride food family hub competition travel' },
  { path: '/rosters', group: 'events', title: 'Event rosters', what: 'Who goes to each event, and roles', words: 'roster event roles attendance' },
  { path: '/readiness', group: 'events', title: 'Readiness', what: 'What the team still needs', count: 'readiness', words: 'ready checklist next event' },
  { path: '/announce', group: 'events', title: 'Announce', what: 'Post to the team Discord', admin: true, words: 'discord post message ping announcement' },
  { path: '/surveys', group: 'events', title: 'Surveys', what: 'Open, close and read weekly surveys', words: 'survey weekly check in poll' },
  { path: '/roster', group: 'people', title: 'Roster', what: 'Roles, status and permissions', admin: true, words: 'members roles permissions admin' },
  { path: '/applications', group: 'people', title: 'Applications', what: 'Season applications and parent answers', words: 'apply application parent questionnaire discord' },
  { path: '/squad', group: 'people', title: 'Squad', what: 'Sub-teams and who is on each', words: 'subteam squad mechanical electrical programming' },
  { path: '/standing/team', group: 'people', title: 'Team standing', what: 'Absences, probation, safety, grades', count: 'standing', words: 'absence probation removal safety grades discipline standing' },
  { path: '/emergency-info', group: 'people', title: 'Emergency information', what: 'Contacts, conditions, allergies', words: 'medical emergency allergy contact print' },
  { path: '/no-photo', group: 'people', title: 'No-photo list', what: 'Students kept out of photos', words: 'photo media consent' },
  { path: '/verify-hours', group: 'hours', title: 'Verify hours', what: 'Approve logged hours and fixes', count: 'verify', words: 'hours approve logged correction missed checkout' },
  { path: '/hours', group: 'hours', title: 'Team hours', what: 'The board by member, day or session', words: 'hours board totals team' },
  { path: '/reports', group: 'hours', title: 'Reports', what: 'Hours and attendance exports', words: 'export csv report attendance' },
  { path: '/activity', group: 'hours', title: 'Activity', what: 'Recent check-ins and changes', words: 'activity log recent' },
  { path: '/display', group: 'hours', title: 'Display', what: 'The shop screen: who is in now', words: 'presence display screen shop who is here' },
])

export function toolsFor({ isAdmin = false } = {}) {
  return TOOLS.filter((t) => !t.admin || isAdmin)
}

/** Total waiting across the tools this person can open (the Team admin badge). */
export function totalWaiting(counts, opts) {
  return toolsFor(opts).reduce((n, t) => n + (t.count && Number.isFinite(counts?.[t.count]) ? counts[t.count] : 0), 0)
}

/**
 * The /manage layout: tools with something waiting first (most waiting
 * first), then each group in order. A filter matches a tool's title, what it
 * does, or its search words; a filtered view is one flat list.
 */
export function manageLayout(counts, { isAdmin = false, query = '' } = {}) {
  const tools = toolsFor({ isAdmin }).map((t) => ({ ...t, waiting: t.count && Number.isFinite(counts?.[t.count]) ? counts[t.count] : 0 }))
  const q = query.trim().toLowerCase()
  if (q) {
    const words = q.split(/\s+/)
    return { filtered: tools.filter((t) => words.every((w) => `${t.title} ${t.what} ${t.words}`.toLowerCase().includes(w))) }
  }
  const waiting = tools.filter((t) => t.waiting > 0).sort((a, b) => b.waiting - a.waiting)
  return {
    waiting,
    groups: GROUPS.map((g) => ({ ...g, tools: tools.filter((t) => t.group === g.key && !(t.waiting > 0)) })).filter((g) => g.tools.length),
  }
}

/**
 * Every live count, each read the way its own page reads it. A read that
 * fails (a migration not pasted, a policy that answers nothing) is null, not
 * zero, and adds nothing to the badge.
 */
export async function loadAdminCounts(supabase, { isAdmin = false } = {}) {
  const head = (table, f) => f(supabase.from(table).select('id', { count: 'exact', head: true }))
  const num = (r) => (r && !r.error && Number.isFinite(r.count) ? r.count : null)
  const [access, plinks, feedback, signoutsOk, signouts, standing, sessions, corrections, loggedFix, logged, readiness] = await Promise.all([
    head('access_requests', (q) => q.eq('status', 'pending')),
    head('parent_link_requests', (q) => q.eq('status', 'pending')),
    isAdmin ? head('feedback', (q) => q.in('status', ['new', 'open'])) : Promise.resolve(null),
    supabase.rpc('can_approve_signouts'),
    head('signout_requests', (q) => q.eq('status', 'pending')),
    head('absence_requests', (q) => q.eq('status', 'pending')),
    head('session_reviews', (q) => q.eq('status', 'pending')),
    head('session_corrections', (q) => q.eq('status', 'pending')),
    head('logged_hours_corrections', (q) => q.eq('status', 'pending')),
    head('logged_hours', (q) => q.eq('status', 'pending')),
    supabase.rpc('readiness_summary'),
  ])
  const sum = (...xs) => (xs.every((x) => x === null) ? null : xs.reduce((n, x) => n + (x ?? 0), 0))
  return {
    access: sum(num(access), num(plinks)),
    feedback: num(feedback),
    signouts: signoutsOk && !signoutsOk.error && signoutsOk.data === true ? num(signouts) : null,
    standing: num(standing),
    verify: sum(num(sessions), num(corrections), num(loggedFix), num(logged)),
    readiness: readiness && !readiness.error ? (readiness.data?.action_queue?.total ?? null) : null,
  }
}
