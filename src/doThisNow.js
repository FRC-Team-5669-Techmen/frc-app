// "Do this now" on Home (ledger 0017, decision 49): the signed-in member's
// open items, built ONLY from data the app already reads, each line opening
// the place to do it. Nothing to do yields an empty list, and Home then shows
// nothing (never an empty box).
//
// Sources, each read the way its own page reads it:
//   - member_extras(uid).onboarding (0017): the checklist items not done that
//     the member does themself (FIRST registration, Discord, GroupMe) or that
//     need their action (sign the handbook, emergency information);
//   - member_notices of kind 'signup' (0016's staff_remind_signups) not yet
//     read and under three weeks old: a mentor's reminder that the family
//     sign-up is not finished. The member clears it with Done (it marks the
//     notice read); the app has no member-readable sign-up status to check;
//   - an upcoming event with unfilled role-board cells (role_board_open_events, 0028);
//   - the weekly survey open and not answered (resolveOpenSurvey);
//   - a sign-out sent back (signout.js loadMySignout().returned) while the
//     member is still checked in: Home already shows it on the status card,
//     so here it is a one-line pointer to it.
// Pure: tests/do-this-now.test.js drives it.

const ONBOARDING = {
  first_registration: { title: 'Register with FIRST', detail: 'You, plus a parent accepting the Consent and Release', to: '/standing' },
  discord: { title: 'Join the team Discord', detail: 'Then tick it on your checklist', to: '/standing' },
  groupme: { title: 'Have a parent join the GroupMe', detail: 'Then tick it on your checklist', to: '/standing' },
  student_signed: { title: 'Sign the handbook', detail: 'Read each part, pass its check, then sign', to: '/handbook' },
  medical: { title: 'Emergency information', detail: 'A parent enters it from the family link', to: '/standing' },
}

/**
 * items: [{ key, title, detail, to, tone: 'urgent' | 'todo', due? }]
 * Order: things that block today (sent-back sign-out), then deadlines
 * (family sign-up), then the checklist, then the survey.
 */
export function doThisNow({ onboarding = null, notices = [], survey = null, sentBack = null, roleBoards = [], now = Date.now() } = {}) {
  const items = []
  if (sentBack) items.push({ key: 'signout', title: 'Your sign-out was sent back', detail: sentBack.reason ? `Mentor: ${sentBack.reason}` : 'Finish up, then ask again', to: '/dashboard#status', tone: 'urgent' })
  const seen = new Set()
  for (const n of notices) {
    if (n.kind !== 'signup' || n.read_at) continue
    const trip = String(n.title ?? '').replace(/^Family sign-up needed:\s*/i, '').trim()
    if (!trip || seen.has(trip)) continue
    if (Date.parse(n.created_at) < now - 21 * 864e5) continue // an old reminder for a trip long past
    seen.add(trip)
    items.push({ key: `signup:${trip}`, title: `Family sign-up for ${trip}`, detail: 'A parent finishes it from the trip link. Missing it can count as an absence.', to: '/trips', tone: 'urgent', notice: n.id })
  }
  // An upcoming event whose role board still has unfilled slots (0028).
  for (const b of roleBoards ?? []) {
    if (!b?.event_id || !(b.unfilled > 0)) continue
    items.push({ key: `roles:${b.event_id}`, title: `Pick your roles for ${b.title}`, detail: `${b.unfilled} time slot role${b.unfilled === 1 ? '' : 's'} still unfilled${b.mine ? ` · you asked for ${b.mine}` : ''}`, to: `/roles/${b.event_id}`, tone: b.mine ? 'todo' : 'urgent' })
  }
  if (onboarding && onboarding.items && onboarding.done !== true) {
    const due = onboarding.due ? Date.parse(`${onboarding.due}T23:59:59-08:00`) : null
    for (const it of onboarding.items) {
      if (it.done || !ONBOARDING[it.key]) continue
      items.push({ key: `onboarding:${it.key}`, ...ONBOARDING[it.key], tone: due && due < now + 3 * 864e5 ? 'urgent' : 'todo', due: onboarding.due ?? null })
    }
  }
  if (survey && !survey.answered) items.push({ key: 'survey', title: 'Weekly survey', detail: survey.title || 'A short check-in about your week', to: '/survey', tone: 'todo' })
  return items
}
