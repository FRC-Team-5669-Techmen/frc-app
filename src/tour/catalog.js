import { guideFor } from '../featureGuide.js'

export const CORE_VERSION = 1
export const TRACK_NAMES = {
  member: 'Member',
  scout: 'Scout',
  driver: 'Driver',
  pit: 'Pit',
  mentor: 'Mentor',
  parent: 'Parent',
}
export function tracksFor({ isParent = false, isStaff = false } = {}) {
  return isParent && !isStaff
    ? ['parent']
    : ['member', 'scout', 'driver', 'pit', ...(isStaff ? ['mentor'] : [])]
}
const core = [
  {
    id: 'attendance',
    path: '/dashboard',
    target: 'status-card',
    title: 'Check in at the door',
    text: 'Tap the FRC door tag at the shop. Confirm check-in and wait for the receipt. The FLL room tag records volunteer time separately. Finish build sign-out approval before scanning for FLL. Read your live status here.',
    exercise: 'attendance',
  },
  {
    id: 'checkout',
    path: '/dashboard',
    target: 'status-card',
    title: 'Leave with a sign-out',
    text: 'Tap the tag again or use Check out on Home. Write what you did and confirm cleanup. A student build session stays open until an approver approves. FLL and staff sign out directly.',
    exercise: 'checkout',
  },
  {
    id: 'absence',
    path: '/training?lesson=absence',
    target: 'absence-practice',
    title: 'Make an absence request',
    text: 'Practice the same form used on My standing. Pick the sample meeting, a permitted reason and a note. This practice sends nothing to a mentor.',
    exercise: 'absence',
  },
  {
    id: 'schedule',
    path: '/schedule',
    target: 'schedule-view',
    title: 'Find the schedule',
    text: 'Switch between Month and Agenda with the highlighted controls. Event times use Los Angeles time. Open an event to find RSVP, trips and rosters.',
    action: 'click',
  },
  {
    id: 'roles',
    path: '/roles/:eventId',
    target: 'role-board',
    title: 'Ask for an event role',
    text: 'The board has a box per role and time slot. I can do this adds a request. Staff assign or mark a backup. Asking alone does not put you on shift. My shifts opens your schedule.',
    exercise: 'roles',
  },
  {
    id: 'scouting',
    path: '/scouting/practice',
    target: 'scout-practice',
    title: 'Practice scouting',
    text: 'Open a mission here before scouting at an event. At an event use Scout this, Teams, Pit messages and Pick lists. Prepare online before going offline. Saved on this device is different from synced.',
    exercise: 'scouting',
  },
  {
    id: 'batteries',
    path: '/batteries',
    target: 'battery-filters',
    title: 'Find a ready battery',
    text: 'Try a filter. Match-ready means a charged competition battery with no check flag. Open a battery for history; Log a run records measurements. Leave unmeasured fields blank.',
    action: 'click',
  },
  {
    id: 'matches',
    path: '/robot/matches',
    target: 'match-views',
    title: 'Read the match log',
    text: 'Try Log, Trends and Compare. Open a match for its timeline, battery, notes and video. Select two to six matches to compare. Only match loggers and staff import or edit.',
    action: 'click',
  },
  {
    id: 'feedback',
    path: '/dashboard',
    target: 'feedback-launcher',
    title: 'Find help and report a problem',
    text: 'Open the feedback button, then close it without sending. A real report can include what happened, what you tried and a screenshot. Your reports holds the answer.',
    action: 'click',
  },
]
const quiz = {
  attendance: {
    question: 'Which tag records FRC build time?',
    answers: ['The FRC door tag', 'The FLL room tag'],
    correct: 0,
  },
  roles: {
    question: 'Which status tells you to report for a shift?',
    answers: ['Assigned', 'Asked'],
    correct: 0,
  },
  scouting: {
    question: 'You saved offline. Has the team received it yet?',
    answers: [
      'Only after synchronization confirms it',
      'Yes, any local save is shared',
    ],
    correct: 0,
  },
  parent: {
    question: 'Where does your family manage trip sign-ups?',
    answers: ['The private family trip link', 'The battery log'],
    correct: 0,
  },
}
export { quiz }
const priority = {
  member: [],
  scout: [
    '/scouting',
    '/scouting/:eventId',
    '/scouting/:eventId/board',
    '/meet',
  ],
  driver: ['/drivers', '/autos', '/match-sim', '/human-player'],
  pit: ['/batteries', '/autos', '/jobs', '/status-reports'],
  mentor: ['/manage', '/signouts', '/standing/team', '/training'],
  parent: [],
}
export function tourFor(track, context = {}) {
  if (!tracksFor(context).includes(track)) return []
  const parent = track === 'parent'
  const required = parent
    ? [
        {
          id: 'parent-home',
          path: '/dashboard',
          target: 'parent-home',
          title: 'Your family dashboard',
          text: 'Read each linked student status and hours. If a student is missing, request a family link here. A mentor reviews the request.',
          exercise: 'parent',
        },
        { id: 'schedule', ...core.find((s) => s.id === 'schedule') },
        {
          id: 'parent-standing',
          path: '/training?lesson=parent-standing',
          target: 'feature-reference',
          title: 'Standing and absence requests',
          text: 'Open Standing from your student on Home or use your private family link. Students request their own absences on My standing. The family link carries emergency information, checklist and handbook signing.',
          exercise: 'parent',
        },
        core.find((s) => s.id === 'feedback'),
      ]
    : core
  const covered = new Set(required.map((s) => s.path))
  // Private capability links and NFC routes are taught in a reference card.
  // Never fabricate a token or navigate to check-in, which can write on arrival.
  const library = guideFor(context)
    .filter((g) => !covered.has(g.path))
    .map((g) => ({
      id: `feature:${g.path}`,
      path: g.path,
      target: 'feature-page',
      title: g.title,
      text: `${g.what} Find it: ${g.where}.`,
      reference: /:token|\/connector|^\/checkin|^\/join|^\/rules/.test(g.path),
      guidePath: g.path,
    }))
  library.sort((a, b) => {
    const rank = (p) => {
      const n = priority[track].indexOf(p)
      return n < 0 ? 999 : n
    }
    return rank(a.path) - rank(b.path)
  })
  return [...required.map((s) => ({ ...s, core: true })), {
    id: 'navigation-search',
    path: '/dashboard',
    target: 'nav-search',
    title: 'Find any page',
    text: 'Open Search, type a page or task, then close it with Escape. You can also open Search with Ctrl+K or Command+K. In the account menu, My record holds your records and Preferences holds the theme and this training. Continue when Search is closed.',
    action: 'click',
  }, ...library]
}
export function routeFor(step, eventId, memberId) {
  if (step.reference)
    return `/training?feature=${encodeURIComponent(step.guidePath)}`
  if (step.path.includes(':') && !eventId && !step.path.includes(':id'))
    return null
  if (step.path === '/members/:id') return `/members/${memberId}`
  // A trip and a robot match have their own id spaces, never an event id.
  if (/^\/trips\/:id|^\/robot\/matches\/:id/.test(step.path))
    return `/training?feature=${encodeURIComponent(step.guidePath)}`
  if (step.path.includes(':') && !eventId) return null
  return step.path.replace(':eventId', eventId).replace(':id', eventId)
}
