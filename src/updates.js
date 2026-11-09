// WHAT'S NEW: the app's release log, shown at /updates, newest first.
//
// Plain data plus the unread rule. No React, no Supabase. Adding a release
// means adding one object at the TOP of UPDATES; the page sorts anyway, and
// the nav dot lights for everyone whose last visit predates it.
//
// Copy is student-facing: short lines, plain words, no em dashes, no weekday
// names. `route` (optional) is where the "Open" link goes; it must be a real
// route (tests/updates.test.js checks it against App.jsx).

export const UPDATES = Object.freeze([
  { date: '2026-11-08', title: 'Event service hours and planning', route: '/trips', items: [
    'Staff can record each parent by name with service dates, start and end times, a student school ID and a total for the event.',
    'Download a named parent service CSV or print the same records.',
    'Competition venue check-ins count as Competition hours. Temporary event location exemptions end with the event.',
    'Scouting leads can see matches submitted by each scout and assignments still missing a submission.',
    'Mentors can preview role rotations with reasons. Newer pit members are paired with two mentor-designated strong members; responsibility roles use verified shop hours. Mentors still choose every assignment.',
  ] },
  { date: '2026-11-08', title: 'Parent accounts and summer transfers', route: '/profile', items: [
    'A new personal-email account with no roster role starts as a parent request for staff review. Existing roles stay in place.',
    'Moving from a summer personal account to a school account uses a one-time code and admin approval before history moves.',
    'Mentors can preview participation folding, keep someone active or restore a folded member. Automatic folding starts off; folding does not delete an account.',
  ] },
  { date: '2026-11-08', title: 'Attendance and account protection', items: [
    'Attendance uses server time and protects staff-only fields. Supported staff corrections remain available.',
    'Calendar access tokens and internal database tools have tighter permissions. Some account-policy questions are still under review.',
  ] },
  { date: '2026-11-07', title: 'Find a page faster', items: [
    'Navigation groups related pages together, with fewer competing links.',
    'Search pages by name or task from the navigation. Results follow your role.',
  ] },
  { date: '2026-11-07', title: 'Practice using Techmen', route: '/training', items: [
    'Guided training walks you through the pages you use, with safe practice activities.',
    'Resume unfinished training on this device. Skipping does not count as completion.',
    'Mentors can see core training progress. Training does not award a certification.',
  ] },
  { date: '2026-11-07', title: 'Your feedback fixes', route: '/dashboard', items: [
    'Pause and resume a session from Home. A pause keeps your session open; it is not approval to leave.',
    'Standing shows the evidence behind a record and separates withdrawn probation. Verified logged hours use the right calendar week.',
    'The battery board includes Good batteries. Scouting tables fit computer screens with filters and a scrolling header.',
  ] },
  { date: '2026-11-06', title: 'Finish your session with approval', route: '/signouts', items: [
    'Leave a work note and finish the existing mentor sign-out approval before starting FLL volunteering.',
    'A mentor can tap a waiting name once to approve. An old request cannot close a later session.',
    'Breaks stay inside your Build session. FLL volunteer sign-out still uses a note.',
  ] },
  { date: '2026-11-06', title: 'One school sender for app mail', items: [
    'App mail now shares one school-sender setup so administrators can manage delivery in one place.',
  ] },
  { date: '2026-11-03', title: 'Layouts for phones and computers', items: [
    'Computer screens use the available width for tables, forms and related cards.',
    'Phone screens keep readable cards and controls without stretching wide tables across the page.',
  ] },
  { date: '2026-11-02', title: 'Open the right event and match', route: '/scouting', items: [
    'Scouting finds the event on The Blue Alliance by date and opens a schedule picker for the match and robot.',
    'My schedule station cards open the tool for your assigned role.',
  ] },
  { date: '2026-11-01', title: 'Standing correction', route: '/standing', items: [
    'Meeting attendance includes members whose sessions were already open. Unrecorded meetings do not become automatic absences.',
    'The incorrect October probation records were withdrawn. Large probation changes are held for review.',
  ] },
  { date: '2026-10-30', title: 'Your competition day', route: '/my-schedule', items: [
    'See your assigned stations, backups, rides and calendar blocks for each competition day, with Now and Next at the top.',
    'Station and ride reminder settings are available in Notifications. Delivery depends on push being enabled.',
  ] },
  { date: '2026-10-29', title: 'Scout teams and choose alliance partners', route: '/scouting', items: [
    'Teams opens as a sortable table. Tap a team for its full evidence card.',
    'The pick board ranks available teams from scouting and match data, then updates as a lead records picks and declines.',
    'Ratings are optional. Missing evidence stays unknown.',
  ] },
  { date: '2026-10-28', title: 'Match log', route: '/robot/matches', items: [
    'Every robot match in one place: practice, real matches and auto tests.',
    'The robot records balls in, wasted shots, battery and why it was not ready to fire.',
    'Trends for each driver and battery, and any matches side by side.',
    'Drive-team leads import the robot files from GitHub in one tap.',
  ] },
  { date: '2026-10-23', title: 'Meet a team', route: '/meet', items: [
    'At every competition, talk to another team and log what they do well.',
    'Chips for how they run and what they offer. One thing we should copy.',
    'Everyone gets a time slot on the role board. Home reminds you until you log one.',
    'Read every team the whole team met, grouped by team number.',
  ] },
  { date: '2026-10-23', title: 'Light mode', route: '/profile', items: [
    'Pick Light, Dark or System on your profile, or from the account menu.',
    'Your choice stays on this device. Dark is still the default.',
  ] },
  { date: '2026-10-23', title: "What's new", route: '/updates', items: [
    'This page. Every app update, newest first.',
    'A dot on the account menu means something new landed since your last look.',
  ] },
  { date: '2026-10-23', title: 'Role interest board', route: '/rosters', items: [
    'Ask for a role in any time slot of an event.',
    'See who else asked and which slots are still open.',
    'Home tells you when an event still has open slots.',
  ] },
  { date: '2026-10-23', title: 'Autos log', route: '/autos', items: [
    'Every auto routine with its streak and success rate.',
    'Five successes in a row marks a routine ready.',
    'Log a run in three taps.',
  ] },
  { date: '2026-10-23', title: 'Match simulator', route: '/match-sim', items: [
    'Run a full match on the official clock, with HUB shifts and sound cues.',
    'One screen at the end logs the auto, FUEL, TOWER and battery.',
  ] },
  { date: '2026-10-23', title: 'New navigation', route: '/robot', items: [
    'A Robot tab holds batteries, autos, the simulator, jobs, sub-team status and certifications.',
    'Home shows Do this now when something needs you.',
    'The account menu is shorter. Personal records moved to your profile.',
  ] },
  { date: '2026-10-23', title: 'Scouting match fields and spreadsheet export', route: '/scouting', items: [
    'Match scouting asks for this season’s REBUILT scoring.',
    'Export an event to a spreadsheet anyone can read.',
  ] },
  { date: '2026-10-23', title: 'Battery log', route: '/batteries', items: [
    'Every battery listed worst first, with charge state in one tap.',
    'Resting voltage, brownouts and match-ready at a glance.',
    'Log a run in seconds from the pits.',
  ] },
  { date: '2026-10-22', title: 'Answers to your feedback', items: [
    'When a mentor answers a report you sent, you see the answer and get a push.',
    'The tour now covers every page and updates itself when pages change.',
  ] },
  { date: '2026-10-20', title: 'Handbook tab and leaderboard', route: '/handbook', items: [
    'The whole handbook on one tab, with search and section links.',
    'The hours leaderboard ranks students only. Adults are listed apart.',
  ] },
  { date: '2026-10-20', title: 'Event scouting', route: '/scouting', items: [
    'Scout robots at events, even with no signal. Entries sync when you are back online.',
    'Shifts, pit notes and pick lists in one place.',
  ] },
  { date: '2026-10-19', title: 'Member handbook', route: '/handbook', items: [
    'A quick reference, 18 short lessons with a check after each, and a glossary.',
    'Sign the handbook in the app.',
  ] },
  { date: '2026-10-19', title: 'Sign-out requests', items: [
    'Leaving? Tap your tag, write what you did, and a mentor approves it.',
    'Meeting check-in, and a 12-hour cap on any one session.',
  ] },
  { date: '2026-10-19', title: 'My standing', route: '/standing', items: [
    'See your weeks, your months and any absence requests in one place.',
    'Ask for an absence from your standing page.',
  ] },
  { date: '2026-10-19', title: 'Event rosters', route: '/rosters', items: [
    'Who is going to each event and in what role.',
    'Event-day attendance and conflicts, all on the roster.',
  ] },
  { date: '2026-10-16', title: 'IDEA certifications', route: '/certifications', items: [
    'Your certifications from ideabosco.com, shown here read-only.',
    'Some jobs need a certification before you can claim them.',
  ] },
  { date: '2026-10-04', title: 'Trips', route: '/trips', items: [
    'Competition trips with a carpool board and a food board.',
    'Families sign up from one link.',
  ] },
  { date: '2026-08-30', title: 'Weekly survey and feedback button', route: '/survey', items: [
    'A short weekly check-in about how your week went.',
    'The feedback button on every page sends a report straight to the admins.',
  ] },
])

