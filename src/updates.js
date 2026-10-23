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
