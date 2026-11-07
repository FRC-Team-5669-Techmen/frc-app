// One page inventory for the tour and search. Never query team data or invent
// private token URLs here. Parameter pages use their chooser until a matching
// event/trip/match is already open; the result tells the person that next step.
import { GUIDE, AREAS, guideFor } from './featureGuide.js'
import { TOOLS } from './adminTools.js'

export const PRIVATE_LINKS = Object.freeze({
  '/family/:token': 'Use the private family link sent by email.',
  '/parent/:token': 'Use the questionnaire link sent by email.',
  '/e/:token': 'Use the private trip link sent by email.',
})
const CHOOSERS = Object.freeze({
  '/trips/:id': ['/trips', 'Choose a trip'],
  '/trips/:id/manage': ['/trips', 'Choose a trip, then Mentor page'],
  '/rosters/:id': ['/rosters', 'Choose an event'],
  '/roles/:eventId': ['/rosters', 'Choose an event, then Role board'],
  '/scouting/:eventId': ['/scouting', 'Choose an event'],
  '/scouting/:eventId/board': ['/scouting', 'Choose an event, then Pick board'],
  '/meet/:eventId': ['/meet', 'Choose a competition'],
  '/robot/matches/:id': ['/robot/matches', 'Choose a match'],
  '/join/:eventId': ['/join', 'Choose your student and trip'],
})
const WORDS = Object.freeze({
  '/profile': 'onboarding account settings appearance notifications calendar',
  '/standing': 'onboarding checklist eligibility absence probation attendance',
  '/handbook': 'onboarding rules safety agreement sign',
  '/certifications': 'onboarding training learn skills idea',
  '/jobs': 'build task work contribute claim',
  '/my-schedule': 'competition station shift ride today next',
  '/drivers': 'drive practice mosim leaderboard',
  '/scouting': 'scout lead assignments offline prepare',
  '/driver-docs': 'license insurance transport paperwork',
})
const STEPS = ['/standing', '/handbook', '/certifications', '/jobs', '/survey', '/my-schedule']

export function pageCommands({ isStaff = false, isAdmin = false, isParent = false, canApproveSignouts = false, memberId = '', pathname = '' } = {}) {
  const parentOnly = isParent && !isStaff
  const pages = guideFor({ isStaff, isAdmin, isParent })
  if (!isStaff && !parentOnly && canApproveSignouts) pages.push(GUIDE.find(g => g.path === '/signouts'))
  return pages.filter(g => !PRIVATE_LINKS[g.path]).map(g => {
    let to = g.path, hint = ''
    if (g.path === '/connector/*') to = '/connector'
    else if (g.path === '/members/:id') { to = memberId ? `/members/${encodeURIComponent(memberId)}` : '/hours'; hint = 'Your member page. Open other members from Team Hours.' }
    else if (CHOOSERS[g.path]) {
      const match = pathname.match(/^\/(scouting|roles|meet|trips|rosters|robot\/matches)\/([^/]+)(?:\/|$)/)
      const family = g.path.split('/:')[0].slice(1)
      if (match && (match[1] === family || (['roles', 'rosters'].includes(family) && ['roles', 'rosters'].includes(match[1])))) {
        to = g.path.replace(/:[^/]+/, match[2])
      } else [to, hint] = CHOOSERS[g.path]
    }
    const step = !parentOnly && !isStaff && STEPS.includes(g.path)
    return { ...g, to, hint, group: step ? 'Your next step' : parentOnly && g.area === 'staff' ? 'Family records' : AREAS.find(a => a.key === g.area).title,
      words: `${WORDS[g.path] ?? ''} ${TOOLS.find(t => t.path === g.path)?.words ?? ''}` }
  }).sort((a, b) => Number(b.group === 'Your next step') - Number(a.group === 'Your next step') || (a.group === 'Your next step' && b.group === 'Your next step' ? STEPS.indexOf(a.path) - STEPS.indexOf(b.path) : 0))
}

const normalize = s => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export function searchCommands(commands, query = '') {
  const words = normalize(query).split(' ').filter(Boolean)
  if (!words.length) return commands
  return commands.filter(c => {
    const haystack = normalize(`${c.title} ${c.path} ${c.what} ${c.words} ${c.hint} ${c.group}`)
    return words.every(w => haystack.includes(w))
  }).sort((a, b) => Number(normalize(b.title).startsWith(normalize(query))) - Number(normalize(a.title).startsWith(normalize(query))))
}