export const UPDATES_SEEN_KEY = 'techmen:updates-seen'
export const UPDATES_SEEN_EVENT = 'techmen:updates-seen'

/** Newest first. Same-date entries keep their order in the file. */
export function sortUpdates(list = UPDATES) {
  return list.map((u, i) => [u, i])
    .sort((a, b) => (a[0].date === b[0].date ? a[1] - b[1] : a[0].date < b[0].date ? 1 : -1))
    .map(([u]) => u)
}

/** The key of the newest entry: its date and title. Null for an empty list. */
export function newestKey(list = UPDATES) {
  const top = sortUpdates(list)[0]
  return top ? `${top.date}|${top.title}` : null
}

/**
 * Is there something the person has not seen? `seen` is the newestKey they
 * had when they last opened /updates (null if never). Unread when the newest
 * entry is a different one, unless what they saw is dated later (a release
 * rolled back), so an old build never relights the dot.
 */
export function hasUnread(list = UPDATES, seen = null) {
  const key = newestKey(list)
  if (!key) return false
  if (!seen) return true
  if (key === seen) return false
  const seenDate = String(seen).split('|')[0]
  return key.split('|')[0] >= seenDate
}

/**
 * The entries released since `seen` (newest first): those above the seen
 * entry, or, if that entry is gone from the file, those dated after it.
 * Nothing for a first visit (seen null), when the whole page is new anyway.
 */
export function newSince(list = UPDATES, seen = null) {
  if (!seen) return []
  const sorted = sortUpdates(list)
  const at = sorted.findIndex((u) => `${u.date}|${u.title}` === seen)
  if (at >= 0) return sorted.slice(0, at)
  const seenDate = String(seen).split('|')[0]
  return sorted.filter((u) => u.date > seenDate)
}

export function readSeen(storage = globalThis.localStorage) {
  try { return storage?.getItem(UPDATES_SEEN_KEY) ?? null } catch { return null }
}

/** Record the visit and tell the nav, so its dot goes out at once. */
export function markSeen(list = UPDATES, storage = globalThis.localStorage) {
  const key = newestKey(list)
  try { if (key) storage?.setItem(UPDATES_SEEN_KEY, key) } catch { /* private window */ }
  try { globalThis.dispatchEvent?.(new Event(UPDATES_SEEN_EVENT)) } catch { /* no window */ }
  return key
}
